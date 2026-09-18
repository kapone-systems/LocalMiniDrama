// grok2api 视频协议适配测试
// 契约依据：docs/grok2api-contract.md §5（grok2api v3.1.6）
// 用本地 HTTP 服务捕获真实提交请求，断言 URL、body 形状与参数钳制。
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  callGrok2ApiVideo,
  clampGrok2ApiDuration,
  normalizeGrok2ApiVideoAspectRatio,
  normalizeGrok2ApiVideoResolution,
  buildQueryUrl,
} = require('../src/services/videoClient');

/** 捕获 POST 提交请求的本地服务 */
function startCaptureServer(responseBody = { request_id: 'req_abc' }) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const silentLog = { info() {}, warn() {}, error() {} };
const cfg = (base) => ({ base_url: base, api_key: 'g2a_test', provider: 'grok2api' });

describe('clampGrok2ApiDuration', () => {
  it('clamps to the upstream 1-15 range', () => {
    assert.equal(clampGrok2ApiDuration(6), 6);
    assert.equal(clampGrok2ApiDuration(20), 15);
    assert.equal(clampGrok2ApiDuration(0), 8);
    assert.equal(clampGrok2ApiDuration(-3), 8);
  });

  it('defaults to 8 when unset', () => {
    assert.equal(clampGrok2ApiDuration(undefined), 8);
    assert.equal(clampGrok2ApiDuration(null), 8);
    assert.equal(clampGrok2ApiDuration('abc'), 8);
  });
});

describe('normalizeGrok2ApiVideoAspectRatio', () => {
  it('keeps whitelisted ratios', () => {
    for (const r of ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']) {
      assert.equal(normalizeGrok2ApiVideoAspectRatio(r), r);
    }
  });

  it('falls back to 16:9 for 21:9, which the video endpoint rejects', () => {
    assert.equal(normalizeGrok2ApiVideoAspectRatio('21:9'), '16:9');
  });

  it('resolves word aliases and defaults when empty', () => {
    assert.equal(normalizeGrok2ApiVideoAspectRatio('portrait'), '9:16');
    assert.equal(normalizeGrok2ApiVideoAspectRatio('landscape'), '16:9');
    assert.equal(normalizeGrok2ApiVideoAspectRatio(''), '16:9');
  });
});

describe('normalizeGrok2ApiVideoResolution', () => {
  it('keeps 1080p only for grok-imagine-video-1.5 without references', () => {
    assert.equal(normalizeGrok2ApiVideoResolution('1080p', 'grok-imagine-video-1.5', false), '1080p');
    // 参考图模式最高 720p
    assert.equal(normalizeGrok2ApiVideoResolution('1080p', 'grok-imagine-video-1.5', true), '720p');
    // 非 1.5 模型不支持 1080p
    assert.equal(normalizeGrok2ApiVideoResolution('1080p', 'grok-imagine-video', false), '720p');
  });

  it('accepts 480p/720p and defaults to 720p', () => {
    assert.equal(normalizeGrok2ApiVideoResolution('480p', 'grok-imagine-video', false), '480p');
    assert.equal(normalizeGrok2ApiVideoResolution('720p', 'grok-imagine-video', false), '720p');
    assert.equal(normalizeGrok2ApiVideoResolution('', 'grok-imagine-video', false), '720p');
    assert.equal(normalizeGrok2ApiVideoResolution('4k', 'grok-imagine-video', false), '720p');
  });
});

describe('buildQueryUrl for grok2api', () => {
  it('polls GET /v1/videos/{requestId}', () => {
    const config = { provider: 'grok2api', base_url: 'http://127.0.0.1:8000', model: ['grok-imagine-video'] };
    assert.equal(buildQueryUrl(config, 'req_abc'), 'http://127.0.0.1:8000/v1/videos/req_abc');
  });

  it('honours an explicit query_endpoint', () => {
    const config = {
      provider: 'grok2api', base_url: 'http://127.0.0.1:8000',
      model: ['grok-imagine-video'], query_endpoint: '/v1/videos/{taskId}',
    };
    assert.equal(buildQueryUrl(config, 'req_xyz'), 'http://127.0.0.1:8000/v1/videos/req_xyz');
  });

  it('avoids a /v1/v1 double prefix when base carries /v1 (legacy config shape)', () => {
    // 回归：LMD 旧库的 base_url 带 /v1，与预设的 query_endpoint 混用会产生 /v1/v1/... → 404
    const config = {
      provider: 'grok2api', base_url: 'http://127.0.0.1:8000/v1',
      model: ['grok-imagine-video'], query_endpoint: '/v1/videos/{taskId}',
    };
    assert.equal(buildQueryUrl(config, 'req_xyz'), 'http://127.0.0.1:8000/v1/videos/req_xyz');
  });

  it('adds the version segment when base has /v1 and no query_endpoint is configured', () => {
    const config = {
      provider: 'grok2api', base_url: 'http://127.0.0.1:8000/v1',
      model: ['grok-imagine-video'],
    };
    assert.equal(buildQueryUrl(config, 'req_xyz'), 'http://127.0.0.1:8000/v1/videos/req_xyz');
  });
});

