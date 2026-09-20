'use strict';

const UI_FORMAT_ERROR = '请使用 ComfyUI「Save (API Format)」导出，不要用默认工作流文件';
const POSITIVE_MISSING_ERROR = '工作流未找到 Positive 节点，请给 CLIPTextEncode 标题加上 Positive，或在 AI 配置 settings.mapping 里指定节点 id';
const NO_OUTPUT_ERROR = '已完成但未找到输出文件';
const LATENT_CLASSES = new Set(['EmptyLatentImage', 'EmptySD3LatentImage', 'EmptyFlux2LatentImage']);
const SEED_CLASSES = new Set(['KSampler', 'KSamplerAdvanced', 'RandomNoise']);

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function assertApiWorkflow(json) {
  if (!isPlainObject(json)) {
    throw new Error('工作流必须是 JSON 对象');
  }
  if (Array.isArray(json.nodes) && Array.isArray(json.links)) {
    throw new Error(UI_FORMAT_ERROR);
  }
  const keys = Object.keys(json);
  if (keys.length === 0) {
    throw new Error('工作流为空');
  }
  for (const id of keys) {
    const node = json[id];
    if (!isPlainObject(node)) {
      throw new Error(`节点 ${id} 格式无效`);
    }
    if (!node.class_type) {
      throw new Error(`节点 ${id} 缺少 class_type`);
    }
    if (!isPlainObject(node.inputs)) {
      throw new Error(`节点 ${id} 缺少 inputs`);
    }
  }
  return json;
}

function nodeTitle(node) {
  const t = node && node._meta && node._meta.title;
  return t == null ? '' : String(t).trim();
}

function listNodes(json) {
  const out = [];
  if (!isPlainObject(json)) return out;
  for (const id of Object.keys(json)) {
    const node = json[id];
    if (!isPlainObject(node) || !node.class_type) continue;
    out.push({
      id: String(id),
      class_type: String(node.class_type),
      title: nodeTitle(node),
      inputs: isPlainObject(node.inputs) ? node.inputs : {},
    });
  }
  return out;
}

function cloneWorkflow(workflow) {
  return JSON.parse(JSON.stringify(workflow));
}

function titleMatches(title, re) {
  return re.test(String(title || ''));
}

function parseSize(size) {
  const m = String(size || '').trim().match(/^(\d+)x(\d+)$/i);
  if (!m) return null;
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

function writeInput(node, inputName, value) {
  if (!node || !isPlainObject(node.inputs)) return false;
  node.inputs[inputName] = value;
  return true;
}

function writeTextIfPresent(node, value) {
  if (!node || !isPlainObject(node.inputs)) return false;
  if (!Object.prototype.hasOwnProperty.call(node.inputs, 'text')) return false;
  node.inputs.text = value;
  return true;
}

function writeNumeric(node, preferredKeys, value) {
  if (!node || !isPlainObject(node.inputs)) return false;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return false;
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(node.inputs, key)) {
      node.inputs[key] = n;
      return true;
    }
  }
  if (Object.prototype.hasOwnProperty.call(node.inputs, 'value')) {
    node.inputs.value = n;
    return true;
  }
  return false;
}

function applyMappingEntry(cloned, spec, value, report, slot) {
  if (!spec || value == null) return false;
  const nodeId = String(spec.node == null ? spec.id || '' : spec.node);
  const input = String(spec.input || spec.field || '');
  if (!nodeId || !input || !cloned[nodeId]) return false;
  if (!isPlainObject(cloned[nodeId].inputs)) cloned[nodeId].inputs = {};
  cloned[nodeId].inputs[input] = value;
  report.push({ slot, node: nodeId, input });
  return true;
}

function collectRefSlots(nodes) {
  const numbered = [];
  const firstFrames = [];
  const lastFrames = [];
  for (const n of nodes) {
    const title = n.title || '';
    const m = title.match(/reference\s*image\s*(\d+)/i);
    if (m) numbered.push({ node: n, index: parseInt(m[1], 10) });
    if (titleMatches(title, /first\s*frame/i)) firstFrames.push(n);
    if (titleMatches(title, /last\s*frame/i)) lastFrames.push(n);
  }
  numbered.sort((a, b) => a.index - b.index);
  return { numbered, firstFrames, lastFrames };
}

