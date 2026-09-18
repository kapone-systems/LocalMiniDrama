// TTS 与共享 URL 拼接的回归测试
// 背景：ttsService 曾把 URL 写死为 base + '/audio/speech'，忽略配置里的 endpoint。
// grok2api 的 /audio/speech 挂在 /v1 下，而预设的 base_url 不带 /v1（见 docs/configuration.md），
// 因此配音实际打到 /audio/speech → 404。用本地 HTTP 服务捕获真实请求做回归。
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const Database = require('better-sqlite3');
const { joinApiUrl, trailingVersionPrefix } = require('../src/utils/apiUrl');
const ttsService = require('../src/services/ttsService');

const silentLog = { info() {}, warn() {}, error() {} };

/** 只接受 /v1/audio/speech 的本地服务；其余路径回 404，与 grok2api 的路由一致 */
function startTtsServer() {
  const hits = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      if (req.url === '/v1/audio/speech') {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(Buffer.from([0xFF, 0xFB, 0x90, 0x00]));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: '404 page not found' } }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        hits,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function dbWithTtsConfig(baseUrl, endpoint) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, service_type TEXT, provider TEXT, api_protocol TEXT,
    name TEXT, base_url TEXT, api_key TEXT, model TEXT, default_model TEXT, endpoint TEXT,
    query_endpoint TEXT, priority INTEGER, is_default INTEGER, is_active INTEGER, settings TEXT,
    voice_id TEXT, group_id TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT)`);
  db.prepare(`INSERT INTO ai_service_configs
    (service_type, provider, api_protocol, name, base_url, api_key, model, default_model, endpoint,
     priority, is_default, is_active, created_at, updated_at)
    VALUES ('tts','grok2api','openai','t',?,'g2a_test','["grok-voice-latest"]','grok-voice-latest',?,10,1,1,?,?)`)
    .run(baseUrl, endpoint, new Date().toISOString(), new Date().toISOString());
  return db;
}

describe('joinApiUrl', () => {
  it('keeps a single /v1 when base and endpoint both carry it', () => {
    assert.equal(
      joinApiUrl('http://127.0.0.1:8000/v1', '/v1/audio/speech'),
      'http://127.0.0.1:8000/v1/audio/speech'
    );
    assert.equal(
      joinApiUrl('http://127.0.0.1:8000/v1', '/v1/videos/{taskId}'),
      'http://127.0.0.1:8000/v1/videos/{taskId}'
    );
  });

  it('prepends the version segment when only the endpoint has it', () => {
    assert.equal(
      joinApiUrl('http://127.0.0.1:8000', '/v1/audio/speech'),
      'http://127.0.0.1:8000/v1/audio/speech'
    );
  });

  it('adds the version segment when base has it and endpoint is bare', () => {
    assert.equal(
      joinApiUrl('http://127.0.0.1:8000/v1', '/audio/speech'),
      'http://127.0.0.1:8000/v1/audio/speech'
    );
  });

  it('falls back to the default endpoint when none is configured', () => {
    assert.equal(
      joinApiUrl('http://127.0.0.1:8000/v1', '', '/audio/speech'),
      'http://127.0.0.1:8000/v1/audio/speech'
    );
  });

  it('does not invent a version segment when the base has none', () => {
    // 历史行为：base 不带 /v1 且未配 endpoint 时打 /audio/speech，保持不变以免影响既有中转站
    assert.equal(joinApiUrl('http://127.0.0.1:8000', '', '/audio/speech'), 'http://127.0.0.1:8000/audio/speech');
  });

  it('normalises trailing slashes and missing leading slash', () => {
    assert.equal(joinApiUrl('http://127.0.0.1:8000/v1/', 'audio/speech'), 'http://127.0.0.1:8000/v1/audio/speech');
    assert.equal(joinApiUrl('http://127.0.0.1:8000/v1/', '/v1/audio/speech'), 'http://127.0.0.1:8000/v1/audio/speech');
  });

  it('only treats a trailing /vN as a version segment', () => {
    assert.equal(trailingVersionPrefix('http://h/v1'), '/v1');
    assert.equal(trailingVersionPrefix('http://h/v2/'), '/v2');
    assert.equal(trailingVersionPrefix('http://h/v1beta'), '');
    assert.equal(trailingVersionPrefix('http://h'), '');
  });
});

describe('ttsService.synthesize endpoint handling', () => {
  it('uses the configured endpoint (grok2api preset shape: base without /v1)', async () => {
    const server = await startTtsServer();
    const db = dbWithTtsConfig(server.base, '/v1/audio/speech');
    try {
      await ttsService.synthesize(db, silentLog, {
        text: '测试', storyboard_id: 1, storage_base: os.tmpdir(),
      });
      assert.equal(server.hits.length, 1);
      assert.equal(server.hits[0].url, '/v1/audio/speech');
    } finally {
      await server.close();
      db.close();
    }
  });

  it('avoids the /v1/v1 double prefix when base and endpoint both carry /v1', async () => {
    const server = await startTtsServer();
    const db = dbWithTtsConfig(`${server.base}/v1`, '/v1/audio/speech');
    try {
      await ttsService.synthesize(db, silentLog, {
        text: '测试', storyboard_id: 1, storage_base: os.tmpdir(),
      });
      assert.equal(server.hits[0].url, '/v1/audio/speech');
    } finally {
      await server.close();
      db.close();
    }
  });

  it('keeps working for a legacy config whose base already ends with /v1 and has no endpoint', async () => {
    const server = await startTtsServer();
    const db = dbWithTtsConfig(`${server.base}/v1`, '');
    try {
      await ttsService.synthesize(db, silentLog, {
        text: '测试', storyboard_id: 1, storage_base: os.tmpdir(),
      });
      assert.equal(server.hits[0].url, '/v1/audio/speech');
    } finally {
      await server.close();
      db.close();
    }
  });

  it('preserves the historical /audio/speech path for a bare base with no endpoint', async () => {
    // 既有第三方中转配置：base 不带 /v1、endpoint 为空 → 仍打 /audio/speech
    const hits = [];
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        hits.push(req.url);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(Buffer.from([0xFF, 0xFB, 0x90, 0x00]));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const db = dbWithTtsConfig(`http://127.0.0.1:${server.address().port}`, '');
    try {
      await ttsService.synthesize(db, silentLog, {
        text: '测试', storyboard_id: 1, storage_base: os.tmpdir(),
      });
      assert.equal(hits[0], '/audio/speech');
    } finally {
      await new Promise((r) => server.close(r));
      db.close();
    }
  });

  it('surfaces a 404 instead of silently succeeding when the path is wrong', async () => {
    const server = await startTtsServer();
    // 故意配一个上游不存在的路径
    const db = dbWithTtsConfig(server.base, '/v1/audio/nope');
    try {
      await assert.rejects(
        () => ttsService.synthesize(db, silentLog, {
          text: '测试', storyboard_id: 1, storage_base: os.tmpdir(),
        }),
        /404/
      );
    } finally {
      await server.close();
      db.close();
    }
  });
});
