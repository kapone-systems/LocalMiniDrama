const path = require('path');
const multer = require('multer');
const aiConfigService = require('../services/aiConfigService');
const response = require('../response');
const store = require('../protocols/comfyui/workflowStore');
const { assertApiWorkflow } = require('../protocols/comfyui/inject');

const comfyWorkflowUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.json')) return cb(new Error('只支持 .json 工作流文件'));
    cb(null, true);
  },
});

function list(db) {
  return (req, res) => {
    const list = aiConfigService.listConfigs(db, req.query.service_type);
    response.success(res, list);
  };
}

function get(db) {
  return (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return response.badRequest(res, '无效的配置ID');
    const config = aiConfigService.getConfig(db, id);
    if (!config) return response.notFound(res, '配置不存在');
    response.success(res, config);
  };
}

function vendorLock(cfg) {
  return (req, res) => {
    const status = aiConfigService.getVendorLockStatus(cfg);
    response.success(res, status);
  };
}

function create(db, log, cfg) {
  return (req, res) => {
    if (aiConfigService.getVendorLockStatus(cfg).enabled) {
      return response.badRequest(res, '当前为厂商锁定模式，不允许添加配置');
    }
    const body = req.body || {};
    if (!body.service_type || !body.name || !body.provider || !body.base_url) {
      return response.badRequest(res, '缺少必填字段: service_type, name, provider, base_url');
    }
    if (body.api_key === undefined || body.api_key === null) {
      if (aiConfigService.isComfyUiRequest(body)) body.api_key = '';
      else return response.badRequest(res, '缺少必填字段: api_key');
    }
    try {
      const config = aiConfigService.createConfig(db, log, {
        ...body,
        model: body.model ?? [],
      });
      response.created(res, config);
    } catch (err) {
      log.errorw('Create AI config failed', { error: err.message });
      response.internalError(res, '创建失败');
    }
  };
}

function update(db, log, cfg) {
  return (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return response.badRequest(res, '无效的配置ID');

    let body = req.body || {};
    // 锁定模式下只允许修改 api_key、default_model、is_default
    if (aiConfigService.getVendorLockStatus(cfg).enabled) {
      const allowed = {};
      if (body.api_key !== undefined) allowed.api_key = body.api_key;
      if (body.default_model !== undefined) allowed.default_model = body.default_model;
      if (body.is_default !== undefined) allowed.is_default = body.is_default;
      body = allowed;
    }

    const config = aiConfigService.updateConfig(db, log, id, body);
    if (!config) return response.notFound(res, '配置不存在');
    response.success(res, config);
  };
}

