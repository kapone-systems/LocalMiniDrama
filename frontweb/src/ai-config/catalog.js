export const SERVICE_TYPES = [
  { id: 'text', label: '文本', hint: '剧本 / 分镜脚本' },
  { id: 'image', label: '文生图', hint: '角色 / 场景 / 道具' },
  { id: 'storyboard_image', label: '分镜图', hint: '带参考图' },
  { id: 'video', label: '视频', hint: '分镜成片' },
  { id: 'tts', label: 'TTS', hint: '配音' },
  { id: 'jimeng2_character_auth', label: '即梦认证', hint: 'SD2 角色' },
]

export const PROTOCOL_GROUPS = [
  {
    id: 'general',
    label: '通用',
    items: [
      { id: 'openai', label: 'OpenAI 兼容', services: ['image', 'storyboard_image', 'video'], help: '同步 POST /v1/images/generations，或中转站 content 数组视频。' },
      { id: 'grok2api', label: 'grok2api', services: ['image', 'storyboard_image', 'video'], help: '本地 Grok 网关。图走 aspect_ratio；视频 POST /v1/videos/generations，轮询 /v1/videos/{id}。' },
    ],
  },
  {
    id: 'image',
    label: '图片协议',
    items: [
      { id: 'volcengine', label: '火山 Seedream', services: ['image', 'storyboard_image', 'video'], help: '豆包 Seedream / Seedance 经典链路。' },
      { id: 'dashscope', label: '通义万象', services: ['image', 'storyboard_image', 'video'], help: 'DashScope 万相图/视频。' },
      { id: 'gemini', label: 'Gemini', services: ['image', 'storyboard_image', 'video'], help: 'Google 原生 generateContent / Veo。' },
      { id: 'nano_banana', label: 'NanoBanana', services: ['image', 'storyboard_image'], help: '异步 generate + record-info 轮询。' },
      { id: 'kling', label: '可灵生图', services: ['image', 'storyboard_image', 'video'], help: '可灵官方图/视频（JWT 或中转 Bearer）。' },
      { id: 'ideogram', label: 'Ideogram', services: ['image', 'storyboard_image'], help: 'Ideogram V3 文生图。' },
      { id: 'midjourney', label: 'Midjourney', services: ['image', 'storyboard_image'], help: 'Imagine 提交 + /mj/task/{id}/fetch 轮询。' },
    ],
  },
  {
    id: 'video',
    label: '视频协议',
    items: [
      { id: 'volcengine_omni', label: 'Seedance 全能', services: ['video'], help: '方舟多参考图，配合分镜全能模式。' },
      { id: 'sora', label: 'Sora 中转', services: ['video'], help: 'multipart/form-data，seconds + size。' },
      { id: 'sora_official', label: 'Sora 官方 JSON', services: ['video'], help: 'OpenAI 官方 POST /v1/videos，与中转 multipart 不是同一套。' },
      { id: 'veo3', label: 'Veo3 中转', services: ['video'], help: 'JSON images + enhance_prompt。' },
      { id: 'vidu', label: 'Vidu', services: ['video'], help: '官方 Token 或中转 Bearer。' },
      { id: 'kling_omni', label: '可灵 Omni', services: ['video'], help: 'O1 全能，官方 api-beijing 或飞儿中转。' },
      { id: 'xai', label: 'xAI 官方', services: ['video'], help: 'Grok Imagine 官方 aspect_ratio。' },
      { id: 'minimax_h3', label: 'MiniMax H3', services: ['video'], help: '官方 V2 /v2/video_generation。' },
      { id: 'minimax_hailuo', label: '海螺 02/2.3', services: ['video'], help: 'MiniMax 海螺 V1 /v1/video_generation，与 H3 分开。' },
      { id: 'agnes', label: 'Agnes 视频', services: ['video'], help: 'Agnes /videos 或 /agnesapi。' },
      { id: 'jimeng_ai_api', label: '即梦自建', services: ['video'], help: '自建 jimeng-free-api，同步返回 URL。' },
    ],
  },
  {
    id: 'hub',
    label: '聚合中转',
    items: [
      { id: 'apimart', label: 'APIMart 任务中心', services: ['image', 'storyboard_image', 'video'], help: '提交 generations 后轮询 GET /v1/tasks/{id}。CometAPI / AIMLAPI 同信封。' },
      { id: 'siliconflow', label: '硅基流动', services: ['image', 'storyboard_image', 'video'], help: '图返回 images[].url；视频 POST /v1/video/submit + POST /v1/video/status。' },
      { id: 'openrouter', label: 'OpenRouter', services: ['image', 'storyboard_image', 'video'], help: 'OpenRouter 图/视频 generations。文本仍走 chat/completions。' },
      { id: 'fal', label: 'Fal / Wavespeed', services: ['image', 'storyboard_image', 'video'], help: '队列式 fal.run，Authorization: Key。' },
      { id: 'replicate', label: 'Replicate', services: ['image', 'storyboard_image', 'video'], help: 'POST /v1/predictions 后轮询。' },
      { id: 'piapi', label: 'PiAPI', services: ['image', 'storyboard_image', 'video'], help: '统一 Create Task / Get Task。' },
      { id: 'kie', label: 'Kie.ai', services: ['image', 'storyboard_image', 'video'], help: '/api/v1/jobs 异步任务。' },
      { id: 'novita', label: 'Novita', services: ['image', 'storyboard_image', 'video'], help: '/v3/async 文生图/视频。' },
    ],
  },
  {
    id: 'official',
    label: '官方媒体',
    items: [
      { id: 'jimeng_official', label: '即梦官方', services: ['image', 'storyboard_image', 'video'], help: '即梦开放平台 /api/v3。' },
      { id: 'pixverse', label: 'PixVerse', services: ['video'], help: 'PixVerse openapi 文生视频。' },
      { id: 'skyreels', label: 'SkyReels', services: ['video'], help: 'SkyReels 官方生成 + 查询。' },
      { id: 'runway', label: 'Runway', services: ['video'], help: 'Runway image_to_video。' },
      { id: 'luma', label: 'Luma', services: ['video'], help: 'Dream Machine generations。' },
      { id: 'pika', label: 'Pika', services: ['video'], help: 'Pika generate/2.0。' },
      { id: 'zhipu', label: '智谱清影', services: ['image', 'storyboard_image', 'video'], help: 'open.bigmodel.cn 图/视频。' },
      { id: 'hunyuan', label: '腾讯混元', services: ['image', 'storyboard_image', 'video'], help: '混元图/视频。' },
      { id: 'qianfan', label: '百度千帆', services: ['image', 'storyboard_image', 'video'], help: '千帆 v2 图/视频。' },
      { id: 'spark', label: '讯飞星火', services: ['image', 'storyboard_image', 'video'], help: '星火图/视频。' },
      { id: 'runninghub', label: 'RunningHub', services: ['image', 'storyboard_image', 'video'], help: 'Comfy 云：提交工作流 ID + 轮询出片。' },
    ],
  },
]