describe('callGrok2ApiVideo', () => {
  let server;
  before(async () => { server = await startCaptureServer(); });
  after(async () => { await server.close(); });

  it('POSTs /v1/videos/generations for text-to-video with only known fields', async () => {
    server.requests.length = 0;
    const out = await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'a cat running', model: 'grok-imagine-video',
      duration: 6, aspect_ratio: '16:9', resolution: '720p', video_gen_id: 1,
    });
    assert.equal(out.task_id, 'req_abc');
    assert.equal(out.status, 'submitted');

    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/videos/generations');
    assert.equal(req.headers.authorization, 'Bearer g2a_test');
    assert.deepEqual(req.body, {
      model: 'grok-imagine-video', prompt: 'a cat running',
      duration: 6, aspect_ratio: '16:9', resolution: '720p',
    });
    // 上游 DisallowUnknownFields：绝不多传字段
    assert.equal('image' in req.body, false);
    assert.equal('reference_images' in req.body, false);
  });

  it('sends the first frame as image{url} for image-to-video', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'animate this', model: 'grok-imagine-video', duration: 6,
      aspect_ratio: '16:9', resolution: '720p', video_gen_id: 2,
      first_frame_url: 'https://cdn.example/first.png',
    });
    const req = server.requests[0];
    assert.deepEqual(req.body.image, { url: 'https://cdn.example/first.png' });
    assert.equal('reference_images' in req.body, false);
  });

  it('sends reference images as reference_images[{url}] when there is no first frame', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'multi ref', model: 'grok-imagine-video', duration: 8,
      aspect_ratio: '9:16', resolution: '720p', video_gen_id: 3,
      reference_urls: ['https://cdn.example/r1.png', 'https://cdn.example/r2.png'],
    });
    const req = server.requests[0];
    assert.equal('image' in req.body, false);
    assert.deepEqual(req.body.reference_images, [
      { url: 'https://cdn.example/r1.png' },
      { url: 'https://cdn.example/r2.png' },
    ]);
  });

  it('keeps image and drops reference_images when both are given (upstream rejects the pair)', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'both', model: 'grok-imagine-video', duration: 6,
      aspect_ratio: '16:9', resolution: '720p', video_gen_id: 4,
      first_frame_url: 'https://cdn.example/first.png',
      reference_urls: ['https://cdn.example/r1.png'],
    });
    const req = server.requests[0];
    assert.deepEqual(req.body.image, { url: 'https://cdn.example/first.png' });
    assert.equal('reference_images' in req.body, false);
  });

  it('clamps reference images to 7', async () => {
    server.requests.length = 0;
    const refs = Array.from({ length: 10 }, (_, i) => `https://cdn.example/r${i}.png`);
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'many', model: 'grok-imagine-video', duration: 6,
      aspect_ratio: '16:9', resolution: '720p', video_gen_id: 5, reference_urls: refs,
    });
    const req = server.requests[0];
    assert.equal(req.body.reference_images.length, 7);
    assert.equal(req.body.reference_images[6].url, 'https://cdn.example/r6.png');
  });

  it('clamps duration to 10s for grok-imagine-video with references', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'long', model: 'grok-imagine-video', duration: 15,
      aspect_ratio: '16:9', resolution: '720p', video_gen_id: 6,
      reference_urls: ['https://cdn.example/r1.png'],
    });
    assert.equal(server.requests[0].body.duration, 10);
  });

  it('does not clamp duration for grok-imagine-video-1.5 with references', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'long', model: 'grok-imagine-video-1.5', duration: 15,
      aspect_ratio: '16:9', resolution: '720p', video_gen_id: 7,
      reference_urls: ['https://cdn.example/r1.png'],
    });
    assert.equal(server.requests[0].body.duration, 15);
  });

  it('downgrades 1080p in reference mode and for non-1.5 models', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'hd', model: 'grok-imagine-video', duration: 6,
      aspect_ratio: '16:9', resolution: '1080p', video_gen_id: 8,
    });
    assert.equal(server.requests[0].body.resolution, '720p');
  });

  it('maps 21:9 to 16:9 and drops the unsupported tail frame', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'wide', model: 'grok-imagine-video', duration: 6,
      aspect_ratio: '21:9', resolution: '720p', video_gen_id: 9,
      first_frame_url: 'https://cdn.example/first.png',
      last_frame_url: 'https://cdn.example/last.png',
    });
    const req = server.requests[0];
    assert.equal(req.body.aspect_ratio, '16:9');
    // 上游没有尾帧概念：不出现任何 last_frame 字段
    assert.equal(JSON.stringify(req.body).includes('last'), false);
  });

  it('uses a configured endpoint when provided', async () => {
    server.requests.length = 0;
    const custom = { ...cfg(server.base), endpoint: '/v1/videos/generations' };
    await callGrok2ApiVideo(custom, silentLog, {
      prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 10,
    });
    assert.equal(server.requests[0].url, '/v1/videos/generations');
  });

  it('warns when the configured endpoint does not match the upstream contract', async () => {
    // 存量配置里的旧写法 endpoint=/videos（旧库就是这样），拼出来不是上游唯一路径
    const warnings = [];
    const log = { info() {}, error() {}, warn: (m, e) => warnings.push({ m, e }) };
    server.requests.length = 0;
    const legacy = { ...cfg(server.base), endpoint: '/videos' };
    await callGrok2ApiVideo(legacy, log, {
      prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 20,
    });
    assert.equal(server.requests[0].url, '/videos');
    assert.ok(
      warnings.some((w) => /endpoint 与上游契约不符/.test(w.m)),
      '应当对错误的 endpoint 发出告警'
    );
  });

  it('does not warn for the contract-correct endpoint', async () => {
    const warnings = [];
    const log = { info() {}, error() {}, warn: (m, e) => warnings.push({ m, e }) };
    server.requests.length = 0;
    await callGrok2ApiVideo({ ...cfg(server.base), endpoint: '/v1/videos/generations' }, log, {
      prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 21,
    });
    assert.equal(warnings.filter((w) => /endpoint 与上游契约不符/.test(w.m)).length, 0);
  });

  it('defaults the model to grok-imagine-video', async () => {
    server.requests.length = 0;
    await callGrok2ApiVideo(cfg(server.base), silentLog, {
      prompt: 'x', duration: 6, aspect_ratio: '16:9', video_gen_id: 11,
    });
    assert.equal(server.requests[0].body.model, 'grok-imagine-video');
  });

  it('surfaces upstream errors', async () => {
    const badServer = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Console reference_images 最多 7 张，当前为 8 张' } }));
      });
    });
    await new Promise((r) => badServer.listen(0, '127.0.0.1', r));
    try {
      const out = await callGrok2ApiVideo(cfg(`http://127.0.0.1:${badServer.address().port}`), silentLog, {
        prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 12,
      });
      assert.match(out.error, /400/);
      assert.match(out.error, /最多 7 张/);
    } finally {
      await new Promise((r) => badServer.close(r));
    }
  });

  it('errors clearly when the response has no request_id', async () => {
    const emptyServer = await startCaptureServer({ unexpected: true });
    try {
      const out = await callGrok2ApiVideo(cfg(emptyServer.base), silentLog, {
        prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 13,
      });
      assert.match(out.error, /未返回 request_id/);
    } finally {
      await emptyServer.close();
    }
  });

  it('returns a direct video url when the upstream responds synchronously', async () => {
    const syncServer = await startCaptureServer({ video: { url: 'https://cdn.example/out.mp4' } });
    try {
      const out = await callGrok2ApiVideo(cfg(syncServer.base), silentLog, {
        prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 14,
      });
      assert.equal(out.video_url, 'https://cdn.example/out.mp4');
    } finally {
      await syncServer.close();
    }
  });
});

