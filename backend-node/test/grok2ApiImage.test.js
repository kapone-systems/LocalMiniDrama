// grok2api 图片协议适配测试
// 契约依据：docs/grok2api-contract.md（grok2api v3.1.6）
// 用本地 HTTP 服务捕获真实请求，断言 URL 与请求体形状。
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  isGrok2ApiImageProtocol,
  grok2ApiAspectRatioFromSize,
  resolveGrok2ApiQuality,
  buildGrok2ApiImageUrl,
  callGrok2ApiImage,
} = require('../src/services/imageClient');

/** 捕获请求的本地服务；返回 { base, requests, close } */
function startCaptureServer(responseBody = { data: [{ url: 'https://cdn.example/out.png' }] }) {
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

describe('grok2ApiAspectRatioFromSize', () => {
  it('maps the sizes LMD actually produces (imageService.aspectRatioToSize)', () => {
    assert.equal(grok2ApiAspectRatioFromSize('2560x1440'), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize('1440x2560'), '9:16');
    assert.equal(grok2ApiAspectRatioFromSize('1920x1920'), '1:1');
    assert.equal(grok2ApiAspectRatioFromSize('2240x1680'), '4:3');
    assert.equal(grok2ApiAspectRatioFromSize('1680x2240'), '3:4');
  });

  it('falls back to 16:9 for 21:9 which the upstream rejects', () => {
    assert.equal(grok2ApiAspectRatioFromSize('2940x1260'), '16:9');
  });

  it('maps grok2api whitelist pixel sizes to their real upstream ratios', () => {
    // 注意 1792x1024/1536x1024 上游解析为 3:2，不是 16:9（contract 附录 A2）
    assert.equal(grok2ApiAspectRatioFromSize('1792x1024'), '3:2');
    assert.equal(grok2ApiAspectRatioFromSize('1536x1024'), '3:2');
    assert.equal(grok2ApiAspectRatioFromSize('1024x1792'), '2:3');
    assert.equal(grok2ApiAspectRatioFromSize('1024x1536'), '2:3');
    assert.equal(grok2ApiAspectRatioFromSize('1280x720'), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize('720x1280'), '9:16');
    assert.equal(grok2ApiAspectRatioFromSize('1024x1024'), '1:1');
  });

  it('passes through ratio labels and buckets unknown pixel sizes', () => {
    assert.equal(grok2ApiAspectRatioFromSize('16:9'), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize('9:16'), '9:16');
    assert.equal(grok2ApiAspectRatioFromSize('2000x1125'), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize('1000x1000'), '1:1');
    assert.equal(grok2ApiAspectRatioFromSize('1000x1500'), '2:3');
  });

  it('defaults to 16:9 for empty or unparseable input', () => {
    assert.equal(grok2ApiAspectRatioFromSize(''), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize(null), '16:9');
    assert.equal(grok2ApiAspectRatioFromSize('auto'), '16:9');
  });
});

describe('resolveGrok2ApiQuality', () => {
  it('never sends quality for models other than grok-imagine-image-2.0', () => {
    // 'standard' 是 LMD 的历史硬编码值，上游只接受 low/medium
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image', 'standard'), '');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image', 'low'), '');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-video', 'medium'), '');
  });

  it('sends low/medium only for grok-imagine-image-2.0', () => {
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', 'low'), 'low');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', 'medium'), 'medium');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', 'LOW'), 'low');
  });

  it('drops invalid values even on the 2.0 model', () => {
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', 'standard'), '');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', 'high'), '');
    assert.equal(resolveGrok2ApiQuality('grok-imagine-image-2.0', ''), '');
  });
});

