const { register } = require('./registry');
const {
  requestJson, buildUrl, replaceTaskPath, sleep, pollIntervalMs, imagePollMax,
} = require('./http');
const {
  extractTaskId, extractStatus, isFailStatus, isDoneStatus,
  extractErrorMessage, extractImageUrl, extractVideoUrl,
  sizeToRatio, collectHttpRefs,
} = require('./extract');

function httpError(res, prefix) {
  const msg = extractErrorMessage(res.json) || res.error || '请求失败';
  return { error: `${prefix || ''}${msg}`.slice(0, 500) };
}

async function pollUntil(config, spec, taskId, extractUrl) {
  const queryTpl = config.query_endpoint || spec.pollPath || spec.videoQuery || '/v1/tasks/{taskId}';
  const method = spec.pollMethod || 'GET';
  const max = imagePollMax();
  const interval = pollIntervalMs();
  let lastErr = '';
  for (let i = 0; i < max; i++) {
    if (i > 0 && interval > 0) await sleep(interval);
    const path = replaceTaskPath(queryTpl, taskId);
    const url = spec.pollAbsolute ? path : buildUrl(config, path);
    const body = method === 'GET' ? undefined : (spec.buildPollBody ? spec.buildPollBody(taskId, config) : { id: taskId });
    const res = await requestJson(method, url, {
      apiKey: config.api_key,
      auth: spec.auth,
      body,
      extraHeaders: spec.headers ? spec.headers(config) : undefined,
    });
    if (!res.ok && (res.status === 401 || res.status === 403)) return httpError(res, '');
    if (!res.json) {
      lastErr = res.error || '轮询无响应';
      continue;
    }
    const status = extractStatus(res.json);
    if (isFailStatus(status)) {
      return { error: extractErrorMessage(res.json) || `任务失败 (${status})` };
    }
    const media = extractUrl(res.json);
    if (media) return media;
    if (isDoneStatus(status) && !media) {
      lastErr = extractErrorMessage(res.json) || '任务完成但未返回媒体地址';
      continue;
    }
  }
  return { error: lastErr || '等待生成超时' };
}

