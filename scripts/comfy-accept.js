/**
 * Real-ComfyUI acceptance for LocalMiniDrama comfyui protocol.
 * Requires ComfyUI on 127.0.0.1:8188 and LMD backend on 127.0.0.1:5679.
 */
const fs = require('fs');
const path = require('path');
const { Blob, FormData } = globalThis;

const LMD = 'http://127.0.0.1:5679/api/v1';
const ROOT = path.resolve(__dirname, '..');
const EXAMPLE = path.join(ROOT, 'docs', 'comfyui', 'example-t2i-api.json');
const WF_DIR = 'D:/tmp/ComfyUI-lmd/lmd_workflows';
const OUT = path.join(ROOT, 'backend-node', 'data', 'comfy-accept-report.json');

async function api(method, p, body, isForm) {
  const headers = {};
  let payload = body;
  if (!isForm && body != null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(LMD + p, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`${method} ${p} non-json ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!json.success) {
    const msg = json.error?.message || JSON.stringify(json);
    const err = new Error(`${method} ${p} failed: ${msg}`);
    err.payload = json;
    throw err;
  }
  return json.data;
}

async function importWf(filePath, name) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/json' }), path.basename(filePath));
  fd.append('name', name);
  return api('POST', '/ai-configs/comfy-workflows', fd, true);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pollImage(id, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const item = await api('GET', `/images/${id}`);
    if (item.status === 'completed' || item.status === 'failed') return item;
    await sleep(1000);
  }
  throw new Error(`image ${id} timeout`);
}

async function pollVideo(id, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const item = await api('GET', `/videos/${id}`);
    if (item.status === 'completed' || item.status === 'failed') return item;
    await sleep(1000);
  }
  throw new Error(`video ${id} timeout`);
}

async function pollMerge(id, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const item = await api('GET', `/video-merges/${id}`);
    if (item.status === 'completed' || item.status === 'failed') return item;
    await sleep(1000);
  }
  throw new Error(`merge ${id} timeout`);
}

async function main() {
  const report = { steps: [] };
  const note = (k, v) => { report.steps.push({ k, ...v, t: new Date().toISOString() }); console.log(k, JSON.stringify(v).slice(0, 500)); };

  const stats = await fetch('http://127.0.0.1:8188/system_stats').then((r) => r.json());
  note('comfy_system_stats', { version: stats.system?.comfyui_version, os: stats.system?.os });

  const test = await api('POST', '/ai-configs/test', {
    base_url: 'http://127.0.0.1:8188',
    api_key: '',
    api_protocol: 'comfyui',
    provider: 'comfyui',
    service_type: 'image',
    model: 'character-t2i',
  });
  note('test_connection_empty_key', test);

  const importedExample = await importWf(EXAMPLE, 'character-t2i');
  note('import_example_t2i', importedExample);

  await api('POST', '/ai-configs', {
    service_type: 'image',
    name: 'Comfy accept 文生图',
    provider: 'comfyui',
    api_protocol: 'comfyui',
    base_url: 'http://127.0.0.1:8188',
    api_key: '',
    model: ['character-t2i'],
    default_model: 'character-t2i',
    is_default: true,
    is_active: true,
    settings: JSON.stringify({ timeout_seconds: 120, poll_interval_ms: 500, free_before_video: true }),
  });

  const drama = await api('POST', '/dramas', {
    title: 'Comfy验收剧',
    description: 'local comfyui protocol acceptance',
    genre: 'test',
    style: 'realistic',
  });
  note('drama', { id: drama.id, title: drama.title });

  await api('PUT', `/dramas/${drama.id}/characters`, {
    characters: [{
      name: '阿宁',
      role: '主角',
      appearance: 'a young woman with short black hair, red coat, standing in snow',
      description: 'a young woman with short black hair, red coat',
      polished_prompt: 'a young woman with short black hair wearing a red coat, standing in snow, cinematic',
    }],
  });
  const dramaFull = await api('GET', `/dramas/${drama.id}`);
  const character = (dramaFull.characters || [])[0];
  note('character', { id: character.id, name: character.name });

  const failImg = await api('POST', '/images', {
    drama_id: drama.id,
    prompt: 'should fail missing checkpoint',
    model: 'character-t2i',
    size: '512x512',
  });
  const failResult = await pollImage(failImg.id);
  note('missing_checkpoint_fail', { status: failResult.status, error_msg: failResult.error_msg });
  if (failResult.status !== 'failed') throw new Error('expected checkpoint failure');
  if (!/CheckpointLoaderSimple|ckpt|safetensors|Positive|节点/i.test(failResult.error_msg || '')) {
    throw new Error('failure message not readable: ' + failResult.error_msg);
  }

  const wfT2i = await importWf(path.join(WF_DIR, 'character-t2i.json'), 'character-t2i');
  const wfI2i = await importWf(path.join(WF_DIR, 'storyboard-i2i.json'), 'storyboard-i2i');
  const wfI2v = await importWf(path.join(WF_DIR, 'storyboard-i2v.json'), 'storyboard-i2v');
  note('import_working_workflows', { wfT2i, wfI2i, wfI2v });

  await api('POST', '/ai-configs', {
    service_type: 'storyboard_image',
    name: 'Comfy accept 分镜图',
    provider: 'comfyui',
    api_protocol: 'comfyui',
    base_url: 'http://127.0.0.1:8188',
    api_key: '',
    model: ['storyboard-i2i'],
    default_model: 'storyboard-i2i',
    is_default: true,
    is_active: true,
    settings: JSON.stringify({ timeout_seconds: 120, poll_interval_ms: 500 }),
  });
  await api('POST', '/ai-configs', {
    service_type: 'video',
    name: 'Comfy accept 视频',
    provider: 'comfyui',
    api_protocol: 'comfyui',
    base_url: 'http://127.0.0.1:8188',
    api_key: '',
    model: ['storyboard-i2v'],
    default_model: 'storyboard-i2v',
    is_default: true,
    is_active: true,
    settings: JSON.stringify({ timeout_seconds: 180, poll_interval_ms: 500, free_before_video: true }),
  });

  const charGen = await api('POST', `/characters/${character.id}/generate-image`, { model: 'character-t2i' });
  const charImageId = charGen.image_generation?.id;
  if (!charImageId) throw new Error('no image_generation from character generate-image: ' + JSON.stringify(charGen).slice(0, 400));
  const charImage = await pollImage(charImageId);
  note('character_image', { id: charImage.id, status: charImage.status, local_path: charImage.local_path, error_msg: charImage.error_msg });
  if (charImage.status !== 'completed' || !charImage.local_path) throw new Error('character image failed');

  const charAfter = (await api('GET', `/dramas/${drama.id}`)).characters[0];
  note('character_card', { image_url: charAfter.image_url, local_path: charAfter.local_path });
  if (!charAfter.local_path) throw new Error('character card has no local_path');

  await api('PUT', `/dramas/${drama.id}/episodes`, {
    episodes: [{ episode_number: 1, title: '第一集', duration: 8, script_content: '阿宁走在雪地里。' }],
  });
  const drama2 = await api('GET', `/dramas/${drama.id}`);
  const episode = (drama2.episodes || [])[0];
  note('episode', { id: episode.id, title: episode.title });

  const sb = await api('POST', '/storyboards', {
    episode_id: episode.id,
    storyboard_number: 1,
    title: '雪地行走',
    duration: 3,
    image_prompt: 'the same woman walking in snow, cinematic',
    video_prompt: 'slow camera pan, walking in snow',
    action: 'walks forward',
    characters: [character.id],
  });
  note('storyboard', { id: sb.id });

  const sbImg = await api('POST', '/images', {
    drama_id: drama.id,
    storyboard_id: sb.id,
    prompt: 'the same woman walking in snow, cinematic',
    model: 'storyboard-i2i',
    size: '512x512',
    reference_images: [charAfter.local_path],
  });
  const sbImage = await pollImage(sbImg.id);
  note('storyboard_image', { id: sbImage.id, status: sbImage.status, local_path: sbImage.local_path, error_msg: sbImage.error_msg });
  if (sbImage.status !== 'completed' || !sbImage.local_path) throw new Error('storyboard image failed');

  const vid = await api('POST', '/videos', {
    drama_id: drama.id,
    storyboard_id: sb.id,
    prompt: 'slow camera pan, walking in snow',
    model: 'storyboard-i2v',
    duration: 2,
    first_frame_url: sbImage.local_path,
    image_url: sbImage.local_path,
  });
  const video = await pollVideo(vid.id);
  note('storyboard_video', { id: video.id, status: video.status, local_path: video.local_path, video_url: video.video_url, error_msg: video.error_msg });
  if (video.status !== 'completed' || !video.local_path) throw new Error('video failed');

  const fin = await api('POST', `/episodes/${episode.id}/finalize`, {});
  note('finalize_started', fin);
  const mergeId = fin.merge_id || fin.id;
  if (!mergeId) throw new Error('finalize returned no merge_id: ' + JSON.stringify(fin).slice(0, 400));
  const merged = await pollMerge(mergeId);
  note('episode_merge', { id: mergeId, status: merged.status, merged_url: merged.merged_url, error_msg: merged.error_msg });
  if (merged.status !== 'completed') throw new Error('merge failed: ' + merged.error_msg);

  const storageRoot = path.join(ROOT, 'backend-node', 'data', 'storage');
  const evidence = {
    character_file: charAfter.local_path && path.join(storageRoot, charAfter.local_path),
    storyboard_file: sbImage.local_path && path.join(storageRoot, sbImage.local_path),
    video_file: video.local_path && path.join(storageRoot, video.local_path),
    merge_file: merged.merged_url,
  };
  for (const [k, pth] of Object.entries(evidence)) {
    if (!pth) continue;
    const abs = path.isAbsolute(pth) ? pth : path.join(storageRoot, pth);
    evidence[k + '_exists'] = fs.existsSync(abs);
    if (fs.existsSync(abs)) evidence[k + '_size'] = fs.statSync(abs).size;
  }
  note('files_on_disk', evidence);
  if (!evidence.character_file_exists || !evidence.storyboard_file_exists || !evidence.video_file_exists) {
    throw new Error('expected files missing on disk');
  }

  report.ok = true;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('ACCEPT_OK', OUT);
}

main().catch((e) => {
  console.error('ACCEPT_FAIL', e.message);
  try {
    fs.writeFileSync(OUT, JSON.stringify({ ok: false, error: e.message, stack: e.stack }, null, 2));
  } catch (_) {}
  process.exit(1);
});
