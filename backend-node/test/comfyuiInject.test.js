process.env.PROTOCOL_POLL_INTERVAL_MS = '0';
process.env.COMFY_POLL_MAX = '8';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertApiWorkflow,
  listNodes,
  injectSlots,
  extractHistoryMedia,
  formatNodeErrors,
  UI_FORMAT_ERROR,
  POSITIVE_MISSING_ERROR,
  NO_OUTPUT_ERROR,
} = require('../src/protocols/comfyui/inject');

function minimalT2i(overrides = {}) {
  return {
    '3': {
      class_type: 'KSampler',
      inputs: { seed: 1, steps: 8, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] },
      _meta: { title: 'KSampler' },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'PUT_YOUR_CHECKPOINT_HERE.safetensors' },
      _meta: { title: 'Load Checkpoint' },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 512, height: 512, batch_size: 1 },
      _meta: { title: 'Empty Latent Image' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'hardcoded positive', clip: ['4', 1] },
      _meta: { title: 'Positive' },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'hardcoded negative', clip: ['4', 1] },
      _meta: { title: 'Negative' },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] },
      _meta: { title: 'Save Image' },
    },
    ...overrides,
  };
}

describe('assertApiWorkflow / listNodes', () => {
  it('accepts a minimal txt2img API JSON', () => {
    const wf = minimalT2i();
    assert.equal(assertApiWorkflow(wf), wf);
    const nodes = listNodes(wf);
    assert.ok(nodes.length >= 7);
    const pos = nodes.find((n) => n.id === '6');
    assert.equal(pos.class_type, 'CLIPTextEncode');
    assert.equal(pos.title, 'Positive');
  });

  it('rejects UI format { nodes, links }', () => {
    assert.throws(
      () => assertApiWorkflow({ nodes: [], links: [] }),
      (err) => err.message === UI_FORMAT_ERROR,
    );
  });

  it('rejects a node missing class_type', () => {
    assert.throws(
      () => assertApiWorkflow({ '1': { inputs: { text: 'x' } } }),
      (err) => /缺少 class_type/.test(err.message),
    );
  });
});

describe('injectSlots', () => {
  it('replaces Positive/Negative and does not mutate the original', () => {
    const wf = minimalT2i();
    const originalPos = wf['6'].inputs.text;
    const out = injectSlots(wf, { prompt: 'a red fox', negative_prompt: 'blurry' });
    assert.equal(out['6'].inputs.text, 'a red fox');
    assert.equal(out['7'].inputs.text, 'blurry');
    assert.equal(wf['6'].inputs.text, originalPos);
    assert.notEqual(out, wf);
  });

  it('writes 1024x768 into EmptyLatentImage when no Width/Height titles', () => {
    const wf = minimalT2i();
    const out = injectSlots(wf, { prompt: 'cat', size: '1024x768' });
    assert.equal(out['5'].inputs.width, 1024);
    assert.equal(out['5'].inputs.height, 768);
  });

  it('lets mapping override a wrong title', () => {
    const wf = minimalT2i({
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'wrong title node', clip: ['4', 1] },
        _meta: { title: 'FooBar' },
      },
    });
    const out = injectSlots(wf, { prompt: 'mapped prompt' }, {
      positive: { node: '6', input: 'text' },
    });
    assert.equal(out['6'].inputs.text, 'mapped prompt');
  });

  it('throws when prompt is set but no Positive title and no mapping', () => {
    const wf = minimalT2i({
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'hardcoded', clip: ['4', 1] },
        _meta: { title: 'CLIP Text Encode (Prompt)' },
      },
    });
    assert.throws(
      () => injectSlots(wf, { prompt: 'a cat' }),
      (err) => err.message === POSITIVE_MISSING_ERROR,
    );
    assert.equal(wf['6'].inputs.text, 'hardcoded');
  });
});

describe('extractHistoryMedia / formatNodeErrors', () => {
  it('reads a standard SaveImage history entry', () => {
    const media = extractHistoryMedia({
      outputs: {
        '9': {
          images: [{ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }],
        },
      },
      status: { status_str: 'success', completed: true },
    });
    assert.equal(media.filename, 'ComfyUI_00001_.png');
    assert.equal(media.subfolder, '');
    assert.equal(media.type, 'output');
    assert.equal(media.kind, 'image');
  });

  it('errors when completed with empty outputs', () => {
    const media = extractHistoryMedia({
      outputs: {},
      status: { status_str: 'success', completed: true },
    });
    assert.equal(media.error, NO_OUTPUT_ERROR);
  });

  it('includes class_type in node_errors text', () => {
    const text = formatNodeErrors({
      node_errors: {
        '4': {
          class_type: 'CheckpointLoaderSimple',
          errors: [{ details: "ckpt_name: 'missing.safetensors' not in list", message: 'Value not in list' }],
        },
      },
    });
    assert.match(text, /CheckpointLoaderSimple/);
    assert.match(text, /missing\.safetensors/);
  });
});