function createAdapter(spec) {
  const adapter = {
    id: spec.id,
    aliases: spec.aliases || [],
    services: spec.services || ['image', 'storyboard_image', 'video'],
    group: spec.group || 'aggregator',
    infer: spec.infer,
    defaultEndpoints: spec.defaultEndpoints,
    auth: spec.auth || 'bearer',

    async submitImage(config, log, opts) {
      if (spec.submitImage) return spec.submitImage(config, log, opts);
      const url = buildUrl(config, config.endpoint, spec.imageCreate || '/v1/images/generations');
      const body = spec.buildImageBody
        ? spec.buildImageBody(config, opts)
        : {
            model: opts.model,
            prompt: opts.prompt || '',
            n: 1,
            ...(opts.size ? { size: opts.size } : {}),
          };
      const res = await requestJson('POST', url, {
        apiKey: config.api_key,
        auth: spec.auth,
        body,
        extraHeaders: spec.headers ? spec.headers(config) : undefined,
      });
      if (!res.ok) return httpError(res, '图片生成失败: ');
      const direct = extractImageUrl(res.json);
      if (direct) return { image_url: direct };
      const taskId = extractTaskId(res.json);
      if (!taskId) return { error: '未返回图片地址或任务 ID: ' + (res.raw || '').slice(0, 220) };
      if (log) log.info(`[${spec.id}图生] 异步任务`, { task_id: taskId, image_gen_id: opts.image_gen_id });
      const polled = await pollUntil(config, spec, taskId, extractImageUrl);
      if (polled.error) return polled;
      return { image_url: typeof polled === 'string' ? polled : polled.image_url };
    },

    async submitVideo(config, log, opts) {
      if (spec.submitVideo) return spec.submitVideo(config, log, opts);
      const url = buildUrl(config, config.endpoint, spec.videoCreate || '/v1/videos/generations');
      const body = spec.buildVideoBody
        ? spec.buildVideoBody(config, opts)
        : {
            model: opts.model,
            prompt: opts.prompt || '',
            duration: opts.duration != null ? Number(opts.duration) : 5,
          };
      const res = await requestJson('POST', url, {
        apiKey: config.api_key,
        auth: spec.auth,
        body,
        extraHeaders: spec.headers ? spec.headers(config) : undefined,
      });
      if (!res.ok) return httpError(res, '视频生成失败: ');
      const direct = extractVideoUrl(res.json);
      if (direct) return { video_url: direct };
      const taskId = extractTaskId(res.json);
      if (!taskId) return { error: '未返回 task_id 或视频地址: ' + (res.raw || '').slice(0, 220) };
      if (log) log.info(`[${spec.id}视频] 异步任务`, { task_id: taskId, video_gen_id: opts.video_gen_id });
      return { task_id: String(taskId), status: extractStatus(res.json) || 'submitted' };
    },

    async pollVideo(config, log, taskId) {
      if (spec.pollVideo) return spec.pollVideo(config, log, taskId);
      const queryTpl = config.query_endpoint || spec.videoQuery || spec.pollPath || '/v1/tasks/{taskId}';
      const method = spec.pollMethod || 'GET';
      const path = replaceTaskPath(queryTpl, taskId);
      const url = buildUrl(config, path);
      const body = method === 'GET' ? undefined : (spec.buildPollBody ? spec.buildPollBody(taskId, config) : { id: taskId });
      const res = await requestJson(method, url, {
        apiKey: config.api_key,
        auth: spec.auth,
        body,
        extraHeaders: spec.headers ? spec.headers(config) : undefined,
      });
      if (!res.ok && (res.status === 401 || res.status === 403)) return httpError(res, '');
      if (!res.json) return { pending: true };
      const status = extractStatus(res.json);
      if (isFailStatus(status)) return { error: extractErrorMessage(res.json) || `任务失败 (${status})` };
      const videoUrl = extractVideoUrl(res.json);
      if (videoUrl) return { video_url: videoUrl };
      if (isDoneStatus(status)) return { error: extractErrorMessage(res.json) || '任务完成但未返回视频地址' };
      return { pending: true, status };
    },

    async testConnection(opts) {
      if (spec.testConnection) return spec.testConnection(opts);
      const url = buildUrl(opts, '', spec.testPath || '/v1/models');
      const res = await requestJson('GET', url, { apiKey: opts.api_key, auth: spec.auth });
      if (res.status === 401 || res.status === 403) {
        throw new Error(extractErrorMessage(res.json) || `API Key 无效 (${res.status})`);
      }
    },
  };
  register(adapter);
  return adapter;
}

function hostIncludes(baseUrl, ...needles) {
  const b = String(baseUrl || '').toLowerCase();
  return needles.some((n) => b.includes(String(n).toLowerCase()));
}

function providerIs(ctx, ...ids) {
  return ids.includes(String(ctx.provider || '').toLowerCase());
}

function imageRefs(opts) {
  return collectHttpRefs(opts.reference_image_urls || opts.reference_urls || []);
}

function firstFrame(opts) {
  const u = opts.first_frame_url || opts.image_url || '';
  return /^https?:\/\//i.test(u) || String(u).startsWith('data:image/') ? u : '';
}

createAdapter({
  id: 'apimart',
  aliases: ['task_hub', 'cometapi', 'aimlapi'],
  group: 'aggregator',
  imageCreate: '/v1/images/generations',
  videoCreate: '/v1/videos/generations',
  pollPath: '/v1/tasks/{taskId}',
  videoQuery: '/v1/tasks/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/v1/chat/completions' },
    tts: { endpoint: '/v1/audio/speech' },
    image: { endpoint: '/v1/images/generations', query: '/v1/tasks/{taskId}' },
    storyboard_image: { endpoint: '/v1/images/generations', query: '/v1/tasks/{taskId}' },
    video: { endpoint: '/v1/videos/generations', query: '/v1/tasks/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'apimart', 'task_hub', 'cometapi', 'aimlapi')
    || hostIncludes(ctx.baseUrl, 'apimart.ai', 'cometapi.com', 'aimlapi.com'),
  buildImageBody(_config, opts) {
    const refs = imageRefs(opts);
    const body = {
      model: opts.model,
      prompt: opts.prompt || '',
      n: 1,
      aspect_ratio: sizeToRatio(opts.size),
    };
    if (refs.length) body.image_urls = refs;
    return body;
  },
  buildVideoBody(_config, opts) {
    const refs = imageRefs(opts);
    const frame = firstFrame(opts);
    const body = {
      model: opts.model,
      prompt: opts.prompt || '',
      duration: opts.duration != null ? Number(opts.duration) : 5,
      aspect_ratio: opts.aspect_ratio || sizeToRatio(opts.size) || '16:9',
    };
    if (opts.resolution) body.resolution = opts.resolution;
    const urls = refs.length ? refs : (frame ? [frame] : []);
    if (urls.length) body.image_urls = urls;
    return body;
  },
});

