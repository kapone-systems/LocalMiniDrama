const { joinApiUrl } = require('../utils/apiUrl');

function authHeaders(apiKey, auth) {
  const key = String(apiKey || '');
  const mode = String(auth || 'bearer').toLowerCase();
  if (mode === 'key') return { Authorization: `Key ${key}` };
  if (mode === 'token') return { Authorization: `Token ${key}` };
  if (mode === 'x-api-key') return { 'x-api-key': key };
  if (mode === 'x-key') return { 'X-Key': key };
  if (mode === 'none') return {};
  return { Authorization: `Bearer ${key}` };
}

async function requestJson(method, url, { apiKey, auth, body, extraHeaders, timeoutMs } = {}) {
  const headers = {
    Accept: 'application/json',
    ...authHeaders(apiKey, auth),
    ...(extraHeaders || {}),
  };
  const init = { method: method || 'GET', headers };
  if (body != null) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const ac = new AbortController();
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 120000;
  const timer = setTimeout(() => ac.abort(), ms);
  init.signal = ac.signal;
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    clearTimeout(timer);
    const msg = e && e.name === 'AbortError' ? `请求超时 (${ms}ms)` : (e.message || String(e));
    return { ok: false, status: 0, json: null, raw: '', error: msg, url };
  }
  clearTimeout(timer);
  const raw = await res.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch (_) { json = null; }
  return {
    ok: res.ok,
    status: res.status,
    json,
    raw,
    error: res.ok ? '' : (`HTTP ${res.status}` + (raw ? `: ${raw.slice(0, 240)}` : '')),
    url,
  };
}

function buildUrl(config, endpoint, fallback) {
  return joinApiUrl(config.base_url, endpoint, fallback);
}

function replaceTaskPath(template, taskId) {
  const tid = encodeURIComponent(String(taskId || ''));
  const path = String(template || '');
  if (/\{(taskId|taskid|task_id|id|requestId|request_id|predictionId)\}/i.test(path)) {
    return path
      .replace(/\{taskId\}/gi, tid)
      .replace(/\{task_id\}/gi, tid)
      .replace(/\{id\}/gi, tid)
      .replace(/\{requestId\}/gi, tid)
      .replace(/\{request_id\}/gi, tid)
      .replace(/\{predictionId\}/gi, tid);
  }
  return path;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pollIntervalMs() {
  const n = parseInt(process.env.PROTOCOL_POLL_INTERVAL_MS || '2000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

function imagePollMax() {
  const n = parseInt(process.env.PROTOCOL_IMAGE_POLL_MAX || '90', 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

module.exports = {
  authHeaders,
  requestJson,
  buildUrl,
  replaceTaskPath,
  sleep,
  pollIntervalMs,
  imagePollMax,
  joinApiUrl,
};