function injectSlotsWithMeta(workflow, slots, mapping) {
  assertApiWorkflow(workflow);
  const cloned = cloneWorkflow(workflow);
  const report = [];
  const s = slots || {};
  let positiveWritten = false;
  const warnings = [];

  const nodes = listNodes(cloned).map((n) => ({ ...n, node: cloned[n.id] }));

  for (const n of nodes) {
    if (titleMatches(n.title, /positive/i)) {
      if (s.prompt != null && String(s.prompt) !== '') {
        if (writeTextIfPresent(n.node, s.prompt)) {
          positiveWritten = true;
          report.push({ slot: 'positive', node: n.id, input: 'text' });
        }
      }
    }
    if (titleMatches(n.title, /negative/i)) {
      if (s.negative_prompt != null) {
        if (writeTextIfPresent(n.node, s.negative_prompt)) {
          report.push({ slot: 'negative', node: n.id, input: 'text' });
        }
      }
    }
  }

  const size = parseSize(s.size);
  let widthWritten = false;
  let heightWritten = false;
  if (size) {
    for (const n of nodes) {
      if (titleMatches(n.title, /width/i) && !titleMatches(n.title, /height/i)) {
        if (writeNumeric(n.node, ['width', 'value'], size.width)) {
          widthWritten = true;
          report.push({ slot: 'width', node: n.id });
        }
      }
      if (titleMatches(n.title, /height/i) && !titleMatches(n.title, /width/i)) {
        if (writeNumeric(n.node, ['height', 'value'], size.height)) {
          heightWritten = true;
          report.push({ slot: 'height', node: n.id });
        }
      }
    }
    if (!widthWritten || !heightWritten) {
      for (const n of nodes) {
        if (!LATENT_CLASSES.has(n.class_type)) continue;
        if (!widthWritten && writeNumeric(n.node, ['width'], size.width)) {
          widthWritten = true;
          report.push({ slot: 'width', node: n.id, input: 'width' });
        }
        if (!heightWritten && writeNumeric(n.node, ['height'], size.height)) {
          heightWritten = true;
          report.push({ slot: 'height', node: n.id, input: 'height' });
        }
      }
    }
  }

  if (s.seed != null && s.seed !== '') {
    for (const n of nodes) {
      const byClass = SEED_CLASSES.has(n.class_type);
      const byTitle = titleMatches(n.title, /seed/i);
      if (!byClass && !byTitle) continue;
      if (writeNumeric(n.node, ['seed', 'noise_seed', 'value'], s.seed)) {
        report.push({ slot: 'seed', node: n.id });
      }
    }
  }

  if (s.duration != null && s.duration !== '') {
    for (const n of nodes) {
      if (!titleMatches(n.title, /duration/i)) continue;
      if (writeNumeric(n.node, ['value', 'duration'], s.duration)) {
        report.push({ slot: 'duration', node: n.id });
      }
    }
  }

  if (s.fps != null && s.fps !== '') {
    for (const n of nodes) {
      if (!titleMatches(n.title, /fps/i)) continue;
      if (writeNumeric(n.node, ['value', 'fps', 'frame_rate'], s.fps)) {
        report.push({ slot: 'fps', node: n.id });
      }
    }
  }

  const refSlots = collectRefSlots(nodes);
  const usedNodeIds = new Set();
  const writeImageNode = (nodeList, filename, slot) => {
    if (!nodeList || !nodeList.length || filename == null || filename === '') return false;
    for (const n of nodeList) {
      if (usedNodeIds.has(n.id)) continue;
      if (writeInput(n.node, 'image', filename)) {
        usedNodeIds.add(n.id);
        report.push({ slot, node: n.id, input: 'image' });
        return true;
      }
    }
    return false;
  };

  if (s.first_frame) {
    const ok = writeImageNode(refSlots.firstFrames, s.first_frame, 'first_frame')
      || writeImageNode(refSlots.numbered.map((x) => x.node), s.first_frame, 'first_frame');
    if (!ok) warnings.push('工作流无 First Frame / Reference Image 节点，首帧已忽略');
  }
  if (s.last_frame) {
    const ok = writeImageNode(refSlots.lastFrames, s.last_frame, 'last_frame')
      || writeImageNode(refSlots.numbered.map((x) => x.node), s.last_frame, 'last_frame');
    if (!ok) warnings.push('工作流无 Last Frame / Reference Image 2 节点，尾帧已忽略');
  }

  const refs = Array.isArray(s.reference_images) ? s.reference_images.filter((x) => x != null && x !== '') : [];
  const remaining = refSlots.numbered.map((x) => x.node).filter((n) => !usedNodeIds.has(n.id));
  if (refs.length) {
    if (!remaining.length && !refSlots.firstFrames.length) {
      warnings.push('工作流无 Reference Image 节点，参考图已忽略');
    } else {
      const cap = remaining.length;
      if (refs.length > cap) {
        warnings.push(`参考图数量(${refs.length})超过工作流槽位(${cap})，已截断`);
      }
      const used = refs.slice(0, cap);
      used.forEach((name, i) => {
        writeImageNode([remaining[i]], name, `reference_image_${i + 1}`);
      });
    }
  }

  const map = mapping && typeof mapping === 'object' ? mapping : null;
  if (map) {
    if (map.positive && s.prompt != null && String(s.prompt) !== '') {
      if (applyMappingEntry(cloned, map.positive, s.prompt, report, 'positive')) positiveWritten = true;
    }
    if (map.negative && s.negative_prompt != null) {
      applyMappingEntry(cloned, map.negative, s.negative_prompt, report, 'negative');
    }
    if (size) {
      if (map.width) applyMappingEntry(cloned, map.width, size.width, report, 'width');
      if (map.height) applyMappingEntry(cloned, map.height, size.height, report, 'height');
    }
    if (map.seed && s.seed != null && s.seed !== '') {
      applyMappingEntry(cloned, map.seed, Number(s.seed), report, 'seed');
    }
    if (map.duration && s.duration != null && s.duration !== '') {
      applyMappingEntry(cloned, map.duration, Number(s.duration), report, 'duration');
    }
    if (map.fps && s.fps != null && s.fps !== '') {
      applyMappingEntry(cloned, map.fps, Number(s.fps), report, 'fps');
    }
    if (map.first_frame && s.first_frame) {
      applyMappingEntry(cloned, map.first_frame, s.first_frame, report, 'first_frame');
    }
    if (map.last_frame && s.last_frame) {
      applyMappingEntry(cloned, map.last_frame, s.last_frame, report, 'last_frame');
    }
    if (Array.isArray(map.images) && refs.length) {
      map.images.forEach((spec, i) => {
        if (refs[i] != null) applyMappingEntry(cloned, spec, refs[i], report, `reference_image_${i + 1}`);
      });
    }
  }

  if (s.prompt != null && String(s.prompt) !== '' && !positiveWritten) {
    throw new Error(POSITIVE_MISSING_ERROR);
  }

  return { workflow: cloned, report, warnings };
}