createAdapter({
  id: 'siliconflow',
  aliases: ['sf', 'siliconcloud'],
  group: 'aggregator',
  imageCreate: '/v1/images/generations',
  videoCreate: '/v1/video/submit',
  videoQuery: '/v1/video/status',
  pollMethod: 'POST',
  buildPollBody: (taskId) => ({ requestId: taskId }),
  defaultEndpoints: {
    text: { endpoint: '/v1/chat/completions' },
    tts: { endpoint: '/v1/audio/speech' },
    image: { endpoint: '/v1/images/generations' },
    storyboard_image: { endpoint: '/v1/images/generations' },
    video: { endpoint: '/v1/video/submit', query: '/v1/video/status' },
  },
  infer: (ctx) => providerIs(ctx, 'siliconflow', 'siliconcloud')
    || hostIncludes(ctx.baseUrl, 'siliconflow.cn', 'siliconflow.com'),
  buildImageBody(_config, opts) {
    const refs = imageRefs(opts);
    const body = {
      model: opts.model || 'Kwai-Kolors/Kolors',
      prompt: opts.prompt || '',
      image_size: opts.size || '1024x1024',
    };
    if (opts.negative_prompt) body.negative_prompt = opts.negative_prompt;
    if (refs[0]) body.image = refs[0];
    if (refs[1]) body.image2 = refs[1];
    if (refs[2]) body.image3 = refs[2];
    return body;
  },
  buildVideoBody(_config, opts) {
    const body = {
      model: opts.model,
      prompt: opts.prompt || '',
      image_size: opts.size || '1280x720',
    };
    const frame = firstFrame(opts) || imageRefs(opts)[0];
    if (frame) body.image = frame;
    if (opts.negative_prompt) body.negative_prompt = opts.negative_prompt;
    return body;
  },
});

createAdapter({
  id: 'openrouter',
  group: 'aggregator',
  imageCreate: '/api/v1/images/generations',
  videoCreate: '/api/v1/videos/generations',
  pollPath: '/api/v1/videos/{taskId}',
  videoQuery: '/api/v1/videos/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/api/v1/chat/completions' },
    image: { endpoint: '/api/v1/images/generations' },
    storyboard_image: { endpoint: '/api/v1/images/generations' },
    video: { endpoint: '/api/v1/videos/generations', query: '/api/v1/videos/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'openrouter') || hostIncludes(ctx.baseUrl, 'openrouter.ai'),
  buildImageBody(_config, opts) {
    return {
      model: opts.model,
      prompt: opts.prompt || '',
      n: 1,
      size: opts.size || '1024x1024',
    };
  },
  buildVideoBody(_config, opts) {
    const body = {
      model: opts.model,
      prompt: opts.prompt || '',
      duration: opts.duration != null ? Number(opts.duration) : 5,
    };
    const frame = firstFrame(opts);
    if (frame) body.image = frame;
    return body;
  },
});

createAdapter({
  id: 'fal',
  aliases: ['falai', 'wavespeed'],
  group: 'queue',
  auth: 'key',
  imageCreate: '/fal-ai/flux/schnell',
  videoCreate: '/fal-ai/kling-video/v1/standard/text-to-video',
  pollPath: '/requests/{taskId}',
  videoQuery: '/requests/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/fal-ai/flux/schnell' },
    storyboard_image: { endpoint: '/fal-ai/flux/schnell' },
    video: { endpoint: '/fal-ai/kling-video/v1/standard/text-to-video', query: '/requests/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'fal', 'falai', 'wavespeed')
    || hostIncludes(ctx.baseUrl, 'fal.run', 'fal.ai', 'wavespeed.ai'),
  buildImageBody(_config, opts) {
    const refs = imageRefs(opts);
    const body = { prompt: opts.prompt || '', model: opts.model };
    if (opts.size) body.image_size = opts.size;
    if (refs[0]) body.image_url = refs[0];
    return body;
  },
  buildVideoBody(_config, opts) {
    const body = { prompt: opts.prompt || '', model: opts.model };
    const frame = firstFrame(opts);
    if (frame) body.image_url = frame;
    if (opts.duration) body.duration = String(opts.duration);
    if (opts.aspect_ratio) body.aspect_ratio = opts.aspect_ratio;
    return body;
  },
});

