// 推理模型流式静默超时的回归测试
// 背景：grok-4.6 等推理模型会先输出 reasoning_content，随后长时间静默（实测 112-120 秒）
// 才吐正文。generateText 曾把静默超时硬编码为 60 秒，导致故事生成在正文到达前就被
// req.destroy() 掉，任务以 "AI stream silence timeout after 60000ms" 失败，剧本不入库。
// 这里用本地 HTTP 服务复现「先静默、后出正文」的流，验证超时可配置且默认值足够宽松。
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const Database = require('better-sqlite3');
const aiClient = require('../src/services/aiClient');

const silentLog = { info() {}, warn() {}, error() {} };

/**
 * 模拟推理模型：先发 reasoning_content，然后静默 silenceMs，最后发正文并结束。
 * @returns {{ base: string, close: () => Promise<void>, observed: object }}
 */
function startReasoningModelServer({ silenceMs = 0, content = '{"episodes":[{"episode":1,"content":"正文"}]}' } = {}) {
  const observed = { requests: 0, body: null };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c.toString('utf-8'); });
    req.on('end', () => {
      observed.requests++;
      try { observed.body = JSON.parse(raw); } catch (_) { observed.body = null; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta) => `data: ${JSON.stringify({ choices: [{ delta, index: 0 }] })}\n\n`;
      // 思考阶段：立即返回，让客户端确认连接正常
      res.write(chunk({ role: 'assistant' }));
      res.write(chunk({ reasoning_content: '思考中' }));
      // 静默阶段：不发任何字节，复现推理模型的长时间停顿
      setTimeout(() => {
        res.write(chunk({ content }));
        res.write('data: [DONE]\n\n');
        res.end();
      }, silenceMs);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}/v1`,
        observed,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function dbWithTextConfig(baseUrl) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, service_type TEXT, provider TEXT, api_protocol TEXT,
    name TEXT, base_url TEXT, api_key TEXT, model TEXT, default_model TEXT, endpoint TEXT,
    query_endpoint TEXT, priority INTEGER, is_default INTEGER, is_active INTEGER, settings TEXT,
    voice_id TEXT, group_id TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT)`);
  db.prepare(`INSERT INTO ai_service_configs
    (service_type, provider, api_protocol, name, base_url, api_key, model, default_model, endpoint,
     priority, is_default, is_active, created_at, updated_at)
    VALUES ('text','grok2api','openai','t',?,'g2a_test','["grok-4.6"]','grok-4.6','/chat/completions',
     10,1,1,?,?)`)
    .run(baseUrl, new Date().toISOString(), new Date().toISOString());
  return db;
}

describe('aiClient.generateText silence timeout', () => {
  it('waits out a reasoning-model stall instead of failing at 60s', async () => {
    // 静默 1.5 秒：远小于新的默认超时（120 秒），旧实现的 60 秒硬编码也覆盖不到这个用例，
    // 因此单独用一个小超时值来证明「静默不会误判失败」这一行为本身。
    const server = await startReasoningModelServer({ silenceMs: 1500, content: '正文内容' });
    const db = dbWithTextConfig(server.base);
    try {
      const text = await aiClient.generateText(db, silentLog, 'text', '写剧本', '你是编剧', {
        silence_timeout_ms: 30000,
      });
      assert.equal(text, '正文内容');
      assert.equal(server.observed.requests, 1);
    } finally {
      await server.close();
      db.close();
    }
  });

  it('honours a caller-provided silence timeout and fails when the stall exceeds it', async () => {
    // 静默 2 秒、超时 300ms：应判定超时，且错误信息带上实际生效的超时值，
    // 便于日志区分「配置太小」与「上游真的断了」。
    const server = await startReasoningModelServer({ silenceMs: 2000, content: '不该到达' });
    const db = dbWithTextConfig(server.base);
    try {
      await assert.rejects(
        () => aiClient.generateText(db, silentLog, 'text', '写剧本', '你是编剧', { silence_timeout_ms: 300 }),
        /AI stream silence timeout after 300ms/
      );
    } finally {
      await server.close();
      db.close();
    }
  });

  it('defaults to 120s so a 60s reasoning stall no longer aborts the request', async () => {
    // 静默 61 秒：旧实现在第 60 秒就会失败。这里断言默认超时确实 > 60 秒，
    // 避免测试真的等 61 秒导致时长失控。
    assert.ok(
      aiClient.DEFAULT_STREAM_SILENCE_MS > 60000,
      `默认静默超时应大于 60 秒，实际 ${aiClient.DEFAULT_STREAM_SILENCE_MS}ms`
    );
    assert.equal(aiClient.resolveSilenceTimeoutMs({}), aiClient.DEFAULT_STREAM_SILENCE_MS);
  });
});

describe('aiClient.resolveSilenceTimeoutMs', () => {
  it('uses the caller-provided timeout when it is a positive number', () => {
    assert.equal(aiClient.resolveSilenceTimeoutMs({ silence_timeout_ms: 180000 }), 180000);
    assert.equal(aiClient.resolveSilenceTimeoutMs({ silence_timeout_ms: '180000' }), 180000);
  });

  it('falls back instead of aborting immediately on invalid values', () => {
    // 0 / 负数 / 非数字都不应被当成「立刻超时」，否则一次误配会让所有生成任务瞬间失败。
    const fallback = 45000;
    for (const bad of [0, -1, 'abc', NaN, null, undefined]) {
      assert.equal(
        aiClient.resolveSilenceTimeoutMs({ silence_timeout_ms: bad }, fallback),
        fallback,
        `silence_timeout_ms=${String(bad)} 应回退到 ${fallback}`
      );
    }
  });
});
