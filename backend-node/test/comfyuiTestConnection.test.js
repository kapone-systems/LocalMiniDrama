process.env.PROTOCOL_POLL_INTERVAL_MS = '0';
process.env.COMFY_POLL_MAX = '8';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { testConnection, isComfyUiRequest } = require('../src/services/aiConfigService');
const { getProtocol, inferFromRegistry } = require('../src/protocols');

function startStatsServer({ hang = false } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url });
    if (hang) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ system: { comfyui_version: 'test' }, devices: [] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        seen,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe('isComfyUiRequest', () => {
  it('detects protocol, provider, and :8188', () => {
    assert.equal(isComfyUiRequest({ api_protocol: 'comfyui' }), true);
    assert.equal(isComfyUiRequest({ provider: 'comfyui' }), true);
    assert.equal(isComfyUiRequest({ base_url: 'http://127.0.0.1:8188' }), true);
    assert.equal(isComfyUiRequest({ provider: 'openai', base_url: 'https://api.openai.com/v1' }), false);
  });
});

describe('testConnection for comfyui', () => {
  it('allows an empty api_key and hits /system_stats', async () => {
    const server = await startStatsServer();
    try {
      const extra = await testConnection({
        base_url: server.base,
        api_key: '',
        api_protocol: 'comfyui',
        provider: 'comfyui',
        service_type: 'image',
        model: 'character-t2i',
      });
      assert.equal(server.seen.length, 1);
      assert.equal(server.seen[0].method, 'GET');
      assert.equal(server.seen[0].url, '/system_stats');
      assert.match(String(extra && extra.message), /已连接 ComfyUI/);
    } finally {
      await server.close();
    }
  });

  it('still requires api_key for non-comfyui protocols', async () => {
    await assert.rejects(
      () => testConnection({ base_url: 'http://127.0.0.1:9', api_key: '', provider: 'openai', service_type: 'text' }),
      (err) => err.message === 'api_key 必填',
    );
  });

  it('throws 无法连接 ComfyUI when the server is down', async () => {
    await assert.rejects(
      () => testConnection({
        base_url: 'http://127.0.0.1:1',
        api_key: '',
        api_protocol: 'comfyui',
        provider: 'comfyui',
      }),
      (err) => /无法连接 ComfyUI/.test(err.message),
    );
  });
});

describe('comfyui registry infer', () => {
  it('registers and infers without stealing grok2api', () => {
    assert.equal(getProtocol('comfyui').id, 'comfyui');
    assert.equal(getProtocol('comfy').id, 'comfyui');
    assert.equal(inferFromRegistry({ provider: 'comfyui' }), 'comfyui');
    assert.equal(inferFromRegistry({ baseUrl: 'http://127.0.0.1:8188' }), 'comfyui');
    assert.equal(inferFromRegistry({ provider: 'grok2api' }), '');
    assert.equal(inferFromRegistry({ baseUrl: 'https://www.runninghub.cn' }), 'runninghub');
  });
});