createAdapter({
  id: 'replicate',
  group: 'queue',
  imageCreate: '/v1/predictions',
  videoCreate: '/v1/predictions',
  pollPath: '/v1/predictions/{taskId}',
  videoQuery: '/v1/predictions/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/v1/predictions', query: '/v1/predictions/{taskId}' },
    storyboard_image: { endpoint: '/v1/predictions', query: '/v1/predictions/{taskId}' },
    video: { endpoint: '/v1/predictions', query: '/v1/predictions/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'replicate') || hostIncludes(ctx.baseUrl, 'replicate.com'),
  headers: () => ({ Prefer: 'wait=0' }),
  buildImageBody(_config, opts) {
    const refs = imageRefs(opts);
    return {
      model: opts.model,
      input: {
        prompt: opts.prompt || '',
        ...(opts.size ? { size: opts.size } : {}),
        ...(refs[0] ? { image: refs[0] } : {}),
      },
    };
  },
  buildVideoBody(_config, opts) {
    const frame = firstFrame(opts);
    return {
      model: opts.model,
      input: {
        prompt: opts.prompt || '',
        ...(opts.duration != null ? { duration: Number(opts.duration) } : {}),
        ...(frame ? { image: frame } : {}),
      },
    };
  },
});

createAdapter({
  id: 'piapi',
  group: 'queue',
  imageCreate: '/api/v1/task',
  videoCreate: '/api/v1/task',
  pollPath: '/api/v1/task/{taskId}',
  videoQuery: '/api/v1/task/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/api/v1/task', query: '/api/v1/task/{taskId}' },
    storyboard_image: { endpoint: '/api/v1/task', query: '/api/v1/task/{taskId}' },
    video: { endpoint: '/api/v1/task', query: '/api/v1/task/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'piapi') || hostIncludes(ctx.baseUrl, 'piapi.ai'),
  buildImageBody(_config, opts) {
    const refs = imageRefs(opts);
    return {
      model: opts.model,
      task_type: refs.length ? 'image-to-image' : 'text-to-image',
      input: {
        prompt: opts.prompt || '',
        ...(refs.length ? { image_urls: refs } : {}),
      },
    };
  },
  buildVideoBody(_config, opts) {
    const frame = firstFrame(opts);
    return {
      model: opts.model,
      task_type: frame ? 'image-to-video' : 'text-to-video',
      input: {
        prompt: opts.prompt || '',
        ...(opts.duration != null ? { duration: Number(opts.duration) } : {}),
        ...(frame ? { image_url: frame } : {}),
      },
    };
  },
});

createAdapter({
  id: 'kie',
  aliases: ['kieai'],
  group: 'queue',
  imageCreate: '/api/v1/jobs',
  videoCreate: '/api/v1/jobs',
  pollPath: '/api/v1/jobs/{taskId}',
  videoQuery: '/api/v1/jobs/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/api/v1/jobs', query: '/api/v1/jobs/{taskId}' },
    storyboard_image: { endpoint: '/api/v1/jobs', query: '/api/v1/jobs/{taskId}' },
    video: { endpoint: '/api/v1/jobs', query: '/api/v1/jobs/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'kie', 'kieai') || hostIncludes(ctx.baseUrl, 'kie.ai'),
  buildImageBody(_config, opts) {
    return { model: opts.model, input: { prompt: opts.prompt || '' } };
  },
  buildVideoBody(_config, opts) {
    const frame = firstFrame(opts);
    return {
      model: opts.model,
      input: {
        prompt: opts.prompt || '',
        ...(frame ? { image_url: frame } : {}),
        ...(opts.duration != null ? { duration: Number(opts.duration) } : {}),
      },
    };
  },
});

