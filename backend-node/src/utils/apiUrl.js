/**
 * 拼接 API 请求地址，消除 base_url 与 endpoint 之间的重复版本段。
 *
 * LMD 的配置里 base_url 有两种历史写法：带 `/v1`（旧库与部分预设）和不带（新预设，
 * endpoint 自带 `/v1`）。两者混用时直接拼接会产生 `/v1/v1/...` 这样的双前缀——
 * 上游只会返回 404，且「测试连接」通常查不出来。
 */

/** 从 base_url 尾部提取版本段（/v1、/v2…），无则返回空串 */
function trailingVersionPrefix(baseUrl) {
  const m = String(baseUrl || '').replace(/\/+$/, '').match(/\/(v\d+)$/i);
  return m ? '/' + m[1] : '';
}

/**
 * 拼接 base_url + endpoint。
 * base 以 `/v1` 结尾且 endpoint 也以 `/v1/` 开头时，去掉 endpoint 上重复的那一段。
 *
 * @param {string} baseUrl 配置里的 base_url（可带可不带尾部 /v1）
 * @param {string} endpoint 配置里的 endpoint；为空时用 fallbackEndpoint
 * @param {string} [fallbackEndpoint] endpoint 为空时的兜底路径
 */
function joinApiUrl(baseUrl, endpoint, fallbackEndpoint) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  let ep = String(endpoint == null ? '' : endpoint).trim() || String(fallbackEndpoint || '');
  if (!ep) return base;
  if (!ep.startsWith('/')) ep = '/' + ep;

  const versionPrefix = trailingVersionPrefix(base);
  if (versionPrefix) {
    const lowerEp = ep.toLowerCase();
    const lowerPrefix = versionPrefix.toLowerCase();
    if (lowerEp === lowerPrefix) ep = '';
    else if (lowerEp.startsWith(lowerPrefix + '/')) ep = ep.slice(versionPrefix.length);
  }
  return base + ep;
}

module.exports = { joinApiUrl, trailingVersionPrefix };
