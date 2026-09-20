'use strict';

const fs = require('fs');
const path = require('path');
const { assertApiWorkflow, listNodes } = require('./inject');

const NAME_RE = /^[A-Za-z0-9._-]+$/;

function parseSettings(config) {
  const raw = config && config.settings;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function sanitizeModelName(modelName) {
  let name = String(modelName || '').trim();
  if (!name) throw new Error('模型名（工作流文件名）不能为空');
  name = name.replace(/\.json$/i, '');
  if (name.includes('..') || name.includes('/') || name.includes('\\') || !NAME_RE.test(name)) {
    throw new Error(`非法工作流名: ${modelName}`);
  }
  return name;
}

function resolveStorageRoot(config) {
  const fromOpts = config && config.storage_local_path;
  if (fromOpts) {
    return path.isAbsolute(fromOpts) ? fromOpts : path.resolve(fromOpts);
  }
  try {
    const { loadConfig } = require('../../config');
    const cfg = loadConfig();
    const raw = (cfg && cfg.storage && cfg.storage.local_path) || './data/storage';
    return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  } catch (_) {
    return path.join(process.cwd(), 'data', 'storage');
  }
}

function resolveWorkflowsDir(config) {
  const settings = parseSettings(config);
  const custom = settings.workflows_dir && String(settings.workflows_dir).trim();
  if (custom) {
    return path.isAbsolute(custom) ? custom : path.resolve(custom);
  }
  const root = resolveStorageRoot(config);
  return path.join(root, 'comfy-workflows');
}

function ensureWorkflowsDir(config) {
  const dir = resolveWorkflowsDir(config);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveWorkflowPath(config, modelName) {
  const name = sanitizeModelName(modelName);
  const dir = ensureWorkflowsDir(config);
  return path.join(dir, `${name}.json`);
}

function listWorkflowNames(config) {
  const dir = ensureWorkflowsDir(config);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  return entries
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => f.replace(/\.json$/i, ''))
    .filter((n) => NAME_RE.test(n))
    .sort();
}

function loadWorkflow(config, modelName) {
  const filePath = resolveWorkflowPath(config, modelName);
  if (!fs.existsSync(filePath)) {
    const existing = listWorkflowNames(config);
    const hint = existing.length
      ? `目录中已有: ${existing.join(', ')}`
      : '目录中还没有工作流，请把 ComfyUI「Save (API Format)」导出的 JSON 放到该目录，或在 AI 配置页导入';
    throw new Error(`找不到工作流「${sanitizeModelName(modelName)}」。${hint}`);
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`工作流 JSON 无法解析: ${e.message}`);
  }
  assertApiWorkflow(json);
  return json;
}

function workflowHasPositive(json) {
  return listNodes(json).some((n) => /positive/i.test(n.title || ''));
}

function saveWorkflow(config, modelName, json) {
  assertApiWorkflow(json);
  const filePath = resolveWorkflowPath(config, modelName);
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
  return {
    name: sanitizeModelName(modelName),
    path: filePath,
    has_positive: workflowHasPositive(json),
  };
}

function deleteWorkflow(config, modelName) {
  const filePath = resolveWorkflowPath(config, modelName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`工作流不存在: ${sanitizeModelName(modelName)}`);
  }
  fs.unlinkSync(filePath);
  return { name: sanitizeModelName(modelName) };
}

function mappingForModel(settings, modelName) {
  const mapping = settings && settings.mapping;
  if (!mapping || typeof mapping !== 'object') return null;
  const stem = String(modelName || '').replace(/\.json$/i, '');
  if (mapping[stem] && typeof mapping[stem] === 'object') return mapping[stem];
  if (mapping.positive || mapping.negative || mapping.width || mapping.images) return mapping;
  return null;
}

module.exports = {
  NAME_RE,
  parseSettings,
  sanitizeModelName,
  resolveStorageRoot,
  resolveWorkflowsDir,
  ensureWorkflowsDir,
  resolveWorkflowPath,
  listWorkflowNames,
  loadWorkflow,
  saveWorkflow,
  deleteWorkflow,
  workflowHasPositive,
  mappingForModel,
};