createAdapter({
  id: 'novita',
  group: 'queue',
  imageCreate: '/v3/async/txt2img',
  videoCreate: '/v3/async/txt2video',
  pollPath: '/v3/async/task-result?task_id={taskId}',
  videoQuery: '/v3/async/task-result?task_id={taskId}',
  defaultEndpoints: {
    image: { endpoint: '/v3/async/txt2img', query: '/v3/async/task-result?task_id={taskId}' },
    storyboard_image: { endpoint: '/v3/async/txt2img', query: '/v3/async/task-result?task_id={taskId}' },
    video: { endpoint: '/v3/async/txt2video', query: '/v3/async/task-result?task_id={taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'novita') || hostIncludes(ctx.baseUrl, 'novita.ai'),
  buildImageBody(_config, opts) {
    return { model_name: opts.model, prompt: opts.prompt || '', extra: { response_image_type: 'jpeg' } };
  },
  buildVideoBody(_config, opts) {
    return { model_name: opts.model, prompt: opts.prompt || '' };
  },
});

createAdapter({
  id: 'minimax_hailuo',
  aliases: ['hailuo', 'minimax_video'],
  group: 'official',
  services: ['video'],
  videoCreate: '/v1/video_generation',
  videoQuery: '/v1/query/video_generation?task_id={taskId}',
  defaultEndpoints: {
    video: { endpoint: '/v1/video_generation', query: '/v1/query/video_generation?task_id={taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'minimax_hailuo', 'hailuo')
    || /hailuo|minimax-video|video-01|MiniMax-Hailuo/i.test(ctx.model),
  buildVideoBody(_config, opts) {
    const frame = firstFrame(opts);
    const body = {
      model: opts.model || 'MiniMax-Hailuo-02',
      prompt: opts.prompt || '',
    };
    if (opts.duration) body.duration = Number(opts.duration);
    if (opts.resolution) body.resolution = opts.resolution;
    if (frame) body.first_frame_image = frame;
    const last = opts.last_frame_url;
    if (last && (/^https?:\/\//i.test(last) || String(last).startsWith('data:image/'))) {
      body.last_frame_image = last;
    }
    return body;
  },
});

createAdapter({
  id: 'sora_official',
  aliases: ['openai_sora'],
  group: 'official',
  services: ['video'],
  videoCreate: '/v1/videos',
  videoQuery: '/v1/videos/{taskId}',
  defaultEndpoints: {
    video: { endpoint: '/v1/videos', query: '/v1/videos/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'sora_official', 'openai_sora')
    || (hostIncludes(ctx.baseUrl, 'api.openai.com') && /^sora/i.test(ctx.model)),
  buildVideoBody(_config, opts) {
    const body = {
      model: opts.model || 'sora-2',
      prompt: opts.prompt || '',
    };
    if (opts.duration) body.seconds = String(opts.duration);
    if (opts.size) body.size = opts.size;
    const frame = firstFrame(opts);
    if (frame) body.input_reference = frame;
    return body;
  },
});

createAdapter({
  id: 'jimeng_official',
  group: 'official',
  imageCreate: '/api/v3/images/generations',
  videoCreate: '/api/v3/contents/generations/tasks',
  pollPath: '/api/v3/contents/generations/tasks/{taskId}',
  videoQuery: '/api/v3/contents/generations/tasks/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/api/v3/images/generations' },
    storyboard_image: { endpoint: '/api/v3/images/generations' },
    video: { endpoint: '/api/v3/contents/generations/tasks', query: '/api/v3/contents/generations/tasks/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'jimeng_official', 'jimeng')
    || hostIncludes(ctx.baseUrl, 'jimeng.jianying.com', 'dreamina'),
  buildImageBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '', watermark: false };
  },
  buildVideoBody(_config, opts) {
    const content = [{ type: 'text', text: opts.prompt || '' }];
    const frame = firstFrame(opts);
    if (frame) content.push({ type: 'image_url', image_url: { url: frame } });
    return { model: opts.model, content, duration: opts.duration != null ? Number(opts.duration) : 5 };
  },
});

function officialVideoAdapter(id, aliases, infer, createPath, queryPath, extraBody) {
  return createAdapter({
    id,
    aliases,
    group: 'official',
    services: extraBody?.services || ['video'],
    imageCreate: extraBody?.imageCreate,
    videoCreate: createPath,
    videoQuery: queryPath,
    pollPath: queryPath,
    defaultEndpoints: extraBody?.defaultEndpoints || {
      video: { endpoint: createPath, query: queryPath },
    },
    infer,
    buildImageBody: extraBody?.buildImageBody,
    buildVideoBody: extraBody?.buildVideoBody || ((_c, opts) => ({
      model: opts.model,
      prompt: opts.prompt || '',
      ...(opts.duration != null ? { duration: Number(opts.duration) } : {}),
      ...(firstFrame(opts) ? { image_url: firstFrame(opts) } : {}),
    })),
  });
}

officialVideoAdapter(
  'pixverse',
  ['pixverse_official'],
  (ctx) => providerIs(ctx, 'pixverse') || hostIncludes(ctx.baseUrl, 'pixverse.ai') || /pixverse/i.test(ctx.model),
  '/openapi/v2/video/text/generate',
  '/openapi/v2/video/result/{taskId}',
);

officialVideoAdapter(
  'skyreels',
  [],
  (ctx) => providerIs(ctx, 'skyreels') || hostIncludes(ctx.baseUrl, 'skyreels') || /skyreels/i.test(ctx.model),
  '/v1/video/generate',
  '/v1/video/query/{taskId}',
);

officialVideoAdapter(
  'runway',
  ['runwayml'],
  (ctx) => providerIs(ctx, 'runway', 'runwayml') || hostIncludes(ctx.baseUrl, 'runwayml.com'),
  '/v1/image_to_video',
  '/v1/tasks/{taskId}',
);

officialVideoAdapter(
  'luma',
  ['lumalabs', 'dream_machine'],
  (ctx) => providerIs(ctx, 'luma', 'lumalabs') || hostIncludes(ctx.baseUrl, 'lumalabs.ai'),
  '/dream-machine/v1/generations',
  '/dream-machine/v1/generations/{taskId}',
);

officialVideoAdapter(
  'pika',
  ['pikalabs'],
  (ctx) => providerIs(ctx, 'pika', 'pikalabs') || hostIncludes(ctx.baseUrl, 'pika.art'),
  '/generate/2.0/generate',
  '/generate/2.0/tasks/{taskId}',
);

createAdapter({
  id: 'ideogram',
  group: 'official',
  services: ['image', 'storyboard_image'],
  imageCreate: '/v1/ideogram-v3/generate',
  pollPath: '/v1/ideogram-v3/generate/{taskId}',
  defaultEndpoints: {
    image: { endpoint: '/v1/ideogram-v3/generate' },
    storyboard_image: { endpoint: '/v1/ideogram-v3/generate' },
  },
  infer: (ctx) => providerIs(ctx, 'ideogram') || hostIncludes(ctx.baseUrl, 'ideogram.ai'),
  buildImageBody(_config, opts) {
    return {
      prompt: opts.prompt || '',
      model: opts.model || 'V_3',
      aspect_ratio: sizeToRatio(opts.size),
    };
  },
});

createAdapter({
  id: 'midjourney',
  aliases: ['mj'],
  group: 'official',
  services: ['image', 'storyboard_image'],
  imageCreate: '/mj/submit/imagine',
  pollPath: '/mj/task/{taskId}/fetch',
  defaultEndpoints: {
    image: { endpoint: '/mj/submit/imagine', query: '/mj/task/{taskId}/fetch' },
    storyboard_image: { endpoint: '/mj/submit/imagine', query: '/mj/task/{taskId}/fetch' },
  },
  infer: (ctx) => providerIs(ctx, 'midjourney', 'mj') || /midjourney|^mj_/i.test(ctx.model),
  buildImageBody(_config, opts) {
    return { prompt: opts.prompt || '', botType: 'MID_JOURNEY' };
  },
});

createAdapter({
  id: 'zhipu',
  aliases: ['glm', 'qingying'],
  group: 'official',
  imageCreate: '/api/paas/v4/images/generations',
  videoCreate: '/api/paas/v4/videos/generations',
  pollPath: '/api/paas/v4/async-result/{taskId}',
  videoQuery: '/api/paas/v4/async-result/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/api/paas/v4/chat/completions' },
    image: { endpoint: '/api/paas/v4/images/generations' },
    storyboard_image: { endpoint: '/api/paas/v4/images/generations' },
    video: { endpoint: '/api/paas/v4/videos/generations', query: '/api/paas/v4/async-result/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'zhipu', 'glm', 'qingying')
    || hostIncludes(ctx.baseUrl, 'open.bigmodel.cn', 'bigmodel.cn'),
  buildImageBody(_config, opts) {
    return { model: opts.model || 'cogview-3-flash', prompt: opts.prompt || '' };
  },
  buildVideoBody(_config, opts) {
    const frame = firstFrame(opts);
    return {
      model: opts.model || 'cogvideox-2',
      prompt: opts.prompt || '',
      ...(frame ? { image_url: frame } : {}),
    };
  },
});

createAdapter({
  id: 'hunyuan',
  aliases: ['tencent_hunyuan'],
  group: 'official',
  imageCreate: '/v1/images/generations',
  videoCreate: '/v1/videos/generations',
  pollPath: '/v1/videos/{taskId}',
  videoQuery: '/v1/videos/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/v1/chat/completions' },
    image: { endpoint: '/v1/images/generations' },
    storyboard_image: { endpoint: '/v1/images/generations' },
    video: { endpoint: '/v1/videos/generations', query: '/v1/videos/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'hunyuan', 'tencent') || hostIncludes(ctx.baseUrl, 'hunyuan.tencentcloudapi.com', 'hunyuanapi'),
  buildImageBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '' };
  },
  buildVideoBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '', ...(firstFrame(opts) ? { image: firstFrame(opts) } : {}) };
  },
});

createAdapter({
  id: 'qianfan',
  aliases: ['baidu', 'wenxin'],
  group: 'official',
  imageCreate: '/v2/images/generations',
  videoCreate: '/v2/videos/generations',
  pollPath: '/v2/videos/{taskId}',
  videoQuery: '/v2/videos/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/v2/chat/completions' },
    image: { endpoint: '/v2/images/generations' },
    storyboard_image: { endpoint: '/v2/images/generations' },
    video: { endpoint: '/v2/videos/generations', query: '/v2/videos/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'qianfan', 'baidu', 'wenxin')
    || hostIncludes(ctx.baseUrl, 'qianfan.baidubce.com', 'aip.baidubce.com'),
  buildImageBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '' };
  },
  buildVideoBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '' };
  },
});

