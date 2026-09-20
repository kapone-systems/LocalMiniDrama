process.env.PROTOCOL_POLL_INTERVAL_MS = '0';
process.env.COMFY_POLL_MAX = '8';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getProtocol } = require('../src/protocols');
const client = require('../src/protocols/comfyui/client');
const store = require('../src/protocols/comfyui/workflowStore');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const silentLog = { info() {}, warn() {}, error() {} };

function minimalT2i() {
  return {
    '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] }, _meta: { title: 'KSampler' } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'PUT_YOUR_CHECKPOINT_HERE.safetensors' }, _meta: { title: 'Load Checkpoint' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 }, _meta: { title: 'Empty Latent Image' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'hardcoded', clip: ['4', 1] }, _meta: { title: 'Positive' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'neg', clip: ['4', 1] }, _meta: { title: 'Negative' } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] }, _meta: { title: 'VAE Decode' } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] }, _meta: { title: 'Save Image' } },
  };
}

function t2iWithRefs() {
  const wf = minimalT2i();
  wf['10'] = { class_type: 'LoadImage', inputs: { image: 'empty.png' }, _meta: { title: 'Reference Image 1' } };
  wf['11'] = { class_type: 'LoadImage', inputs: { image: 'empty.png' }, _meta: { title: 'Reference Image 2' } };
  return wf;
}

function i2vWorkflow() {
  const wf = minimalT2i();
  wf['20'] = { class_type: 'LoadImage', inputs: { image: 'empty.png' }, _meta: { title: 'First Frame' } };
  wf['21'] = { class_type: 'LoadImage', inputs: { image: 'empty.png' }, _meta: { title: 'Last Frame' } };
  wf['22'] = { class_type: 'PrimitiveInt', inputs: { value: 5 }, _meta: { title: 'Duration' } };
  wf['23'] = { class_type: 'VHS_VideoCombine', inputs: { frame_rate: 24, filename_prefix: 'video' }, _meta: { title: 'Video Combine' } };
  return wf;
}

function startComfyFake(opts = {}) {
  const requests = [];
  let historyHits = 0;
  const mode = opts.mode || 'image';
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const urlPath = req.url.split('?')[0];
      let body = {};
      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (_) { body = {}; }
      }
      requests.push({ method: req.method, url: req.url, path: urlPath, body, contentType: ct, size: buf.length });

      const sendJson = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.method === 'GET' && urlPath === '/system_stats') {
        return sendJson(200, { system: { comfyui_version: 'test' }, devices: [{ name: 'fake', vram_total: 8e9, vram_free: 4e9 }] });
      }
      if (req.method === 'POST' && urlPath === '/upload/image') {
        const n = requests.filter((r) => r.path === '/upload/image').length;
        return sendJson(200, { name: `ref${n}.png`, subfolder: '', type: 'input' });
      }
      if (req.method === 'POST' && urlPath === '/free') {
        return sendJson(200, { status: 'ok' });
      }
      if (req.method === 'POST' && urlPath === '/prompt') {
        if (opts.nodeErrors) {
          return sendJson(200, {
            prompt_id: 'p1',
            node_errors: {
              '4': {
                class_type: 'CheckpointLoaderSimple',
                errors: [{ details: "ckpt_name: 'missing.safetensors' not in list" }],
              },
            },
          });
        }
        if (!body.prompt || typeof body.prompt !== 'object') {
          return sendJson(400, { error: 'prompt must be object' });
        }
        return sendJson(200, { prompt_id: 'p1', node_errors: {} });
      }
      if (req.method === 'GET' && urlPath === '/history/p1') {
        historyHits += 1;
        if (historyHits === 1 && opts.pendingFirst !== false) {
          return sendJson(200, {});
        }
        if (mode === 'video') {
          return sendJson(200, {
            p1: {
              outputs: {
                '23': { gifs: [{ filename: 'out.mp4', subfolder: '', type: 'output' }] },
              },
              status: { status_str: 'success', completed: true },
            },
          });
        }
        return sendJson(200, {
          p1: {
            outputs: {
              '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] },
            },
            status: { status_str: 'success', completed: true },
          },
        });
      }
      if (req.method === 'GET' && urlPath === '/view') {
        res.writeHead(200, { 'Content-Type': mode === 'video' ? 'video/mp4' : 'image/png' });
        res.end(PNG_1X1);
        return;
      }
      sendJson(404, { error: 'not found', path: urlPath });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe('comfy HTTP client (fake server)', () => {
  it('queues, polls history twice, and views a buffer', async () => {
    const srv = await startComfyFake();
    try {
      const queued = await client.queuePrompt({ base_url: srv.base }, minimalT2i(), 'localminidrama');
      assert.equal(queued.prompt_id, 'p1');
      const polled = await client.pollHistory({ base_url: srv.base }, 'p1', { timeoutSeconds: 30, intervalMs: 0 });
      assert.equal(polled.media.filename, 'out.png');
      const buf = await client.viewFile({ base_url: srv.base }, polled.media);
      assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
      const histGets = srv.requests.filter((r) => r.path === '/history/p1');
      assert.ok(histGets.length >= 2);
    } finally {
      await srv.close();
    }
  });

  it('returns node_errors without polling', async () => {
    const srv = await startComfyFake({ nodeErrors: true });
    try {
      const queued = await client.queuePrompt({ base_url: srv.base }, minimalT2i());
      assert.ok(queued.error);
      assert.match(queued.error, /CheckpointLoaderSimple/);
      assert.equal(srv.requests.filter((r) => r.path.startsWith('/history')).length, 0);
    } finally {
      await srv.close();
    }
  });
});