describe('isGrok2ApiImageProtocol', () => {
  it('honours an explicit grok2api protocol', () => {
    assert.equal(isGrok2ApiImageProtocol('grok2api', 'anything', 'anything', ''), true);
  });

  it('does not hijack other explicit protocols', () => {
    assert.equal(isGrok2ApiImageProtocol('dashscope', 'dashscope', 'grok-imagine-image', ''), false);
    assert.equal(isGrok2ApiImageProtocol('gemini', 'gemini', 'grok-imagine-image', ''), false);
  });

  it('infers grok2api for grok-imagine models when protocol is empty or openai', () => {
    assert.equal(isGrok2ApiImageProtocol('', 'grok', 'grok-imagine-image', 'http://127.0.0.1:8000/v1'), true);
    assert.equal(isGrok2ApiImageProtocol('openai', 'grok', 'grok-imagine-image', 'http://127.0.0.1:8000/v1'), true);
  });

  it('leaves the official xAI endpoint alone', () => {
    assert.equal(isGrok2ApiImageProtocol('', 'xai', 'grok-imagine-image', 'https://api.x.ai/v1'), false);
  });

  it('does not claim non-grok models', () => {
    assert.equal(isGrok2ApiImageProtocol('', 'openai', 'dall-e-3', 'https://api.openai.com/v1'), false);
  });
});

describe('buildGrok2ApiImageUrl', () => {
  it('builds generations and edits URLs from a /v1 base', () => {
    const config = { base_url: 'http://127.0.0.1:8000/v1' };
    assert.equal(buildGrok2ApiImageUrl(config, false), 'http://127.0.0.1:8000/v1/images/generations');
    assert.equal(buildGrok2ApiImageUrl(config, true), 'http://127.0.0.1:8000/v1/images/edits');
  });

  it('respects an explicit endpoint', () => {
    const config = { base_url: 'http://127.0.0.1:8000', endpoint: '/v1/images/generations' };
    assert.equal(buildGrok2ApiImageUrl(config, false), 'http://127.0.0.1:8000/v1/images/generations');
  });

  it('strips a trailing slash on base_url', () => {
    const config = { base_url: 'http://127.0.0.1:8000/v1/' };
    assert.equal(buildGrok2ApiImageUrl(config, false), 'http://127.0.0.1:8000/v1/images/generations');
  });
});

