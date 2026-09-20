'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { createAdapter } = require('../adapters');
const {
  injectSlotsWithMeta,
} = require('./inject');
const client = require('./client');
const store = require('./workflowStore');

const serialState = new Map();

function runSerialized(baseUrl, log, fn) {
  const key = String(baseUrl || '').replace(/\/+$/, '') || 'default';
  const state = serialState.get(key) || { tail: Promise.resolve(), queued: 0 };
  state.queued += 1;
  if (state.queued > 1 && log) {
    log.info('[comfyui] comfyui 协议已串行化', { base_url: key, queue: state.queued });
  }
  const run = state.tail.then(fn, fn).finally(() => {
    state.queued -= 1;
    if (state.queued <= 0) serialState.delete(key);
  });
  state.tail = run.then(() => {}, () => {});
  serialState.set(key, state);
  return run;
}

function clipError(err) {
  const msg = err && err.message ? err.message : String(err || '未知错误');
  return msg.slice(0, 500);
}

function mimeFromName(filename, kind) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return kind === 'video' ? 'image/gif' : 'image/gif';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp4') return 'video/mp4';
  if (kind === 'video') return 'video/mp4';
  return 'image/png';
}

function extFromMime(mime, filename) {
  const fromName = path.extname(String(filename || '')).toLowerCase();
  if (fromName) return fromName;
  const m = String(mime || '').toLowerCase();
  if (m.includes('jpeg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('webm')) return '.webm';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  if (m.includes('mp4') || m.includes('video')) return '.mp4';
  return '.png';
}

function parseDataUrl(s) {
  const m = String(s || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function downloadHttpBuffer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) {
      reject(new Error(`无效图片地址: ${url}`));
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 30000;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: ms,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        return resolve(downloadHttpBuffer(loc, timeoutMs));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        mime: res.headers['content-type'] || 'application/octet-stream',
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`下载超时 (${ms}ms)`)); });
    req.on('error', reject);
    req.end();
  });
}

