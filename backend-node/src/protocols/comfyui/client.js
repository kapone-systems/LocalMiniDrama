'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { sleep, pollIntervalMs } = require('../http');
const {
  extractHistoryMedia,
  unwrapHistoryEntry,
  formatNodeErrors,
  hasNodeErrors,
} = require('./inject');

function comfyPollMax() {
  const n = parseInt(process.env.COMFY_POLL_MAX || '900', 10);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

function originBase(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function joinPath(baseUrl, pathname, search) {
  const base = originBase(baseUrl);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return base + path + (search || '');
}

function requestRaw(method, url, { headers, body, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error(`无效的 ComfyUI 地址: ${url}`));
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 120000;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method || 'GET',
      headers: headers || {},
      timeout: ms,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers || {},
          buffer: Buffer.concat(chunks),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`请求超时 (${ms}ms)`));
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

function connectError(url, err) {
  const msg = err && err.message ? err.message : String(err || '未知错误');
  return new Error(`无法连接 ComfyUI (${url}): ${msg}`);
}

async function requestJson(method, url, { body, timeoutMs, headers } = {}) {
  const hdrs = {
    Accept: 'application/json',
    ...(headers || {}),
  };
  let payload = body;
  if (payload != null && !Buffer.isBuffer(payload) && typeof payload !== 'string') {
    hdrs['Content-Type'] = hdrs['Content-Type'] || 'application/json';
    payload = JSON.stringify(payload);
  }
  let res;
  try {
    res = await requestRaw(method, url, { headers: hdrs, body: payload, timeoutMs });
  } catch (e) {
    throw connectError(url, e);
  }
  const raw = res.buffer.toString('utf8');
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch (_) { json = null; }
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json,
    raw,
    error: res.status >= 200 && res.status < 300 ? '' : (`HTTP ${res.status}` + (raw ? `: ${raw.slice(0, 240)}` : '')),
    url,
  };
}

