const protocols = new Map();

function register(proto) {
  if (!proto || !proto.id) throw new Error('protocol.id 必填');
  const id = String(proto.id).toLowerCase();
  const entry = { ...proto, id };
  protocols.set(id, entry);
  for (const alias of proto.aliases || []) {
    protocols.set(String(alias).toLowerCase(), entry);
  }
  return entry;
}

function getProtocol(id) {
  if (!id) return null;
  return protocols.get(String(id).toLowerCase()) || null;
}

function listProtocols() {
  const seen = new Set();
  const out = [];
  for (const p of protocols.values()) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function inferFromRegistry({ provider, model, baseUrl, service } = {}) {
  const ctx = {
    provider: String(provider || '').toLowerCase(),
    model: String(model || ''),
    baseUrl: String(baseUrl || '').toLowerCase(),
    service: String(service || ''),
  };
  for (const p of listProtocols()) {
    if (typeof p.infer !== 'function') continue;
    if (p.infer(ctx)) return p.id;
  }
  return '';
}

function defaultEndpointsFor(id, serviceType) {
  const p = getProtocol(id);
  if (!p || !p.defaultEndpoints) return null;
  const st = String(serviceType || '').toLowerCase();
  const map = p.defaultEndpoints;
  return map[st] || map.image || map.video || null;
}

module.exports = {
  register,
  getProtocol,
  listProtocols,
  inferFromRegistry,
  defaultEndpointsFor,
};
