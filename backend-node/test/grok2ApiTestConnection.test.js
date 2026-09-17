// grok2api 测试连接（D8 修复）测试
// 过去 image/video/storyboard_image 一律用 chat/completions 试连、判定标准过宽，
// 导致「测试连接成功但实际生成 400」。现在 grok2api 走 GET /v1/models，
// 同时验证 key 有效性与模型是否真的存在。
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { testConnection, isGrok2ApiConnection } = require('../src/services/aiConfigService');

/** 启动一个返回固定模型列表的 grok2api 模拟服务 */
function startModelsServer({ status = 200, body = null } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body ?? {
      object: 'list',
      data: [
        { id: 'grok-imagine-image', object: 'model', owned_by: 'grok2api' },
        { id: 'grok-imagine-video', object: 'model', owned_by: 'grok2api' },
        { id: 'grok-4.5', object: 'model', owned_by: 'grok2api' },
      ],
    }));
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

describe('isGrok2ApiConnection', () => {
  it('detects an explicit grok2api provider or protocol', () => {
    assert.equal(isGrok2ApiConnection({ provider: 'grok2api' }), true);
    assert.equal(isGrok2ApiConnection({ api_protocol: 'grok2api' }), true);
  });

  it('detects grok model ids that only exist on grok2api', () => {
    assert.equal(isGrok2ApiConnection({ model: 'grok-imagine-image' }), true);
    assert.equal(isGrok2ApiConnection({ model: ['grok-voice-latest'] }), true);
    assert.equal(isGrok2ApiConnection({ model: 'grok-4.5' }), true);
  });

  it('does not claim the official xAI endpoint', () => {
    assert.equal(isGrok2ApiConnection({ base_url: 'https://api.x.ai/v1', model: 'grok-imagine-image' }), false);
  });

  it('does not claim unrelated providers', () => {
    assert.equal(isGrok2ApiConnection({ provider: 'deepseek', model: 'deepseek-v4-flash' }), false);
    assert.equal(isGrok2ApiConnection({ provider: 'openai', model: 'dall-e-3' }), false);
  });
});

describe('testConnection for grok2api', () => {
  it('passes when the key is valid and the configured model exists', async () => {
    const server = await startModelsServer();
    try {
      await testConnection({
        base_url: server.base, api_key: 'g2a_ok', model: 'grok-imagine-image',
        provider: 'grok2api', service_type: 'image',
      });
      assert.equal(server.seen.length, 1);
      assert.equal(server.seen[0].method, 'GET');
      assert.equal(server.seen[0].url, '/v1/models');
      assert.equal(server.seen[0].auth, 'Bearer g2a_ok');
    } finally {
      await server.close();
    }
  });

  it('appends /v1/models when base_url already ends in /v1', async () => {
    const server = await startModelsServer();
    try {
      await testConnection({
        base_url: `${server.base}/v1`, api_key: 'k', model: 'grok-imagine-image',
        provider: 'grok2api', service_type: 'image',
      });
      assert.equal(server.seen[0].url, '/v1/models');
    } finally {
      await server.close();
    }
  });

  it('fails when the model does not exist upstream (the old false-positive case)', async () => {
    const server = await startModelsServer();
    try {
      await assert.rejects(
        () => testConnection({
          base_url: server.base, api_key: 'k', model: 'grok-imagine-medium',
          provider: 'grok2api', service_type: 'image',
        }),
        (err) => {
          assert.match(err.message, /grok-imagine-medium/);
          assert.match(err.message, /不存在/);
          // 报错里应列出可用模型，方便用户直接改配置
          assert.match(err.message, /grok-imagine-image/);
          return true;
        }
      );
    } finally {
      await server.close();
    }
  });

  it('fails on an invalid key', async () => {
    const server = await startModelsServer({ status: 401, body: { error: { message: 'invalid api key' } } });
    try {
      await assert.rejects(
        () => testConnection({
          base_url: server.base, api_key: 'bad', model: 'grok-imagine-image',
          provider: 'grok2api', service_type: 'image',
        }),
        // 与文件内其他分支一致：优先透出上游的 message
        /invalid api key|API Key 无效/
      );
    } finally {
      await server.close();
    }
  });

  it('passes when the model list is empty (cannot verify, but key works)', async () => {
    const server = await startModelsServer({ body: { object: 'list', data: [] } });
    try {
      await testConnection({
        base_url: server.base, api_key: 'k', model: 'grok-imagine-image',
        provider: 'grok2api', service_type: 'image',
      });
    } finally {
      await server.close();
    }
  });

  it('reports a clear error when the server is unreachable', async () => {
    await assert.rejects(
      () => testConnection({
        // 端口 1 上不会有服务
        base_url: 'http://127.0.0.1:1', api_key: 'k', model: 'grok-imagine-image',
        provider: 'grok2api', service_type: 'image',
      }),
      /无法连接 grok2api/
    );
  });
});
