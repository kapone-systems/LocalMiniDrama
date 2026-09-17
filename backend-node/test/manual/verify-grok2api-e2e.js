// 端到端集成验证（非单元测试，手动运行）
// 起一个模拟 grok2api 的 HTTP 服务，把配置写进真实的 DB 结构，
// 然后走 LMD 真实的 callImageApi / callVideoApi 路径，验证端到端可用。
//
// 运行：node scripts/verify-grok2api-e2e.js
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');

const imageClient = require('../../src/services/imageClient');
const videoClient = require('../../src/services/videoClient');
const aiConfigService = require('../../src/services/aiConfigService');

const silentLog = { info() {}, warn() {}, error() {} };
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// ── 模拟 grok2api ────────────────────────────────────────────────────────────
const requests = [];
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf-8');
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (_) {}
    requests.push({ method: req.method, url: req.url, body });

    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/v1/models') {
      res.end(JSON.stringify({
        object: 'list',
        data: [
          { id: 'grok-imagine-image', object: 'model' },
          { id: 'grok-imagine-video', object: 'model' },
          { id: 'grok-4.5', object: 'model' },
        ],
      }));
      return;
    }
    if (req.url === '/v1/images/generations' || req.url === '/v1/images/edits') {
      // 模拟真实上游的严格校验，确保 LMD 没有发不该发的字段
      if ('quality' in body && body.model !== 'grok-imagine-image-2.0') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { code: 'invalid_parameter', message: 'quality 仅支持 grok-imagine-image-2.0' } }));
        return;
      }
      if ('size' in body) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { code: 'invalid_parameter', message: 'size 不受支持' } }));
        return;
      }
      if (!body.aspect_ratio) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { code: 'invalid_parameter', message: '缺少 aspect_ratio' } }));
        return;
      }
      if (req.url === '/v1/images/edits' && (!Array.isArray(body.images) || body.images.length === 0)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { code: 'invalid_request', message: 'images 不能为空' } }));
        return;
      }
      res.end(JSON.stringify({ data: [{ url: 'https://cdn.example/out.png' }] }));
      return;
    }
    if (req.url === '/v1/videos/generations') {
      // 模拟真实上游：校验未知字段、互斥、参考图上限
      const allowed = new Set(['model', 'prompt', 'duration', 'aspect_ratio', 'resolution', 'image', 'reference_images']);
      const unknown = Object.keys(body).filter((k) => !allowed.has(k));
      if (unknown.length) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: '未知字段: ' + unknown.join(',') } }));
        return;
      }
      if (body.image && body.reference_images) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: 'image 不能与 reference_images 同时使用' } }));
        return;
      }
      if (Array.isArray(body.reference_images) && body.reference_images.length > 7) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: 'reference_images 不能超过 7 张' } }));
        return;
      }
      if (body.model === 'grok-imagine-video' && body.reference_images && body.duration > 10) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: '参考图生视频最长 10 秒' } }));
        return;
      }
      res.end(JSON.stringify({ request_id: 'req_e2e' }));
      return;
    }
    if (req.url.startsWith('/v1/videos/')) {
      res.end(JSON.stringify({
        status: 'done', model: 'grok-imagine-video', progress: 100,
        video: { url: 'https://cdn.example/out.mp4', respect_moderation: true },
      }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
});

function buildDb(baseUrl) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ai_service_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, service_type TEXT, provider TEXT,
      api_protocol TEXT, name TEXT, base_url TEXT, api_key TEXT, model TEXT,
      default_model TEXT, endpoint TEXT, query_endpoint TEXT, priority INTEGER,
      is_default INTEGER, is_active INTEGER, settings TEXT, deleted_at TEXT,
      created_at TEXT, updated_at TEXT
    );
  `);
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO ai_service_configs (service_type, provider, api_protocol, name, base_url, api_key,
      model, default_model, endpoint, query_endpoint, priority, is_default, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  ins.run('image', 'grok2api', 'grok2api', 'img', baseUrl, 'g2a_k',
    JSON.stringify(['grok-imagine-image']), 'grok-imagine-image', '/v1/images/generations', '', 10, 1, 1, now, now);
  ins.run('storyboard_image', 'grok2api', 'grok2api', 'sb', baseUrl, 'g2a_k',
    JSON.stringify(['grok-imagine-image']), 'grok-imagine-image', '/v1/images/generations', '', 10, 1, 1, now, now);
  ins.run('video', 'grok2api', 'grok2api', 'vid', baseUrl, 'g2a_k',
    JSON.stringify(['grok-imagine-video']), 'grok-imagine-video',
    '/v1/videos/generations', '/v1/videos/{taskId}', 10, 1, 1, now, now);
  return db;
}

(async () => {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${mock.address().port}`;
  console.log('mock grok2api at', baseUrl, '\n');

  const db = buildDb(baseUrl);

  // 1. 测试连接：模型存在
  try {
    await aiConfigService.testConnection({
      base_url: baseUrl, api_key: 'g2a_k', model: 'grok-imagine-image',
      provider: 'grok2api', service_type: 'image',
    });
    check('testConnection 通过（模型存在）', true);
  } catch (e) {
    check('testConnection 通过（模型存在）', false, e.message);
  }

  // 2. 测试连接：模型不存在应报错
  try {
    await aiConfigService.testConnection({
      base_url: baseUrl, api_key: 'g2a_k', model: 'grok-imagine-medium',
      provider: 'grok2api', service_type: 'image',
    });
    check('testConnection 拒绝不存在的模型', false, '竟然通过了');
  } catch (e) {
    check('testConnection 拒绝不存在的模型', /不存在/.test(e.message), e.message.slice(0, 70));
  }

  // 3. 文生图（真实 callImageApi 路径）
  requests.length = 0;
  const img1 = await imageClient.callImageApi(db, silentLog, {
    prompt: 'a cat', size: '2560x1440', image_gen_id: 1,
  });
  const r1 = requests[0];
  check('文生图成功出图', img1.image_url === 'https://cdn.example/out.png', JSON.stringify(img1).slice(0, 90));
  check('文生图走 /v1/images/generations', r1?.url === '/v1/images/generations', r1?.url);
  check('文生图发 aspect_ratio=16:9', r1?.body.aspect_ratio === '16:9', JSON.stringify(r1?.body));
  check('文生图不发 size/quality', !('size' in (r1?.body || {})) && !('quality' in (r1?.body || {})));

  // 4. 图生图（带参考图 → 必须走 edits）
  requests.length = 0;
  const img2 = await imageClient.callImageApi(db, silentLog, {
    prompt: 'same person', size: '1440x2560', image_gen_id: 2,
    imageServiceType: 'storyboard_image',
    reference_image_urls: ['https://cdn.example/ref1.png', 'https://cdn.example/ref2.png'],
  });
  const r2 = requests[0];
  check('图生图成功出图', img2.image_url === 'https://cdn.example/out.png', JSON.stringify(img2).slice(0, 90));
  check('参考图走 /v1/images/edits', r2?.url === '/v1/images/edits', r2?.url);
  check('参考图在 images[{url}] 字段', r2?.body.images?.length === 2, JSON.stringify(r2?.body.images));
  check('图生图 aspect_ratio=9:16', r2?.body.aspect_ratio === '9:16', r2?.body.aspect_ratio);

  // 5. 视频提交（真实 callVideoApi 路径）
  requests.length = 0;
  const vid1 = await videoClient.callVideoApi(db, silentLog, {
    prompt: 'a cat running', duration: 6, aspect_ratio: '16:9', resolution: '720p',
    video_gen_id: 1, drama_id: 1,
  });
  const v1 = requests.find((r) => r.url === '/v1/videos/generations');
  check('文生视频提交成功', vid1.task_id === 'req_e2e', JSON.stringify(vid1).slice(0, 90));
  check('视频提交走 /v1/videos/generations', !!v1, v1?.url);
  check('视频 body 无未知字段', !!v1 && !('seed' in v1.body) && !('watermark' in v1.body), JSON.stringify(v1?.body));

  // 6. 图生视频（首帧）
  requests.length = 0;
  await videoClient.callVideoApi(db, silentLog, {
    prompt: 'animate', duration: 6, aspect_ratio: '16:9', resolution: '720p',
    first_frame_url: 'https://cdn.example/first.png', video_gen_id: 2, drama_id: 1,
  });
  const v2 = requests.find((r) => r.url === '/v1/videos/generations');
  check('图生视频首帧走 image{url}', v2?.body.image?.url === 'https://cdn.example/first.png', JSON.stringify(v2?.body.image));

  // 7. 视频参考图超限被截断
  requests.length = 0;
  await videoClient.callVideoApi(db, silentLog, {
    prompt: 'many refs', duration: 15, aspect_ratio: '16:9', resolution: '720p',
    reference_urls: Array.from({ length: 10 }, (_, i) => `https://cdn.example/r${i}.png`),
    video_gen_id: 3, drama_id: 1,
  });
  const v3 = requests.find((r) => r.url === '/v1/videos/generations');
  check('参考图截断到 7 张', v3?.body.reference_images?.length === 7, String(v3?.body.reference_images?.length));
  check('duration 钳制到 10s', v3?.body.duration === 10, String(v3?.body.duration));

  // 8. 视频轮询
  const polled = await videoClient.pollVideoTask(
    db, silentLog, 1, 'req_e2e',
    { base_url: baseUrl, api_key: 'g2a_k', provider: 'grok2api', model: ['grok-imagine-video'] },
    3, 5
  );
  check('轮询解析出 video.url', polled.video_url === 'https://cdn.example/out.mp4', JSON.stringify(polled));

  await new Promise((r) => mock.close(r));
  db.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} 通过 ====`);
  if (failed.length) {
    console.log('失败项：');
    for (const f of failed) console.log('  -', f.name, '|', f.detail);
    process.exit(1);
  }
})();
