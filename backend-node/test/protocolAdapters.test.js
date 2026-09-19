process.env.PROTOCOL_POLL_INTERVAL_MS = '0';
process.env.PROTOCOL_IMAGE_POLL_MAX = '8';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { listProtocols, getProtocol, inferFromRegistry } = require('../src/protocols');
const { extractImageUrl, extractTaskId, sizeToRatio } = require('../src/protocols/extract');
const { pollVideoTask } = require('../src/services/videoClient');

function startRouter(routes) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) {}
      const entry = { method: req.method, url: req.url, body };
      requests.push(entry);
      const key = `${req.method} ${req.url.split('?')[0]}`;
      const handler = routes[key] || routes[`${req.method} *`];
      const payload = typeof handler === 'function' ? handler(entry) : handler;
      if (!payload) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found', key }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
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

const silentLog = { info() {}, warn() {}, error() {} };

function cfg(base, extra) {
  return {
    base_url: base,
    api_key: 'sk-test',
    is_active: true,
    is_default: true,
    ...extra,
  };
}

describe('protocol registry', () => {
  it('registers aggregator and official families', () => {
    const ids = listProtocols().map((p) => p.id);
    for (const need of [
      'apimart', 'siliconflow', 'openrouter', 'fal', 'replicate', 'piapi', 'kie',
      'novita', 'minimax_hailuo', 'sora_official', 'jimeng_official', 'pixverse',
      'skyreels', 'runway', 'luma', 'pika', 'ideogram', 'midjourney', 'zhipu',
      'hunyuan', 'qianfan', 'spark', 'runninghub',
    ]) {
      assert.ok(ids.includes(need), `missing ${need}`);
    }
    assert.equal(getProtocol('cometapi').id, 'apimart');
    assert.equal(getProtocol('wavespeed').id, 'fal');
  });

  it('infers hosts without stealing grok2api', () => {
    assert.equal(inferFromRegistry({ provider: 'apimart', service: 'image' }), 'apimart');
    assert.equal(inferFromRegistry({ baseUrl: 'https://api.siliconflow.cn/v1' }), 'siliconflow');
    assert.equal(inferFromRegistry({ provider: 'grok2api', model: 'grok-imagine-image' }), '');
  });
});

describe('extract helpers', () => {
  it('reads APIMart async image envelope', () => {
    assert.equal(extractTaskId({ code: 200, data: [{ task_id: 'task_1' }] }), 'task_1');
    assert.equal(
      extractImageUrl({ data: { status: 'completed', result: { images: [{ url: ['https://cdn.example/a.png'] }] } } }),
      'https://cdn.example/a.png',
    );
  });

  it('reads SiliconFlow sync image objects', () => {
    assert.equal(extractImageUrl({ images: [{ url: 'https://sf.example/b.png' }] }), 'https://sf.example/b.png');
  });

  it('maps pixel size to ratio', () => {
    assert.equal(sizeToRatio('1920x1080'), '16:9');
    assert.equal(sizeToRatio('1024x1024'), '1:1');
  });
});

describe('callImageApi registry adapters', () => {
  it('polls APIMart task hub for images', async () => {
    const adapter = getProtocol('apimart');
    const srv = await startRouter({
      'POST /v1/images/generations': { code: 200, data: [{ task_id: 'task_img' }] },
      'GET /v1/tasks/task_img': {
        data: { status: 'completed', result: { images: [{ url: ['https://cdn.example/apimart.png'] }] } },
      },
    });
    try {
      const result = await adapter.submitImage(cfg(srv.base, { api_protocol: 'apimart' }), silentLog, {
        prompt: 'a cat',
        model: 'grok-imagine-image',
        size: '1920x1080',
      });
      assert.equal(result.image_url, 'https://cdn.example/apimart.png');
      assert.equal(srv.requests[0].body.aspect_ratio, '16:9');
      assert.ok(!('quality' in srv.requests[0].body));
    } finally {
      await srv.close();
    }
  });

  it('parses SiliconFlow {images:[{url}]}', async () => {
    const adapter = getProtocol('siliconflow');
    const srv = await startRouter({
      'POST /v1/images/generations': { images: [{ url: 'https://sf.example/k.png' }] },
    });
    try {
      const result = await adapter.submitImage(cfg(srv.base), silentLog, {
        prompt: 'island',
        model: 'Kwai-Kolors/Kolors',
        size: '1024x1024',
      });
      assert.equal(result.image_url, 'https://sf.example/k.png');
      assert.equal(srv.requests[0].body.image_size, '1024x1024');
    } finally {
      await srv.close();
    }
  });
});