export function protocolsForService(serviceType) {
  const st = serviceType || 'image'
  return PROTOCOL_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((p) => !p.services || p.services.includes(st)),
    }))
    .filter((g) => g.items.length)
}

export function findProtocol(id) {
  const key = String(id || '').toLowerCase()
  for (const g of PROTOCOL_GROUPS) {
    const hit = g.items.find((p) => p.id === key)
    if (hit) return hit
  }
  return null
}

export const PROVIDER_PRESETS = {
  text: [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4.1'] },
    { id: 'volcengine', name: '火山引擎', models: ['deepseek-v3-2-251201', 'doubao-1-5-pro-32k-250115'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-3-flash-preview'] },
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { id: 'qwen', name: '通义千问', models: ['qwen-plus', 'qwen-max'] },
    { id: 'agnes', name: 'Agnes', models: ['agnes-3.0-flash', 'agnes-2.5-flash'] },
    { id: 'apimart', name: 'APIMart', models: ['gpt-4o', 'claude-sonnet-4.5'] },
    { id: 'siliconflow', name: '硅基流动', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-32B'] },
    { id: 'openrouter', name: 'OpenRouter', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4'] },
    { id: 'grok2api', name: 'grok2api', models: ['grok-4.5', 'grok-4.3'] },
    { id: 'zhipu', name: '智谱', models: ['glm-4-plus', 'glm-4-flash'] },
  ],
  image: [
    { id: 'volcengine', name: '火山引擎', models: ['doubao-seedream-4-5-251128'] },
    { id: 'apimart', name: 'APIMart', models: ['seedream-4.5', 'grok-imagine-image'] },
    { id: 'siliconflow', name: '硅基流动', models: ['Kwai-Kolors/Kolors', 'Qwen/Qwen-Image'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-flash-image'] },
    { id: 'nano_banana', name: 'NanoBanana', models: ['gemini-2.5-flash-image'] },
    { id: 'dashscope', name: '通义万象', models: ['wan2.6-image'] },
    { id: 'openai', name: 'OpenAI', models: ['dall-e-3'] },
    { id: 'grok2api', name: 'grok2api', models: ['grok-imagine-image', 'grok-imagine-image-2.0'] },
    { id: 'fal', name: 'Fal', models: ['fal-ai/flux/schnell'] },
    { id: 'ideogram', name: 'Ideogram', models: ['V_3'] },
    { id: 'midjourney', name: 'Midjourney', models: ['midjourney'] },
    { id: 'zhipu', name: '智谱', models: ['cogview-3-flash'] },
  ],
  storyboard_image: [
    { id: 'volcengine', name: '火山引擎', models: ['doubao-seedream-4-5-251128'] },
    { id: 'apimart', name: 'APIMart', models: ['seedream-4.5', 'grok-imagine-image'] },
    { id: 'siliconflow', name: '硅基流动', models: ['Kwai-Kolors/Kolors'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-2.5-flash-image'] },
    { id: 'grok2api', name: 'grok2api', models: ['grok-imagine-image'] },
    { id: 'dashscope', name: '通义万象', models: ['wan2.6-image'] },
    { id: 'openai', name: 'OpenAI', models: ['dall-e-3'] },
  ],
  video: [
    { id: 'apimart', name: 'APIMart', models: ['grok-imagine-video', 'sora-2', 'veo3.1'] },
    { id: 'siliconflow', name: '硅基流动', models: ['Wan-AI/Wan2.2-I2V-A14B'] },
    { id: 'volces', name: '火山引擎', models: ['doubao-seedance-1-5-pro-251215'] },
    { id: 'klingai', name: '可灵官方', models: ['kling-v1'] },
    { id: 'ffir', name: '飞儿可灵', models: ['kling-v1'] },
    { id: 'vidu', name: 'Vidu', models: ['viduq3-pro'] },
    { id: 'minimax_h3', name: 'MiniMax H3', models: ['MiniMax-H3'] },
    { id: 'minimax_hailuo', name: '海螺 02', models: ['MiniMax-Hailuo-02'] },
    { id: 'gemini', name: 'Gemini Veo', models: ['veo-3.1-generate-preview'] },
    { id: 'sora_official', name: 'Sora 官方', models: ['sora-2'] },
    { id: 'openrouter', name: 'OpenRouter', models: ['openai/sora-2'] },
    { id: 'grok2api', name: 'grok2api', models: ['grok-imagine-video', 'grok-imagine-video-1.5'] },
    { id: 'fal', name: 'Fal', models: ['fal-ai/kling-video'] },
    { id: 'runway', name: 'Runway', models: ['gen3a_turbo'] },
    { id: 'luma', name: 'Luma', models: ['ray-2'] },
    { id: 'pixverse', name: 'PixVerse', models: ['pixverse-v4'] },
    { id: 'zhipu', name: '智谱清影', models: ['cogvideox-2'] },
    { id: 'jimeng_ai_api', name: '即梦自建', models: ['jimeng-video'] },
  ],
  tts: [
    { id: 'minimax', name: 'MiniMax', models: ['speech-02-hd'] },
    { id: 'openai', name: 'OpenAI', models: ['tts-1', 'gpt-4o-mini-tts'] },
    { id: 'apimart', name: 'APIMart', models: ['gpt-4o-mini-tts'] },
    { id: 'grok2api', name: 'grok2api', models: ['grok-voice-latest'] },
  ],
  jimeng2_character_auth: [
    { id: 'jimeng_material_api', name: '即梦业务素材 API', models: ['-'] },
  ],
}

export const PROVIDER_PROTOCOL = {
  volcengine: 'volcengine', volces: 'volcengine', volc: 'volcengine',
  nano_banana: 'nano_banana', dashscope: 'dashscope', qwen_image: 'dashscope',
  gemini: 'gemini', google: 'gemini', kling: 'kling', ffir: 'kling_omni', klingai: 'kling_omni',
  vidu: 'vidu', xai: 'xai', grok: 'xai', grok2api: 'grok2api',
  minimax: 'openai', minimax_h3: 'minimax_h3', minimax_hailuo: 'minimax_hailuo',
  openai: 'openai', qwen: 'openai', deepseek: 'openai',
  agnes: 'openai', jimeng_ai_api: 'jimeng_ai_api',
  apimart: 'apimart', cometapi: 'apimart', aimlapi: 'apimart',
  siliconflow: 'siliconflow', openrouter: 'openrouter',
  fal: 'fal', wavespeed: 'fal', replicate: 'replicate', piapi: 'piapi', kie: 'kie', novita: 'novita',
  sora_official: 'sora_official', jimeng_official: 'jimeng_official',
  pixverse: 'pixverse', skyreels: 'skyreels', runway: 'runway', luma: 'luma', pika: 'pika',
  ideogram: 'ideogram', midjourney: 'midjourney',
  zhipu: 'zhipu', hunyuan: 'hunyuan', qianfan: 'qianfan', spark: 'spark', runninghub: 'runninghub',
}

export const PROVIDER_BASE = {
  gemini: 'https://generativelanguage.googleapis.com',
  minimax_h3: 'https://api.minimaxi.com',
  minimax_hailuo: 'https://api.minimaxi.com',
  minimax: 'https://api.minimaxi.com/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  volces: 'https://ark.cn-beijing.volces.com/api/v3',
  openai: 'https://api.openai.com/v1',
  sora_official: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  dashscope: 'https://dashscope.aliyuncs.com',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwen_image: 'https://dashscope.aliyuncs.com',
  ffir: 'https://ffir.cn',
  jimeng_ai_api: 'http://127.0.0.1:8000',
  jimeng_material_api: 'https://silvamux.tingyutech.com',
  xai: 'https://api.x.ai',
  grok: 'https://api.x.ai',
  agnes: 'https://apihub.agnes-ai.com/v1',
  nano_banana: 'https://api.nanobananaapi.ai',
  vidu: 'https://api.vidu.cn',
  kling: 'https://api.klingai.com',
  klingai: 'https://api-beijing.klingai.com',
  apimart: 'https://api.apimart.ai',
  siliconflow: 'https://api.siliconflow.cn/v1',
  openrouter: 'https://openrouter.ai',
  fal: 'https://fal.run',
  replicate: 'https://api.replicate.com',
  piapi: 'https://api.piapi.ai',
  kie: 'https://api.kie.ai',
  novita: 'https://api.novita.ai',
  grok2api: 'http://127.0.0.1:8000',
  zhipu: 'https://open.bigmodel.cn',
  runway: 'https://api.dev.runwayml.com',
  luma: 'https://api.lumalabs.ai',
  ideogram: 'https://api.ideogram.ai',
  runninghub: 'https://www.runninghub.cn',
}

function rows(list) {
  return list.map((r) => ({
    priority: 0,
    is_default: true,
    is_active: true,
    settings: null,
    query_endpoint: r.query_endpoint || '',
    endpoint: r.endpoint || '',
    api_protocol: r.api_protocol || '',
    ...r,
  }))
}

export const PRESET_PACKS = [
  {
    id: 'volcengine',
    group: 'official',
    title: '火山引擎',
    desc: '方舟文本 + Seedream 图 + Seedance 视频',
    configs: rows([
      { service_type: 'text', name: '火山引擎 文本', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volcengine', model: ['deepseek-v3-2-251201', 'doubao-1-5-pro-32k-250115'] },
      { service_type: 'image', name: '火山 即梦文生图', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volcengine', model: ['doubao-seedream-4-5-251128'] },
      { service_type: 'storyboard_image', name: '火山 分镜图', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volcengine', model: ['doubao-seedream-4-5-251128'] },
      { service_type: 'video', name: '火山 即梦视频', base_url: 'https://ark.cn-beijing.volces.com/api/v3', provider: 'volces', model: ['doubao-seedance-1-5-pro-251215'] },
    ]),
  },
  {
    id: 'agnes',
    group: 'official',
    title: 'Agnes',
    desc: '一个 Key 覆盖文本 / 图 / 视频',
    configs: rows([
      { service_type: 'text', name: 'Agnes 文本', base_url: 'https://apihub.agnes-ai.com/v1', provider: 'agnes', api_protocol: 'openai', model: ['agnes-3.0-flash'] },
      { service_type: 'image', name: 'Agnes 文生图', base_url: 'https://apihub.agnes-ai.com/v1', provider: 'agnes', api_protocol: 'openai', model: ['agnes-image-2.5-flash'] },
      { service_type: 'storyboard_image', name: 'Agnes 分镜图', base_url: 'https://apihub.agnes-ai.com/v1', provider: 'agnes', api_protocol: 'openai', model: ['agnes-image-2.5-flash'] },
      { service_type: 'video', name: 'Agnes 视频', base_url: 'https://apihub.agnes-ai.com/v1', provider: 'agnes', api_protocol: 'agnes', endpoint: '/videos', query_endpoint: '/agnesapi', model: ['agnes-video-2.5-flash'] },
    ]),
  },
  {
    id: 'grok2api',
    group: 'selfhost',
    title: 'grok2api',
    desc: '本地 Grok 网关，需填写部署地址',
    needsBaseUrl: true,
    defaultBaseUrl: 'http://127.0.0.1:8000',
    configs: rows([
      { service_type: 'text', name: 'grok2api 文本', provider: 'grok2api', api_protocol: 'openai', endpoint: '/v1/chat/completions', model: ['grok-4.5', 'grok-4.3'] },
      { service_type: 'image', name: 'grok2api 文生图', provider: 'grok2api', api_protocol: 'grok2api', endpoint: '/v1/images/generations', model: ['grok-imagine-image', 'grok-imagine-image-2.0'] },
      { service_type: 'storyboard_image', name: 'grok2api 分镜图', provider: 'grok2api', api_protocol: 'grok2api', endpoint: '/v1/images/generations', model: ['grok-imagine-image'] },
      { service_type: 'video', name: 'grok2api 视频', provider: 'grok2api', api_protocol: 'grok2api', endpoint: '/v1/videos/generations', query_endpoint: '/v1/videos/{taskId}', model: ['grok-imagine-video', 'grok-imagine-video-1.5'] },
      { service_type: 'tts', name: 'grok2api TTS', provider: 'grok2api', api_protocol: 'openai', endpoint: '/v1/audio/speech', model: ['grok-voice-latest'] },
    ]),
  },
  {
    id: 'apimart',
    group: 'relay',
    title: 'APIMart',
    desc: 'OpenAI 兼容网关 + 异步任务中心，适合短剧全链路',
    configs: rows([
      { service_type: 'text', name: 'APIMart 文本', provider: 'apimart', api_protocol: 'openai', base_url: 'https://api.apimart.ai/v1', endpoint: '/chat/completions', model: ['gpt-4o', 'claude-sonnet-4.5'] },
      { service_type: 'image', name: 'APIMart 文生图', provider: 'apimart', api_protocol: 'apimart', base_url: 'https://api.apimart.ai', endpoint: '/v1/images/generations', query_endpoint: '/v1/tasks/{taskId}', model: ['seedream-4.5', 'grok-imagine-image'] },
      { service_type: 'storyboard_image', name: 'APIMart 分镜图', provider: 'apimart', api_protocol: 'apimart', base_url: 'https://api.apimart.ai', endpoint: '/v1/images/generations', query_endpoint: '/v1/tasks/{taskId}', model: ['grok-imagine-image'] },
      { service_type: 'video', name: 'APIMart 视频', provider: 'apimart', api_protocol: 'apimart', base_url: 'https://api.apimart.ai', endpoint: '/v1/videos/generations', query_endpoint: '/v1/tasks/{taskId}', model: ['grok-imagine-video', 'sora-2'] },
      { service_type: 'tts', name: 'APIMart TTS', provider: 'apimart', api_protocol: 'openai', base_url: 'https://api.apimart.ai/v1', endpoint: '/audio/speech', model: ['gpt-4o-mini-tts'] },
    ]),
  },
  {
    id: 'siliconflow',
    group: 'relay',
    title: '硅基流动',
    desc: '国产开源模型 + Kolors / 万相视频',
    configs: rows([
      { service_type: 'text', name: '硅基 文本', provider: 'siliconflow', api_protocol: 'openai', base_url: 'https://api.siliconflow.cn/v1', model: ['deepseek-ai/DeepSeek-V3'] },
      { service_type: 'image', name: '硅基 文生图', provider: 'siliconflow', api_protocol: 'siliconflow', base_url: 'https://api.siliconflow.cn', endpoint: '/v1/images/generations', model: ['Kwai-Kolors/Kolors'] },
      { service_type: 'storyboard_image', name: '硅基 分镜图', provider: 'siliconflow', api_protocol: 'siliconflow', base_url: 'https://api.siliconflow.cn', endpoint: '/v1/images/generations', model: ['Kwai-Kolors/Kolors'] },
      { service_type: 'video', name: '硅基 视频', provider: 'siliconflow', api_protocol: 'siliconflow', base_url: 'https://api.siliconflow.cn', endpoint: '/v1/video/submit', query_endpoint: '/v1/video/status', model: ['Wan-AI/Wan2.2-I2V-A14B'] },
    ]),
  },
  {
    id: 'openrouter',
    group: 'relay',
    title: 'OpenRouter',
    desc: '一个 Key 横评多家模型，图/视频走 OpenRouter 媒体接口',
    configs: rows([
      { service_type: 'text', name: 'OpenRouter 文本', provider: 'openrouter', api_protocol: 'openai', base_url: 'https://openrouter.ai/api/v1', model: ['openai/gpt-4o'] },
      { service_type: 'image', name: 'OpenRouter 图', provider: 'openrouter', api_protocol: 'openrouter', base_url: 'https://openrouter.ai', endpoint: '/api/v1/images/generations', model: ['openai/gpt-image-1'] },
      { service_type: 'video', name: 'OpenRouter 视频', provider: 'openrouter', api_protocol: 'openrouter', base_url: 'https://openrouter.ai', endpoint: '/api/v1/videos/generations', query_endpoint: '/api/v1/videos/{taskId}', model: ['openai/sora-2'] },
    ]),
  },
  { id: 'pack-302', group: 'relay', title: '302.AI', desc: '导入官方中转模板，改 Key 即可', file: '302ai-302' },
  { id: 'pack-ffir', group: 'relay', title: '飞儿 API', desc: 'ffir.cn 可灵 / 火山 / Gemini', file: '飞儿api-ffir.cn' },
  { id: 'pack-yunwu', group: 'relay', title: '云雾 AI', desc: 'yunwu.ai 中转模板', file: '云雾ai' },
  { id: 'pack-n1n', group: 'relay', title: 'n1n', desc: 'api.n1n.ai 中转模板', file: 'n1n' },
  { id: 'pack-geeknow', group: 'relay', title: 'GeekNow', desc: 'geeknow.top 中转模板', file: 'geeknow' },
  { id: 'pack-vector', group: 'relay', title: '向量', desc: 'vectorengine 中转模板', file: '向量' },
  {
    id: 'tongyi',
    group: 'official',
    title: '通义万象',
    desc: '阿里云百炼（官方直连，额度自备）',
    configs: rows([
      { service_type: 'text', name: '通义 文本', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', provider: 'qwen', model: ['qwen-plus'] },
      { service_type: 'image', name: '通义 文生图', base_url: 'https://dashscope.aliyuncs.com', provider: 'dashscope', model: ['wan2.6-image'] },
      { service_type: 'storyboard_image', name: '通义 分镜图', base_url: 'https://dashscope.aliyuncs.com', provider: 'dashscope', model: ['wan2.6-image'] },
      { service_type: 'video', name: '通义 视频', base_url: 'https://dashscope.aliyuncs.com', provider: 'dashscope', model: ['wan2.2-kf2v-flash'] },
    ]),
  },
]

export const PACK_GROUPS = [
  { id: 'official', label: '官方直连' },
  { id: 'relay', label: '中转 / 聚合' },
  { id: 'selfhost', label: '自建网关' },
]