createAdapter({
  id: 'spark',
  aliases: ['xunfei', 'xfyun'],
  group: 'official',
  imageCreate: '/v1/images/generations',
  videoCreate: '/v1/videos/generations',
  pollPath: '/v1/videos/{taskId}',
  videoQuery: '/v1/videos/{taskId}',
  defaultEndpoints: {
    text: { endpoint: '/v1/chat/completions' },
    image: { endpoint: '/v1/images/generations' },
    storyboard_image: { endpoint: '/v1/images/generations' },
    video: { endpoint: '/v1/videos/generations', query: '/v1/videos/{taskId}' },
  },
  infer: (ctx) => providerIs(ctx, 'spark', 'xunfei', 'xfyun')
    || hostIncludes(ctx.baseUrl, 'spark-api', 'xf-yun', 'xfyun.cn'),
  buildImageBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '' };
  },
  buildVideoBody(_config, opts) {
    return { model: opts.model, prompt: opts.prompt || '' };
  },
});

createAdapter({
  id: 'runninghub',
  group: 'queue',
  imageCreate: '/task/openapi/create',
  videoCreate: '/task/openapi/create',
  pollPath: '/task/openapi/status',
  videoQuery: '/task/openapi/outputs',
  pollMethod: 'POST',
  buildPollBody: (taskId) => ({ taskId }),
  defaultEndpoints: {
    image: { endpoint: '/task/openapi/create', query: '/task/openapi/outputs' },
    storyboard_image: { endpoint: '/task/openapi/create', query: '/task/openapi/outputs' },
    video: { endpoint: '/task/openapi/create', query: '/task/openapi/outputs' },
  },
  infer: (ctx) => providerIs(ctx, 'runninghub') || hostIncludes(ctx.baseUrl, 'runninghub.cn', 'runninghub.ai'),
  buildImageBody(config, opts) {
    return {
      workflowId: opts.model,
      prompt: opts.prompt || '',
      apiKey: config.api_key,
    };
  },
  buildVideoBody(config, opts) {
    return {
      workflowId: opts.model,
      prompt: opts.prompt || '',
      apiKey: config.api_key,
    };
  },
});

module.exports = { createAdapter };