describe('callVideoApi registry adapters', () => {
  it('submits APIMart video and polls /v1/tasks', async () => {
    const adapter = getProtocol('apimart');
    const srv = await startRouter({
      'POST /v1/videos/generations': { code: 200, data: [{ status: 'submitted', task_id: 'task_vid' }] },
      'GET /v1/tasks/task_vid': {
        data: { status: 'completed', result: { videos: [{ url: ['https://cdn.example/v.mp4'] }] } },
      },
    });
    try {
      const submitted = await adapter.submitVideo(cfg(srv.base, { api_protocol: 'apimart' }), silentLog, {
        prompt: 'waves',
        model: 'sora-2',
        duration: 8,
      });
      assert.equal(submitted.task_id, 'task_vid');
      const polled = await adapter.pollVideo(cfg(srv.base, { api_protocol: 'apimart' }), silentLog, 'task_vid');
      assert.equal(polled.video_url, 'https://cdn.example/v.mp4');
    } finally {
      await srv.close();
    }
  });

  it('uses SiliconFlow POST /video/submit and POST /video/status', async () => {
    const adapter = getProtocol('siliconflow');
    const srv = await startRouter({
      'POST /v1/video/submit': { requestId: 'req-1' },
      'POST /v1/video/status': { status: 'succeed', videos: [{ url: 'https://sf.example/v.mp4' }] },
    });
    try {
      const submitted = await adapter.submitVideo(cfg(srv.base), silentLog, {
        prompt: 'cat run',
        model: 'Wan-AI/Wan2.2-I2V-A14B',
      });
      assert.equal(submitted.task_id, 'req-1');
      const polled = await adapter.pollVideo(cfg(srv.base, { query_endpoint: '/v1/video/status' }), silentLog, 'req-1');
      assert.equal(polled.video_url, 'https://sf.example/v.mp4');
      assert.equal(srv.requests[1].method, 'POST');
      assert.equal(srv.requests[1].body.requestId, 'req-1');
    } finally {
      await srv.close();
    }
  });

  it('MiniMax Hailuo V1 and official Sora JSON stay distinct', async () => {
    const hailuo = getProtocol('minimax_hailuo');
    const sora = getProtocol('sora_official');
    const srv = await startRouter({
      'POST /v1/video_generation': { task_id: 'h1' },
      'POST /v1/videos': { id: 's1', status: 'queued' },
    });
    try {
      const a = await hailuo.submitVideo(cfg(srv.base, { endpoint: '/v1/video_generation' }), silentLog, {
        prompt: 'dance',
        model: 'MiniMax-Hailuo-02',
        duration: 6,
      });
      const b = await sora.submitVideo(cfg(srv.base, { endpoint: '/v1/videos' }), silentLog, {
        prompt: 'coast',
        model: 'sora-2',
        duration: 8,
      });
      assert.equal(a.task_id, 'h1');
      assert.equal(b.task_id, 's1');
      assert.equal(srv.requests[0].body.model, 'MiniMax-Hailuo-02');
      assert.equal(srv.requests[1].body.seconds, '8');
    } finally {
      await srv.close();
    }
  });
});

describe('pollVideoTask registry loop', () => {
  it('returns video_url for apimart protocol', async () => {
    const srv = await startRouter({
      'GET /v1/tasks/task_vid': {
        data: { status: 'completed', result: { videos: [{ url: ['https://cdn.example/loop.mp4'] }] } },
      },
    });
    try {
      const out = await pollVideoTask(null, silentLog, 1, 'task_vid', {
        base_url: srv.base,
        api_key: 'sk-test',
        api_protocol: 'apimart',
        query_endpoint: '/v1/tasks/{taskId}',
        provider: 'apimart',
      }, 3, 0);
      assert.equal(out.video_url, 'https://cdn.example/loop.mp4');
    } finally {
      await srv.close();
    }
  });
});