function injectSlots(workflow, slots, mapping) {
  return injectSlotsWithMeta(workflow, slots, mapping).workflow;
}

function unwrapHistoryEntry(history, promptId) {
  if (!isPlainObject(history)) return null;
  if (history.outputs || history.status) return history;
  if (promptId && isPlainObject(history[promptId])) return history[promptId];
  const keys = Object.keys(history);
  if (keys.length === 1 && isPlainObject(history[keys[0]])) return history[keys[0]];
  return history;
}

function collectMediaFromOutputs(outputs) {
  const images = [];
  const videos = [];
  if (!isPlainObject(outputs)) return { images, videos };
  for (const nodeOut of Object.values(outputs)) {
    if (!isPlainObject(nodeOut)) continue;
    if (Array.isArray(nodeOut.images)) {
      for (const item of nodeOut.images) if (item && item.filename) images.push(item);
    }
    for (const key of ['gifs', 'videos', 'video']) {
      if (Array.isArray(nodeOut[key])) {
        for (const item of nodeOut[key]) if (item && item.filename) videos.push(item);
      }
    }
  }
  return { images, videos };
}

function pickMedia(list) {
  if (!list || !list.length) return null;
  const output = list.find((x) => String(x.type || '').toLowerCase() === 'output');
  return output || list[0];
}