describe('callGrok2ApiImage', () => {
  let server;
  before(async () => { server = await startCaptureServer(); });
  after(async () => { await server.close(); });

  const baseConfig = () => ({ base_url: `${server.base}/v1`, api_key: 'g2a_test' });

  it('POSTs /images/generations with aspect_ratio and no size/quality when there are no refs', async () => {
    server.requests.length = 0;
    const out = await callGrok2ApiImage(baseConfig(), silentLog, {
      prompt: 'a cat', model: 'grok-imagine-image', size: '2560x1440', quality: 'standard',
      image_gen_id: 1,
    });
    assert.equal(out.image_url, 'https://cdn.example/out.png');

    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/images/generations');
    assert.equal(req.headers.authorization, 'Bearer g2a_test');
    assert.equal(req.body.model, 'grok-imagine-image');
    assert.equal(req.body.prompt, 'a cat');
    assert.equal(req.body.aspect_ratio, '16:9');
    assert.equal(req.body.n, 1);
    // 关键：绝不发 size / quality —— 这是原 400 的根因
    assert.equal('size' in req.body, false);
    assert.equal('quality' in req.body, false);
    assert.equal('image' in req.body, false);
    assert.equal('images' in req.body, false);
  });

  it('routes reference images to /images/edits with images[{url}]', async () => {
    server.requests.length = 0;
    const out = await callGrok2ApiImage(baseConfig(), silentLog, {
      prompt: 'same person, new pose', model: 'grok-imagine-image', size: '1440x2560',
      image_gen_id: 2,
      reference_image_urls: ['https://cdn.example/ref1.png', 'https://cdn.example/ref2.png'],
    });
    assert.equal(out.image_url, 'https://cdn.example/out.png');

    const req = server.requests[0];
    assert.equal(req.url, '/v1/images/edits');
    assert.equal(req.body.aspect_ratio, '9:16');
    assert.deepEqual(req.body.images, [
      { url: 'https://cdn.example/ref1.png' },
      { url: 'https://cdn.example/ref2.png' },
    ]);
    assert.equal('size' in req.body, false);
    assert.equal('quality' in req.body, false);
  });

  it('clamps reference images to 3 (Console adapter limit, stricter than the HTTP layer)', async () => {
    server.requests.length = 0;
    await callGrok2ApiImage(baseConfig(), silentLog, {
      prompt: 'multi ref', model: 'grok-imagine-image', size: '1920x1920', image_gen_id: 3,
      reference_image_urls: [
        'https://cdn.example/r1.png', 'https://cdn.example/r2.png', 'https://cdn.example/r3.png',
        'https://cdn.example/r4.png', 'https://cdn.example/r5.png',
      ],
    });
    const req = server.requests[0];
    assert.equal(req.url, '/v1/images/edits');
    assert.equal(req.body.images.length, 3);
    assert.deepEqual(req.body.images.map((i) => i.url), [
      'https://cdn.example/r1.png', 'https://cdn.example/r2.png', 'https://cdn.example/r3.png',
    ]);
  });

  it('sends quality only for grok-imagine-image-2.0 with a valid value', async () => {
    server.requests.length = 0;
    await callGrok2ApiImage(baseConfig(), silentLog, {
      prompt: 'q', model: 'grok-imagine-image-2.0', size: '1024x1024', quality: 'low',
      image_gen_id: 4,
    });
    assert.equal(server.requests[0].body.quality, 'low');

    server.requests.length = 0;
    await callGrok2ApiImage(baseConfig(), silentLog, {
      prompt: 'q', model: 'grok-imagine-image-2.0', size: '1024x1024', quality: 'standard',
      image_gen_id: 5,
    });
    assert.equal('quality' in server.requests[0].body, false);
  });

  it('falls back to the default image model when none is configured', async () => {
    server.requests.length = 0;
    await callGrok2ApiImage(baseConfig(), silentLog, { prompt: 'x', size: '2560x1440', image_gen_id: 6 });
    assert.equal(server.requests[0].body.model, 'grok-imagine-image');
  });

  it('surfaces upstream errors with the upstream message', async () => {
    const badServer = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'invalid_parameter', message: 'quality 必须是 low 或 medium' } }));
      });
    });
    await new Promise((r) => badServer.listen(0, '127.0.0.1', r));
    const badBase = `http://127.0.0.1:${badServer.address().port}/v1`;
    try {
      const out = await callGrok2ApiImage({ base_url: badBase, api_key: 'k' }, silentLog, {
        prompt: 'p', model: 'grok-imagine-image', size: '2560x1440', image_gen_id: 7,
      });
      assert.match(out.error, /400/);
      assert.match(out.error, /quality 必须是 low 或 medium/);
    } finally {
      await new Promise((r) => badServer.close(r));
    }
  });

  it('reports an error when the response carries no image URL', async () => {
    const emptyServer = await startCaptureServer({ data: [] });
    try {
      const out = await callGrok2ApiImage({ base_url: `${emptyServer.base}/v1`, api_key: 'k' }, silentLog, {
        prompt: 'p', model: 'grok-imagine-image', size: '2560x1440', image_gen_id: 8,
      });
      assert.equal(out.error, '未返回图片地址');
    } finally {
      await emptyServer.close();
    }
  });

  it('accepts b64_json responses', async () => {
    const b64Server = await startCaptureServer({ data: [{ b64_json: 'AAAA' }] });
    try {
      const out = await callGrok2ApiImage({ base_url: `${b64Server.base}/v1`, api_key: 'k' }, silentLog, {
        prompt: 'p', model: 'grok-imagine-image', size: '2560x1440', image_gen_id: 9,
      });
      assert.equal(out.image_url, 'data:image/png;base64,AAAA');
    } finally {
      await b64Server.close();
    }
  });
});