function remove(db, log, cfg) {
  return (req, res) => {
    if (aiConfigService.getVendorLockStatus(cfg).enabled) {
      return response.badRequest(res, '当前为厂商锁定模式，不允许删除配置');
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return response.badRequest(res, '无效的配置ID');
    const ok = aiConfigService.deleteConfig(db, log, id);
    if (!ok) return response.notFound(res, '配置不存在');
    response.success(res, { message: '删除成功' });
  };
}

function bulkUpdateKey(db, log, cfg) {
  return (req, res) => {
    if (!aiConfigService.getVendorLockStatus(cfg).enabled) {
      return response.badRequest(res, '批量换Key仅在厂商锁定模式下可用');
    }
    const { api_key } = req.body || {};
    if (!api_key || !api_key.trim()) {
      return response.badRequest(res, '请提供新的 API Key');
    }
    try {
      const count = aiConfigService.bulkUpdateApiKey(db, log, api_key.trim());
      response.success(res, { updated: count, message: `已更新 ${count} 条配置的 API Key` });
    } catch (err) {
      log.error('Bulk update api_key failed', { error: err.message });
      response.internalError(res, '批量换Key失败');
    }
  };
}

function testConnection(log) {
  return async (req, res) => {
    const body = req.body || {};
    if (!body.base_url) {
      return response.badRequest(res, '缺少 base_url');
    }
    if (!body.api_key && !aiConfigService.isComfyUiRequest(body)) {
      return response.badRequest(res, '缺少 base_url 或 api_key');
    }
    try {
      const extra = await aiConfigService.testConnection({
        base_url: body.base_url,
        api_key: body.api_key,
        model: body.model,
        provider: body.provider,
        api_protocol: body.api_protocol,
        endpoint: body.endpoint,
        service_type: body.service_type,
        settings: body.settings,
      });
      const payload = { message: '连接测试成功' };
      if (extra && typeof extra === 'object') {
        if (extra.message) payload.message = extra.message;
        if (extra.version) payload.version = extra.version;
        if (extra.workflows) payload.workflows = extra.workflows;
      }
      response.success(res, payload);
    } catch (err) {
      log.error('AI config test connection failed', { error: err.message });
      response.badRequest(res, '连接测试失败: ' + (err.message || '未知错误'));
    }
  };
}

function workflowConfigFromReq(req, cfg) {
  const body = req.body || {};
  const query = req.query || {};
  const rawStorage = cfg?.storage?.local_path || './data/storage';
  const storagePath = path.isAbsolute(rawStorage) ? rawStorage : path.join(process.cwd(), rawStorage);
  return {
    settings: body.settings || query.settings || null,
    storage_local_path: storagePath,
  };
}

function listComfyWorkflows(cfg) {
  return (req, res) => {
    try {
      const config = workflowConfigFromReq(req, cfg);
      const names = store.listWorkflowNames(config);
      const items = names.map((name) => {
        let has_positive = false;
        try {
          const wf = store.loadWorkflow(config, name);
          has_positive = store.workflowHasPositive(wf);
        } catch (_) {}
        return { name, has_positive };
      });
      response.success(res, { items, dir: store.resolveWorkflowsDir(config) });
    } catch (err) {
      response.badRequest(res, err.message || '列出工作流失败');
    }
  };
}

function importComfyWorkflow(cfg, log) {
  return (req, res) => {
    if (!req.file || !req.file.buffer) {
      return response.badRequest(res, '请选择工作流 JSON 文件');
    }
    let json;
    try {
      json = JSON.parse(req.file.buffer.toString('utf8'));
    } catch (e) {
      return response.badRequest(res, '工作流不是合法 JSON: ' + e.message);
    }
    try {
      assertApiWorkflow(json);
    } catch (e) {
      return response.badRequest(res, e.message);
    }
    const original = String(req.file.originalname || 'workflow.json');
    const stem = (req.body && req.body.name) || original.replace(/\.json$/i, '');
    try {
      const saved = store.saveWorkflow(workflowConfigFromReq(req, cfg), stem, json);
      const warning = saved.has_positive
        ? ''
        : '未找到 Positive 标题，生图前请给 CLIPTextEncode 加上 Positive，或在 settings.mapping 里指定节点 id';
      if (log) log.info('[comfyui] 导入工作流', { name: saved.name, has_positive: saved.has_positive });
      response.success(res, { ...saved, warning });
    } catch (e) {
      response.badRequest(res, e.message || '导入失败');
    }
  };
}

function deleteComfyWorkflow(cfg, log) {
  return (req, res) => {
    const name = req.params.name;
    try {
      const deleted = store.deleteWorkflow(workflowConfigFromReq(req, cfg), name);
      if (log) log.info('[comfyui] 删除工作流', { name: deleted.name });
      response.success(res, deleted);
    } catch (e) {
      response.badRequest(res, e.message || '删除失败');
    }
  };
}

/** ModelArk / 方舟私有资产库：代理调用 CreateAssetGroup、ListAssets 等（与官方 Action 名一致） */
function modelArkAsset(log) {
  return async (req, res) => {
    const body = req.body || {};
    const action = (body.action || '').toString().trim();
    try {
      const modelArkAssetProxyService = require('../services/modelArkAssetProxyService');
      const data = await modelArkAssetProxyService.callModelArkAsset(
        {
          base_url: body.base_url,
          api_key: body.api_key,
          action,
          body: body.payload,
          path_mode: body.path_mode,
          http_method: body.http_method,
          api_version: body.api_version,
          auth_mode: body.auth_mode,
          access_key_id: body.access_key_id,
          secret_access_key: body.secret_access_key,
          sign_region: body.sign_region,
          sign_service: body.sign_service,
          session_token: body.session_token,
          project_name: body.project_name,
        },
        log
      );
      response.success(res, data);
    } catch (err) {
      log.error('model-ark-asset proxy failed', { error: err.message, action });
      const status = err.status >= 400 && err.status < 600 ? err.status : 400;
      return response.error(res, status, 'MODEL_ARK_ASSET', err.message || '请求失败', err.payload);
    }
  };
}

/** 即梦2角色认证：代理 GET 素材列表（表单未保存也可用当前填写的网关与 Token） */
function listJimeng2MaterialAssets(log) {
  return async (req, res) => {
    const body = req.body || {};
    const base_url = (body.base_url || '').toString().trim().replace(/\/$/, '');
    const { normalizeMaterialHubToken } = require('../services/jimengMaterialHubService');
    let api_key = normalizeMaterialHubToken(body.api_key || '');
    if (!base_url || !api_key) {
      return response.badRequest(res, '请先填写网关 URL 与 Token');
    }
    const jimengMaterialHubService = require('../services/jimengMaterialHubService');
    const ctx = { baseUrl: base_url, token: api_key };
    const r = await jimengMaterialHubService.listAssets(ctx, { limit: body.limit, cursor: body.cursor }, log);
    if (!r.ok) {
      return response.badRequest(res, String(r.error || '列出素材失败').slice(0, 800));
    }
    response.success(res, r.data);
  };
}

module.exports = function aiConfigRoutes(db, log, cfg) {
  return {
    list: list(db),
    get: get(db),
    vendorLock: vendorLock(cfg),
    create: create(db, log, cfg),
    update: update(db, log, cfg),
    delete: remove(db, log, cfg),
    testConnection: testConnection(log),
    listJimeng2MaterialAssets: listJimeng2MaterialAssets(log),
    modelArkAsset: modelArkAsset(log),
    bulkUpdateKey: bulkUpdateKey(db, log, cfg),
    listComfyWorkflows: listComfyWorkflows(cfg),
    importComfyWorkflowMulter: comfyWorkflowUpload.single('file'),
    importComfyWorkflow: importComfyWorkflow(cfg, log),
    deleteComfyWorkflow: deleteComfyWorkflow(cfg, log),
  };
};