function statusErrorMessage(status) {
  if (!isPlainObject(status)) return '';
  const messages = status.messages;
  if (!Array.isArray(messages) || !messages.length) return '';
  const parts = [];
  for (const msg of messages) {
    if (typeof msg === 'string') {
      parts.push(msg);
      continue;
    }
    if (Array.isArray(msg)) {
      const kind = String(msg[0] || '').toLowerCase();
      const payload = msg[1];
      if (kind.includes('error') || (payload && payload.exception_message)) {
        const text = (payload && (payload.exception_message || payload.message)) || JSON.stringify(payload || msg);
        parts.push(text);
      }
    } else if (isPlainObject(msg) && (msg.exception_message || msg.message)) {
      parts.push(msg.exception_message || msg.message);
    }
  }
  return parts.join('; ');
}

function extractHistoryMedia(historyEntry, opts) {
  const prefer = String((opts && opts.prefer) || '').toLowerCase();
  const entry = unwrapHistoryEntry(historyEntry, opts && opts.promptId) || historyEntry;
  if (!isPlainObject(entry)) {
    return { pending: true };
  }
  const status = entry.status;
  const statusStr = status && String(status.status_str || status.status || '').toLowerCase();
  const errFromStatus = statusErrorMessage(status);
  if (statusStr === 'error' || (status && status.completed === false && errFromStatus)) {
    return { error: (errFromStatus || 'ComfyUI 执行失败').slice(0, 500) };
  }

  const { images, videos } = collectMediaFromOutputs(entry.outputs);
  const pickVideo = pickMedia(videos);
  const pickImage = pickMedia(images);
  const chosen = prefer === 'video' ? (pickVideo || pickImage) : (pickImage || pickVideo);
  if (chosen) {
    return {
      filename: chosen.filename,
      subfolder: chosen.subfolder || '',
      type: chosen.type || 'output',
      kind: pickVideo && chosen === pickVideo ? 'video' : 'image',
    };
  }

  const completed = status && (status.completed === true || statusStr === 'success');
  if (completed) {
    return { error: NO_OUTPUT_ERROR };
  }
  return { pending: true };
}

function formatNodeErrors(promptResponse) {
  const errors = promptResponse && promptResponse.node_errors;
  if (!isPlainObject(errors) || Object.keys(errors).length === 0) return '';
  const parts = [];
  for (const [id, info] of Object.entries(errors)) {
    if (!info) continue;
    const cls = (isPlainObject(info) && info.class_type) || '';
    let detail = '';
    if (isPlainObject(info) && Array.isArray(info.errors)) {
      detail = info.errors.map((e) => {
        if (!e) return '';
        if (typeof e === 'string') return e;
        return e.details || e.message || JSON.stringify(e);
      }).filter(Boolean).join('; ');
    } else if (typeof info === 'string') {
      detail = info;
    } else {
      detail = JSON.stringify(info);
    }
    parts.push(`节点 ${id}${cls ? ` (${cls})` : ''}: ${detail}`);
  }
  return parts.join(' | ').slice(0, 500);
}

function hasNodeErrors(promptResponse) {
  const errors = promptResponse && promptResponse.node_errors;
  return isPlainObject(errors) && Object.keys(errors).length > 0;
}

module.exports = {
  UI_FORMAT_ERROR,
  POSITIVE_MISSING_ERROR,
  NO_OUTPUT_ERROR,
  assertApiWorkflow,
  listNodes,
  injectSlots,
  injectSlotsWithMeta,
  extractHistoryMedia,
  unwrapHistoryEntry,
  formatNodeErrors,
  hasNodeErrors,
  parseSize,
};