describe('grok2api submit -> poll round trip', () => {
  it('resolves the video url from the {status, video:{url}} poll response', async () => {
    const Database = require('better-sqlite3');
    const { pollVideoTask } = require('../src/services/videoClient');

    // 提交返回 request_id；轮询先 pending 后 done
    let polls = 0;
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.method === 'POST') {
          res.end(JSON.stringify({ request_id: 'req_round' }));
          return;
        }
        polls += 1;
        if (polls === 1) {
          res.end(JSON.stringify({ status: 'pending', model: 'grok-imagine-video', progress: 30 }));
        } else {
          res.end(JSON.stringify({
            status: 'done', model: 'grok-imagine-video', progress: 100,
            video: { url: 'https://cdn.example/final.mp4', respect_moderation: true },
          }));
        }
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE video_generations (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT);`);
    db.prepare('INSERT INTO video_generations (id, model) VALUES (1, ?)').run('grok-imagine-video');

    try {
      const config = { base_url: base, api_key: 'k', provider: 'grok2api', model: ['grok-imagine-video'] };

      const submit = await callGrok2ApiVideo(config, silentLog, {
        prompt: 'x', model: 'grok-imagine-video', duration: 6, aspect_ratio: '16:9', video_gen_id: 1,
      });
      assert.equal(submit.task_id, 'req_round');

      // 轮询：短间隔以便测试快速跑完
      const polled = await pollVideoTask(db, silentLog, 1, submit.task_id, config, 5, 5);
      assert.equal(polled.video_url, 'https://cdn.example/final.mp4');
      assert.equal(polls, 2);
    } finally {
      await new Promise((r) => server.close(r));
      db.close();
    }
  });
});