function resolveLocalPath(value, storageLocalPath) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^file:\/\//i.test(s)) {
    try {
      return decodeURIComponent(s.replace(/^file:\/\//i, '').replace(/^\/([a-zA-Z]:)/, '$1'));
    } catch (_) {
      return s.replace(/^file:\/\//i, '');
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(s) || (s.startsWith('/') && !s.startsWith('//'))) {
    return s;
  }
  if (storageLocalPath && !/^https?:\/\//i.test(s) && !s.startsWith('data:')) {
    const rel = s.replace(/^\//, '');
    const afterStatic = rel.startsWith('static/') ? rel.slice(7) : rel;
    return path.join(storageLocalPath, afterStatic);
  }
  return null;
}

async function refToBuffer(value, storageLocalPath) {
  const s = String(value || '').trim();
  if (!s) return null;
  const data = parseDataUrl(s);
  if (data) return { buffer: data.buffer, mime: data.mime, filename: `ref${extFromMime(data.mime)}` };
  if (/^https?:\/\//i.test(s)) {
    const got = await downloadHttpBuffer(s);
    return { buffer: got.buffer, mime: got.mime, filename: path.basename(s.split('?')[0]) || `ref${extFromMime(got.mime)}` };
  }
  const local = resolveLocalPath(s, storageLocalPath);
  if (local && fs.existsSync(local) && fs.statSync(local).isFile()) {
    const buf = fs.readFileSync(local);
    const ext = path.extname(local).toLowerCase() || '.png';
    return { buffer: buf, mime: mimeFromName(local), filename: `ref${ext}` };
  }
  return null;
}

async function uploadRefs(config, urls, storageLocalPath, log, label) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : (urls ? [urls] : []);
  const names = [];
  for (let i = 0; i < list.length; i++) {
    let converted;
    try {
      converted = await refToBuffer(list[i], storageLocalPath);
    } catch (e) {
      if (log) log.warn(`[comfyui] ${label || '参考图'}读取失败`, { index: i, error: e.message });
      continue;
    }
    if (!converted) {
      if (log) log.warn(`[comfyui] ${label || '参考图'}无法解析`, { index: i });
      continue;
    }
    const filename = `lmd_${label || 'ref'}_${i}_${Date.now()}${extFromMime(converted.mime, converted.filename)}`;
    const uploaded = await client.uploadImage(config, converted.buffer, filename, converted.mime);
    names.push(uploaded.name);
  }
  return names;
}

function settingsOf(config) {
  return store.parseSettings(config);
}

function timeoutSecondsFor(settings, fallback) {
  const n = Number(settings && settings.timeout_seconds);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pollIntervalFor(settings) {
  const n = Number(settings && settings.poll_interval_ms);
  if (Number.isFinite(n) && n >= 0) return n;
  return undefined;
}

function fmtVram(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}MB`;
  return String(n);
}

async function testConnection(opts) {
  const base = String(opts.base_url || '').replace(/\/+$/, '');
  if (!base) throw new Error('base_url 必填');
  let stats;
  try {
    stats = await client.systemStats({ base_url: base }, 15000);
  } catch (e) {
    throw new Error(e.message && e.message.includes('无法连接 ComfyUI')
      ? e.message
      : `无法连接 ComfyUI (${base}/system_stats): ${e.message || e}`);
  }
  const version = (stats && stats.system && (stats.system.comfyui_version || stats.system.version)) || '';
  const device = Array.isArray(stats && stats.devices) ? stats.devices[0] : null;
  const vram = device ? (fmtVram(device.vram_free) && fmtVram(device.vram_total)
    ? `显存 ${fmtVram(device.vram_free)}/${fmtVram(device.vram_total)}`
    : (device.name || '')) : '';
  let workflows = [];
  try {
    workflows = store.listWorkflowNames(opts);
  } catch (_) {}
  const wfText = workflows.length ? `工作流: ${workflows.join(', ')}` : '工作流目录为空，请导入 API 格式 JSON';
  const bits = ['已连接 ComfyUI'];
  if (version) bits[0] += ` ${version}`;
  if (vram) bits.push(vram);
  bits.push(wfText);
  return { message: bits.join('，'), version, workflows };
}

async function submitImage(config, log, opts) {
  const started = Date.now();
  return runSerialized(config.base_url, log, async () => {
    try {
      const settings = settingsOf(config);
      const model = opts.model;
      const workflow = store.loadWorkflow({ ...config, storage_local_path: opts.storage_local_path }, model);
      const mapping = store.mappingForModel(settings, model);
      const refUrls = opts.reference_image_urls || opts.reference_urls || [];
      let uploaded = [];
      if (Array.isArray(refUrls) && refUrls.length) {
        uploaded = await uploadRefs(config, refUrls, opts.storage_local_path, log, 'ref');
      }
      const { workflow: injected, report, warnings } = injectSlotsWithMeta(workflow, {
        prompt: opts.prompt || '',
        negative_prompt: opts.negative_prompt || '',
        size: opts.size,
        seed: opts.seed,
        reference_images: uploaded,
      }, mapping);
      if (warnings && warnings.length && log) {
        for (const w of warnings) log.warn(`[comfyui图生] ${w}`, { image_gen_id: opts.image_gen_id });
      }
      const queued = await client.queuePrompt(config, injected, settings.client_id || 'localminidrama');
      if (queued.error) {
        return { error: clipError(queued.error) };
      }
      if (log) {
        log.info('[comfyui图生] 已提交', {
          prompt_id: queued.prompt_id,
          image_gen_id: opts.image_gen_id,
          model,
          injected_nodes: report.map((r) => r.node),
        });
      }
      const polled = await client.pollHistory(config, queued.prompt_id, {
        timeoutSeconds: timeoutSecondsFor(settings, 1800),
        intervalMs: pollIntervalFor(settings),
        prefer: 'image',
      });
      if (polled.error) return { error: clipError(polled.error) };
      const buf = await client.viewFile(config, polled.media, 120000);
      const mime = mimeFromName(polled.media.filename, 'image');
      const imageUrl = `data:${mime};base64,${buf.toString('base64')}`;
      if (log) {
        log.info('[comfyui图生] 完成', {
          prompt_id: queued.prompt_id,
          image_gen_id: opts.image_gen_id,
          ms: Date.now() - started,
          injected_nodes: report.map((r) => r.node),
        });
      }
      return { image_url: imageUrl };
    } catch (e) {
      return { error: clipError(e) };
    }
  });
}

function writeTempMedia(buffer, media, promptId) {
  const ext = extFromMime(mimeFromName(media && media.filename, media && media.kind), media && media.filename);
  const tmpPath = path.join(os.tmpdir(), `comfy_${promptId || Date.now()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

async function submitVideo(config, log, opts) {
  const started = Date.now();
  return runSerialized(config.base_url, log, async () => {
    try {
      const settings = settingsOf(config);
      const model = opts.model;
      const workflow = store.loadWorkflow({ ...config, storage_local_path: opts.storage_local_path }, model);
      const mapping = store.mappingForModel(settings, model);

      const freeBefore = settings.free_before_video !== false;
      if (freeBefore) {
        try {
          const freed = await client.freeMemory(config);
          if (!freed.ok && log) log.warn('[comfyui视频] POST /free 失败，继续提交', { error: freed.error });
        } catch (e) {
          if (log) log.warn('[comfyui视频] POST /free 失败，继续提交', { error: e.message });
        }
      }

      const firstSrc = opts.first_frame_url || opts.image_url || '';
      const lastSrc = opts.last_frame_url || '';
      const extraRefs = opts.reference_urls || opts.reference_image_urls || [];
      const firstNames = firstSrc ? await uploadRefs(config, [firstSrc], opts.storage_local_path, log, 'first') : [];
      const lastNames = lastSrc ? await uploadRefs(config, [lastSrc], opts.storage_local_path, log, 'last') : [];
      const refNames = extraRefs.length
        ? await uploadRefs(config, extraRefs, opts.storage_local_path, log, 'ref')
        : [];

      const { workflow: injected, report, warnings } = injectSlotsWithMeta(workflow, {
        prompt: opts.prompt || '',
        negative_prompt: opts.negative_prompt || '',
        size: opts.size,
        seed: opts.seed,
        duration: opts.duration != null ? Number(opts.duration) : undefined,
        fps: opts.fps != null ? Number(opts.fps) : 24,
        first_frame: firstNames[0] || '',
        last_frame: lastNames[0] || '',
        reference_images: refNames,
      }, mapping);
      if (warnings && warnings.length && log) {
        for (const w of warnings) log.warn(`[comfyui视频] ${w}`, { video_gen_id: opts.video_gen_id });
      }

      const queued = await client.queuePrompt(config, injected, settings.client_id || 'localminidrama');
      if (queued.error) return { error: clipError(queued.error) };
      if (log) {
        log.info('[comfyui视频] 已提交', {
          prompt_id: queued.prompt_id,
          video_gen_id: opts.video_gen_id,
          model,
          injected_nodes: report.map((r) => r.node),
        });
      }
      const polled = await client.pollHistory(config, queued.prompt_id, {
        timeoutSeconds: timeoutSecondsFor(settings, 3600),
        intervalMs: pollIntervalFor(settings),
        prefer: 'video',
      });
      if (polled.error) {
        if (polled.error.includes('未找到输出文件')) {
          return { error: '工作流需有 SaveVideo / VHS_VideoCombine / 其它会在 history 里产出 videos/gifs 的节点' };
        }
        return { error: clipError(polled.error) };
      }
      if (polled.media && polled.media.kind !== 'video') {
        return { error: '工作流需有 SaveVideo / VHS_VideoCombine / 其它会在 history 里产出 videos/gifs 的节点' };
      }
      const buf = await client.viewFile(config, polled.media, 600000);
      const tmpPath = writeTempMedia(buf, polled.media, queued.prompt_id);
      if (log) {
        log.info('[comfyui视频] 完成', {
          prompt_id: queued.prompt_id,
          video_gen_id: opts.video_gen_id,
          ms: Date.now() - started,
          tmp: tmpPath,
        });
      }
      return { video_url: tmpPath };
    } catch (e) {
      return { error: clipError(e) };
    }
  });
}

createAdapter({
  id: 'comfyui',
  aliases: ['comfy', 'local_comfy'],
  auth: 'none',
  group: 'local',
  services: ['image', 'storyboard_image', 'video'],
  defaultEndpoints: {
    image: { endpoint: '/prompt', query: '/history/{taskId}' },
    storyboard_image: { endpoint: '/prompt', query: '/history/{taskId}' },
    video: { endpoint: '/prompt', query: '/history/{taskId}' },
  },
  infer: (ctx) => {
    const p = String(ctx.provider || '').toLowerCase();
    if (p === 'comfyui' || p === 'comfy' || p === 'local_comfy') return true;
    const b = String(ctx.baseUrl || '').toLowerCase();
    if (b.includes('runninghub')) return false;
    return b.includes(':8188');
  },
  testConnection,
  submitImage,
  submitVideo,
  async pollVideo() {
    return { error: 'ComfyUI 视频在提交时已轮询完成，不应再次查询' };
  },
});

module.exports = {
  testConnection,
  submitImage,
  submitVideo,
  runSerialized,
  uploadRefs,
};