function encodeMultipart(fields, file) {
  const boundary = '----LMDComfy' + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v == null) continue;
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`
    ));
  }
  if (file && file.buffer) {
    const filename = file.filename || 'upload.png';
    const contentType = file.contentType || 'application/octet-stream';
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ));
    parts.push(Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function systemStats(config, timeoutMs) {
  const url = joinPath(config.base_url, '/system_stats');
  const res = await requestJson('GET', url, { timeoutMs: timeoutMs || 15000 });
  if (!res.ok) {
    throw new Error(res.error || `无法连接 ComfyUI (${url})`);
  }
  return res.json;
}

async function freeMemory(config) {
  const url = joinPath(config.base_url, '/free');
  return requestJson('POST', url, {
    body: { unload_models: true, free_memory: true },
    timeoutMs: 30000,
  });
}

async function uploadImage(config, buffer, filename, contentType) {
  const url = joinPath(config.base_url, '/upload/image');
  const { body, contentType: ct } = encodeMultipart(
    { overwrite: 'true', type: 'input', subfolder: '' },
    { buffer, filename: filename || 'upload.png', contentType: contentType || 'image/png' }
  );
  let res;
  try {
    res = await requestRaw('POST', url, {
      headers: {
        Accept: 'application/json',
        'Content-Type': ct,
        'Content-Length': Buffer.byteLength(body),
      },
      body,
      timeoutMs: 120000,
    });
  } catch (e) {
    throw connectError(url, e);
  }
  const raw = res.buffer.toString('utf8');
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch (_) { json = null; }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`上传参考图失败: HTTP ${res.status}${raw ? `: ${raw.slice(0, 240)}` : ''}`);
  }
  const name = json && (json.name || json.filename);
  if (!name) {
    throw new Error('上传参考图未返回文件名: ' + raw.slice(0, 220));
  }
  return {
    name: String(name),
    subfolder: json.subfolder || '',
    type: json.type || 'input',
  };
}

async function queuePrompt(config, workflow, clientId) {
  const url = joinPath(config.base_url, '/prompt');
  const res = await requestJson('POST', url, {
    body: {
      prompt: workflow,
      client_id: clientId || 'localminidrama',
    },
    timeoutMs: 120000,
  });
  if (!res.ok) {
    const formatted = formatNodeErrors(res.json);
    throw new Error(formatted || res.error || `提交工作流失败: HTTP ${res.status}`);
  }
  if (hasNodeErrors(res.json)) {
    return {
      error: formatNodeErrors(res.json) || 'ComfyUI 节点错误',
      node_errors: res.json.node_errors,
      json: res.json,
    };
  }
  const promptId = res.json && (res.json.prompt_id || res.json.promptId);
  if (!promptId) {
    return { error: 'ComfyUI 未返回 prompt_id: ' + (res.raw || '').slice(0, 220), json: res.json };
  }
  return { prompt_id: String(promptId), json: res.json };
}

async function getHistory(config, promptId) {
  const url = joinPath(config.base_url, `/history/${encodeURIComponent(String(promptId))}`);
  const res = await requestJson('GET', url, { timeoutMs: 30000 });
  if (!res.ok) {
    throw new Error(res.error || `查询 ComfyUI 历史失败: HTTP ${res.status}`);
  }
  return res.json;
}

async function viewFile(config, media, timeoutMs) {
  const filename = media && media.filename;
  if (!filename) throw new Error('缺少输出文件名');
  const params = new URLSearchParams({
    filename: String(filename),
    subfolder: String(media.subfolder || ''),
    type: String(media.type || 'output'),
  });
  const url = joinPath(config.base_url, '/view', `?${params.toString()}`);
  let res;
  try {
    res = await requestRaw('GET', url, {
      headers: { Accept: '*/*' },
      timeoutMs: timeoutMs || 600000,
    });
  } catch (e) {
    throw connectError(url, e);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`下载 ComfyUI 输出失败: HTTP ${res.status}`);
  }
  return res.buffer;
}

async function pollHistory(config, promptId, opts) {
  const options = opts || {};
  const max = options.maxAttempts || comfyPollMax();
  const interval = options.intervalMs != null ? Number(options.intervalMs) : pollIntervalMs();
  const timeoutSeconds = Number(options.timeoutSeconds) > 0 ? Number(options.timeoutSeconds) : 1800;
  const timeoutMs = timeoutSeconds * 1000;
  const prefer = options.prefer || 'image';
  const start = Date.now();
  for (let i = 0; i < max; i++) {
    if (i > 0 && interval > 0) await sleep(interval);
    if (Date.now() - start > timeoutMs) {
      return { error: `等待 ComfyUI 生成超时（${timeoutSeconds}s）` };
    }
    let hist;
    try {
      hist = await getHistory(config, promptId);
    } catch (e) {
      if (i === max - 1) return { error: e.message || String(e) };
      continue;
    }
    const entry = unwrapHistoryEntry(hist, promptId);
    const media = extractHistoryMedia(entry || hist, { prefer, promptId });
    if (media.error) return media;
    if (media.pending) continue;
    if (media.filename) {
      return { prompt_id: promptId, entry, media };
    }
  }
  return { error: '等待 ComfyUI 生成超时' };
}

async function runPromptToBuffer(config, workflow, opts) {
  const options = opts || {};
  const queued = await queuePrompt(config, workflow, options.client_id);
  if (queued.error) return queued;
  const polled = await pollHistory(config, queued.prompt_id, options);
  if (polled.error) return polled;
  const buffer = await viewFile(config, polled.media, options.viewTimeoutMs);
  return {
    prompt_id: queued.prompt_id,
    media: polled.media,
    buffer,
  };
}

module.exports = {
  comfyPollMax,
  originBase,
  systemStats,
  freeMemory,
  uploadImage,
  queuePrompt,
  getHistory,
  viewFile,
  pollHistory,
  runPromptToBuffer,
  requestJson,
  requestRaw,
};
