function asHttpUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  if (typeof value === 'string' && value.startsWith('data:image/')) return value.trim();
  return '';
}

function firstUrl(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const u = firstUrl(item);
      if (u) return u;
    }
    return '';
  }
  if (typeof value === 'string') return asHttpUrl(value) || (value.startsWith('data:') ? value : '');
  if (typeof value === 'object') {
    return firstUrl(value.url)
      || firstUrl(value.image_url)
      || firstUrl(value.image)
      || firstUrl(value.video_url)
      || firstUrl(value.video)
      || firstUrl(value.uri)
      || firstUrl(value.href)
      || firstUrl(value.output)
      || firstUrl(value.result);
  }
  return '';
}

function extractTaskId(json) {
  if (!json || typeof json !== 'object') return '';
  const data = json.data;
  const inner = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const arr0 = Array.isArray(data) ? data[0] : null;
  const cands = [
    json.requestId, json.request_id, json.task_id, json.taskId, json.id, json.job_id, json.prediction_id,
    inner && (inner.requestId || inner.request_id || inner.task_id || inner.taskId || inner.id),
    arr0 && (arr0.task_id || arr0.taskId || arr0.id || arr0.requestId),
    json.result && (json.result.task_id || json.result.id),
    json.output && (json.output.task_id || json.output.id),
  ];
  for (const c of cands) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return '';
}

function extractStatus(json) {
  if (!json || typeof json !== 'object') return '';
  const data = json.data;
  const inner = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const arr0 = Array.isArray(data) ? data[0] : null;
  const cands = [
    json.status, json.state, json.task_status,
    inner && (inner.status || inner.state || inner.task_status),
    arr0 && (arr0.status || arr0.state),
    json.output && json.output.task_status,
  ];
  for (const c of cands) {
    if (c != null && String(c).trim()) return String(c).trim().toLowerCase();
  }
  return '';
}

function isFailStatus(status) {
  const s = String(status || '').toLowerCase();
  return ['failed', 'failure', 'error', 'cancelled', 'canceled', 'fail', 'timeout', 'expired'].includes(s);
}

function isDoneStatus(status) {
  const s = String(status || '').toLowerCase();
  return ['completed', 'complete', 'succeeded', 'succeed', 'success', 'ok', 'done', 'finished'].includes(s);
}

function extractErrorMessage(json) {
  if (!json || typeof json !== 'object') return '';
  const inner = json.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : null;
  const err = json.error || inner?.error;
  const cands = [
    typeof err === 'string' ? err : err?.message,
    json.message, json.msg, inner?.message, inner?.fail_reason, json.fail_reason,
  ];
  for (const c of cands) {
    if (c != null && String(c).trim() && !/^https?:\/\//i.test(String(c))) return String(c).trim();
  }
  return '';
}

function extractImageUrl(json) {
  if (!json) return '';
  if (typeof json === 'string') return firstUrl(json);
  const data = json.data;
  const inner = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const arr0 = Array.isArray(data) ? data[0] : null;
  const images = json.images || inner?.images || json.result?.images || inner?.result?.images;
  const img0 = Array.isArray(images) ? images[0] : images;
  const cands = [
    arr0 && (arr0.url || arr0.image_url || arr0.b64_json),
    firstUrl(img0),
    firstUrl(json.result),
    firstUrl(inner?.result),
    firstUrl(json.output),
    firstUrl(inner?.output),
    json.url,
    inner?.url,
  ];
  for (const c of cands) {
    if (typeof c === 'string' && c && !c.startsWith('http') && !c.startsWith('data:') && c.length > 80) {
      return `data:image/png;base64,${c.replace(/\s/g, '')}`;
    }
    const u = firstUrl(c);
    if (u) return u;
  }
  return '';
}

function extractVideoUrl(json) {
  if (!json) return '';
  const data = json.data;
  const inner = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const videos = json.result?.videos || inner?.result?.videos || json.videos || inner?.videos;
  const vid0 = Array.isArray(videos) ? videos[0] : videos;
  const cands = [
    firstUrl(vid0),
    json.video_url, inner?.video_url, json.result_url, inner?.result_url,
    firstUrl(json.result), firstUrl(inner?.result),
    firstUrl(json.output), firstUrl(inner?.output),
    json.file_id, inner?.file_id,
  ];
  for (const c of cands) {
    const u = firstUrl(c);
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}

function sizeToRatio(size) {
  const s = String(size || '').trim().toLowerCase().replace(/\s/g, '');
  if (!s) return '16:9';
  if (/^\d+:\d+(\.\d+)?$/.test(s)) return s;
  const m = s.match(/^(\d+)[x*](\d+)$/);
  if (!m) return '16:9';
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!w || !h) return '16:9';
  const r = w / h;
  if (r >= 1.6) return '16:9';
  if (r >= 1.4) return '3:2';
  if (r >= 1.15) return '4:3';
  if (r >= 0.87) return '1:1';
  if (r >= 0.72) return '3:4';
  if (r >= 0.55) return '2:3';
  return '9:16';
}

function collectHttpRefs(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u) || u.startsWith('data:image/'));
}

module.exports = {
  asHttpUrl,
  firstUrl,
  extractTaskId,
  extractStatus,
  isFailStatus,
  isDoneStatus,
  extractErrorMessage,
  extractImageUrl,
  extractVideoUrl,
  sizeToRatio,
  collectHttpRefs,
};