describe('workflowStore', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmd-comfy-'));
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('loads a workflow from a fake dir and rejects path traversal', () => {
    const cfg = { settings: { workflows_dir: tmp } };
    fs.writeFileSync(path.join(tmp, 'character-t2i.json'), JSON.stringify(minimalT2i()));
    const loaded = store.loadWorkflow(cfg, 'character-t2i');
    assert.equal(loaded['6']._meta.title, 'Positive');
    assert.throws(() => store.resolveWorkflowPath(cfg, '../etc/passwd'));
    assert.throws(() => store.resolveWorkflowPath(cfg, '..\\etc\\passwd'));
  });

  it('lists existing names when a file is missing', () => {
    const cfg = { settings: { workflows_dir: tmp } };
    fs.writeFileSync(path.join(tmp, 'character-t2i.json'), JSON.stringify(minimalT2i()));
    assert.throws(
      () => store.loadWorkflow(cfg, 'no-such-wf'),
      (err) => /character-t2i/.test(err.message) && /找不到工作流/.test(err.message),
    );
  });
});

describe('adapter submitImage / submitVideo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lmd-comfy-ad-'));
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function cfg(base, extra) {
    return {
      base_url: base,
      api_key: '',
      api_protocol: 'comfyui',
      settings: JSON.stringify({ workflows_dir: tmp, timeout_seconds: 30, poll_interval_ms: 0, free_before_video: true }),
      ...extra,
    };
  }

  it('submitImage returns a data URL and injects the prompt', async () => {
    fs.writeFileSync(path.join(tmp, 'character-t2i.json'), JSON.stringify(minimalT2i()));
    const adapter = getProtocol('comfyui');
    const srv = await startComfyFake();
    try {
      const result = await adapter.submitImage(cfg(srv.base), silentLog, {
        prompt: 'a red fox in snow',
        model: 'character-t2i',
        size: '1024x1024',
        storage_local_path: tmp,
      });
      assert.ok(!result.error, result.error);
      assert.match(result.image_url, /^data:image\/png;base64,/);
      const promptReq = srv.requests.find((r) => r.path === '/prompt');
      assert.equal(promptReq.body.prompt['6'].inputs.text, 'a red fox in snow');
      assert.equal(promptReq.body.prompt['5'].inputs.width, 1024);
    } finally {
      await srv.close();
    }
  });

  it('uploads two reference images into LoadImage nodes', async () => {
    fs.writeFileSync(path.join(tmp, 'storyboard-i2i.json'), JSON.stringify(t2iWithRefs()));
    const adapter = getProtocol('comfyui');
    const srv = await startComfyFake();
    const dataUrl = `data:image/png;base64,${PNG_1X1.toString('base64')}`;
    try {
      const result = await adapter.submitImage(cfg(srv.base), silentLog, {
        prompt: 'same character walking',
        model: 'storyboard-i2i',
        reference_image_urls: [dataUrl, dataUrl],
        storage_local_path: tmp,
      });
      assert.ok(!result.error, result.error);
      const uploads = srv.requests.filter((r) => r.path === '/upload/image');
      assert.equal(uploads.length, 2);
      const promptReq = srv.requests.find((r) => r.path === '/prompt');
      assert.equal(promptReq.body.prompt['10'].inputs.image, 'ref1.png');
      assert.equal(promptReq.body.prompt['11'].inputs.image, 'ref2.png');
    } finally {
      await srv.close();
    }
  });

  it('submitVideo reads gifs[] and writes first/last frames', async () => {
    fs.writeFileSync(path.join(tmp, 'storyboard-i2v.json'), JSON.stringify(i2vWorkflow()));
    const adapter = getProtocol('comfyui');
    const srv = await startComfyFake({ mode: 'video' });
    const dataUrl = `data:image/png;base64,${PNG_1X1.toString('base64')}`;
    try {
      const result = await adapter.submitVideo(cfg(srv.base), silentLog, {
        prompt: 'camera pan',
        model: 'storyboard-i2v',
        duration: 4,
        first_frame_url: dataUrl,
        last_frame_url: dataUrl,
        storage_local_path: tmp,
      });
      assert.ok(!result.error, result.error);
      assert.ok(result.video_url);
      assert.ok(fs.existsSync(result.video_url));
      const uploads = srv.requests.filter((r) => r.path === '/upload/image');
      assert.equal(uploads.length, 2);
      const promptReq = srv.requests.find((r) => r.path === '/prompt');
      assert.equal(promptReq.body.prompt['20'].inputs.image, 'ref1.png');
      assert.equal(promptReq.body.prompt['21'].inputs.image, 'ref2.png');
      assert.equal(promptReq.body.prompt['22'].inputs.value, 4);
      assert.ok(srv.requests.some((r) => r.path === '/free'));
      try { fs.unlinkSync(result.video_url); } catch (_) {}
    } finally {
      await srv.close();
    }
  });

  it('submitVideo without last_frame does not fail', async () => {
    fs.writeFileSync(path.join(tmp, 'storyboard-i2v.json'), JSON.stringify(i2vWorkflow()));
    const adapter = getProtocol('comfyui');
    const srv = await startComfyFake({ mode: 'video' });
    try {
      const result = await adapter.submitVideo(cfg(srv.base), silentLog, {
        prompt: 'idle',
        model: 'storyboard-i2v',
        duration: 3,
        storage_local_path: tmp,
      });
      assert.ok(!result.error, result.error);
      try { if (result.video_url) fs.unlinkSync(result.video_url); } catch (_) {}
    } finally {
      await srv.close();
    }
  });
});
