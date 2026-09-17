// 真实 grok2api 联调验证：用 LMD 的真实代码路径打真实上游
// 与 verify-grok2api-e2e.js（模拟服务）不同，本脚本直接连真实 grok2api 实例。
//
// 用法：G2A_KEY=g2a_xxx G2A_BASE=http://127.0.0.1:8000 node scripts/verify-grok2api-live.js
const Database = require('better-sqlite3');
const imageClient = require('../../src/services/imageClient');
const videoClient = require('../../src/services/videoClient');
const aiConfigService = require('../../src/services/aiConfigService');

const BASE = process.env.G2A_BASE || 'http://127.0.0.1:8000';
const KEY = process.env.G2A_KEY || '';
if (!KEY) { console.error('缺少 G2A_KEY'); process.exit(2); }

const log = {
  info(msg, meta) { if (process.env.VERBOSE) console.log('  [info]', msg, meta ? JSON.stringify(meta).slice(0, 200) : ''); },
  warn(msg, meta) { console.log('  [WARN]', msg, meta ? JSON.stringify(meta).slice(0, 300) : ''); },
  error(msg, meta) { console.log('  [ERR ]', msg, meta ? JSON.stringify(meta).slice(0, 300) : ''); },
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 160) : ''}`);
}

function buildDb() {
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
  ins.run('image', 'grok2api', 'grok2api', 'live-img', BASE, KEY,
    JSON.stringify(['grok-imagine-image']), 'grok-imagine-image', '/v1/images/generations', '', 10, 1, 1, now, now);
  ins.run('storyboard_image', 'grok2api', 'grok2api', 'live-sb', BASE, KEY,
    JSON.stringify(['grok-imagine-image']), 'grok-imagine-image', '/v1/images/generations', '', 10, 1, 1, now, now);
  ins.run('video', 'grok2api', 'grok2api', 'live-vid', BASE, KEY,
    JSON.stringify(['grok-imagine-video']), 'grok-imagine-video',
    '/v1/videos/generations', '/v1/videos/{taskId}', 10, 1, 1, now, now);
  return db;
}

(async () => {
  console.log(`真实 grok2api: ${BASE}\n`);
  const db = buildDb();

  // 1. 测试连接（真实 /v1/models）
  try {
    await aiConfigService.testConnection({
      base_url: BASE, api_key: KEY, model: 'grok-imagine-image',
      provider: 'grok2api', service_type: 'image',
    });
    check('testConnection 真实上游通过', true);
  } catch (e) {
    check('testConnection 真实上游通过', false, e.message);
  }

  // 2. 测试连接：不存在的模型必须被拒（原 D8 假阳性场景）
  try {
    await aiConfigService.testConnection({
      base_url: BASE, api_key: KEY, model: 'grok-imagine-medium',
      provider: 'grok2api', service_type: 'image',
    });
    check('testConnection 拒绝不存在的模型', false, '竟然通过了');
  } catch (e) {
    check('testConnection 拒绝不存在的模型', /不存在/.test(e.message), e.message.slice(0, 120));
  }

  // 3. 文生图：真实出图（角色/场景图路径）
  const t0 = Date.now();
  const img1 = await imageClient.callImageApi(db, log, {
    prompt: 'a young female detective in a trench coat, standing in a rainy city street at night, cinematic lighting, upper body portrait',
    size: '2560x1440', image_gen_id: 1,
  });
  const hasUrl = !!(img1.image_url && /^https?:\/\//.test(img1.image_url));
  check('文生图真实出图（角色/场景图）', hasUrl, hasUrl ? img1.image_url.slice(0, 90) : JSON.stringify(img1).slice(0, 140));
  if (hasUrl) console.log(`     耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 4. 分镜图：带参考图 → 走 /images/edits（需要 Console 额度）
  if (hasUrl) {
    const img2 = await imageClient.callImageApi(db, log, {
      prompt: 'the same detective now looking over her shoulder, keep her face and outfit identical',
      size: '1440x2560', image_gen_id: 2, imageServiceType: 'storyboard_image',
      reference_image_urls: [img1.image_url],
    });
    const ok2 = !!(img2.image_url && /^https?:\/\//.test(img2.image_url));
    if (ok2) {
      check('带参考图分镜图真实出图（/images/edits）', true, img2.image_url.slice(0, 90));
    } else {
      // 429/额度耗尽属于上游账号状态，不算适配缺陷；如实标注
      const quota = /quota|429|额度/.test(JSON.stringify(img2));
      check('带参考图分镜图真实出图（/images/edits）', false,
        quota ? '上游 Console 额度耗尽（非适配缺陷）: ' + JSON.stringify(img2).slice(0, 120)
              : JSON.stringify(img2).slice(0, 160));
    }
  }

  // 5. 文生视频：真实提交 + 轮询
  const vid1 = await videoClient.callVideoApi(db, log, {
    prompt: 'a red ball rolling slowly across a wooden table, static camera',
    duration: 6, aspect_ratio: '16:9', resolution: '720p',
    video_gen_id: 1, drama_id: 1,
  });
  const submitted = !!vid1.task_id;
  check('文生视频真实提交', submitted, submitted ? 'request_id=' + vid1.task_id : JSON.stringify(vid1).slice(0, 140));

  if (submitted) {
    const polled = await videoClient.pollVideoTask(
      db, log, 1, vid1.task_id,
      { base_url: BASE, api_key: KEY, provider: 'grok2api', model: ['grok-imagine-video'] },
      20, 15000
    );
    const gotVideo = !!(polled.video_url && /^https?:\/\//.test(polled.video_url));
    check('文生视频轮询拿到真实 video.url', gotVideo,
      gotVideo ? polled.video_url.slice(0, 90) : JSON.stringify(polled).slice(0, 140));
  }

  db.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${results.length - failed.length}/${results.length} 通过 ====`);
  if (failed.length) {
    console.log('失败项：');
    for (const f of failed) console.log('  -', f.name, '|', f.detail);
  }
})();
