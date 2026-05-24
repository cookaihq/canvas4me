/**
 * foxapi 路由集中登记 —— 由 src/app/main.jsx 在启动时 import 一次,
 * 触发各 capability 的 registerRoute() 调用把路由登入 TaskClient.foxapi.js
 * 内部的 ROUTES Map。
 *
 * 路由 key 形态:`${nodeType}::${capability}::${mode}`
 * 路由 value:`{ endpoint, transformBody?, pickTaskId? }`
 *
 * 章节顺序:LLM → 图像 → 视频 → 音频。capability 字段映射以各 capability 自己的
 * design doc 为准。
 *
 * 字段剥离分层:
 *   - 全局 `stripBuilderWrapperFields`(在 TaskClient.foxapi.js):剥
 *     `extra_task_id` / `project_id` / `node_id` / `capability` —— 全 capability 安全
 *   - 本文件 per-route `transformBody`:剥 `mode`(若 builder 输出了包装版 mode
 *     字段)+ 加 capability 自己的额外字段(如 LLM 默认 stream:true)
 *
 */

import { registerRoute } from './TaskClient.foxapi'

// ────────────────────────────────────────────────────────────────────────────
// LLM —— /v1/llm/generations
// ────────────────────────────────────────────────────────────────────────────
//
// llm capability,4 mode 按输入类型切分(text/vision/audio/video),共用同一端点。
// builder 直出 foxapi 字段(model / prompt / image_urls / audio_url / video_urls /
// temperature / max_tokens / system_prompt / reasoning),
// transformBody 追加默认 `stream: true`(走 SSE 主路径)。
//
// 路由 mode == 后端 capability id == TaskClient SubmitParams 里的 mode 字段。
// urlSegment 由 modeDef.modelSeries 决定(也 == mode id),走 /v1/llm/generations 统一端点。

function transformLlmBody(body) {
  if (!body || typeof body !== 'object') return body
  if (!('stream' in body)) return { ...body, stream: true }
  return body
}

// 注册 key:`${nodeType}::${capability_url_segment}::${mode}`
// 因为 modeDef.modelSeries 把每个 mode 自己的 id 当作 url segment(详见
// llm/register.js),taskClient.submit 收到的 capability 字段值即 mode id,
// 所以这里 nodeType='llm', capability=mode, mode=mode 三层都用 mode id 注册。
const LLM_MODES = ['llm-text', 'llm-vision', 'llm-audio', 'llm-video', 'llm-custom']
for (const mode of LLM_MODES) {
  registerRoute('llm', mode, mode, {
    endpoint: '/v1/llm/generations',
    transformBody: transformLlmBody,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 图像 —— /v1/images/generations
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// 视频 —— /v1/videos/generations
// ────────────────────────────────────────────────────────────────────────────

// seedance-2(详见 docs/reference/foxapi-endpoint-mapping.md §3 seedance-2 + design doc §3):
// 3 mode × 2 tier(standard / fast)= 6 个上游 model;builder.js 已正确组装
// (`seedance-2.0-fast-{slug}` / `seedance-2.0-{slug}`),其他字段(prompt /
// resolution / aspect_ratio / duration / generate_audio / seed / image_url /
// end_image_url / image_urls / video_urls / audio_urls)与 foxapi 字段 1:1。
// 全局 stripBuilderWrapperFields 已剥 project_id / node_id,无需 transformBody。
registerRoute('video', 'seedance-2', 'text-to-video', {
  endpoint: '/v1/videos/generations',
})
registerRoute('video', 'seedance-2', 'image-to-video', {
  endpoint: '/v1/videos/generations',
})
registerRoute('video', 'seedance-2', 'reference-to-video', {
  endpoint: '/v1/videos/generations',
})

// fabric / sync(由 talking-head 拆分而来,详见 register.js + design doc):
// 各自单 mode、各自独立 capability;URL 段(capability 字段)= modelSeries 'fabric'/'sync'。
// 两者都走 /v1/videos/generations,由 body.model 字段在 foxapi 分派上游。
// 全局 stripBuilderWrapperFields 已剥 project_id / node_id,无需 transformBody。
registerRoute('video', 'fabric', 'generate-video', {
  endpoint: '/v1/videos/generations',
})
registerRoute('video', 'sync', 'sync-video', {
  endpoint: '/v1/videos/generations',
})

// creatify-aurora(高保真口播数字人,单 mode):走 /v1/videos/generations,
// 由 body.model('creatify-aurora')在 foxapi 分派上游。全局 stripBuilderWrapperFields
// 已剥 project_id / node_id,无需 transformBody。
registerRoute('video', 'creatify-aurora', 'image-audio-to-video', {
  endpoint: '/v1/videos/generations',
})

// topaz(详见 HTML 原型 + ai-tools-api topaz.md):
// 单 mode upscale-video → model topaz-upscale-video;builder.js 输出字段
// (model / video_url / enhancement_model / upscale_factor / target_fps /
// compression / noise / halo / grain / recover_detail / h264_output)
// 与 foxapi 字段 1:1。全局 stripBuilderWrapperFields 已剥 project_id / node_id,
// 无需 transformBody。
registerRoute('video', 'topaz', 'upscale-video', {
  endpoint: '/v1/videos/generations',
})

// gpt-image-2(详见 docs/reference/foxapi-endpoint-mapping.md §2 gpt-image-2 + design doc §3):
// 2 mode 端到端字段与 foxapi 完全 1:1。builder.js 已正确处理 limit mode 的字段
// 约束(只透传 resolution,不发 num_outputs / quality / output_format / background /
// mask_url),与 foxapi 严格 schema(extra="forbid")对齐。全局 stripBuilderWrapperFields 已剥
// project_id / node_id,无需 transformBody。
registerRoute('image', 'gpt-image-2', 'gpt-image-2', {
  endpoint: '/v1/images/generations',
})
registerRoute('image', 'gpt-image-2', 'gpt-image-2-limit', {
  endpoint: '/v1/images/generations',
})

// nano-banana(Gemini 图片家族,详见 docs/reference/foxapi-endpoint-mapping.md §2 nano-banana + HTML 原型):
// 单 mode generate-image;两档 model(gemini-3.1-flash-image-preview / gemini-3-pro-image-preview)
// 由 builder 的 modeParams.model 写入 body.model 决定上游。builder 输出字段
// (model / prompt / aspect_ratio / resolution / image_urls / output_format /
// google_search / image_search)与 foxapi 字段 1:1;image_search 仅 flash 发送。
// 全局 stripBuilderWrapperFields 已剥 project_id / node_id,无需 transformBody。
registerRoute('image', 'nano-banana', 'generate-image', {
  endpoint: '/v1/images/generations',
})

// ────────────────────────────────────────────────────────────────────────────
// 音频 —— /v1/audios/generations
// ────────────────────────────────────────────────────────────────────────────

// minimax-speech(TTS,详见 design doc + docs/guides/unified-contract-migration.md):
// 双 mode `quick` / `batch` —— 都走同一上游端点 /v1/audios/generations;
// model 由面板字段 modeParams.<mode>.model 决定(speech-2.8-hd / speech-2.8-turbo)。
// batch 的 N 段切分由前端 expandRuns 处理,后端不感知 mode。
//
// builder.js 已直出 foxapi 真实嵌套(voice_setting / audio_setting),无需 transformBody。
// 全局 stripBuilderWrapperFields 已剥 project_id / node_id / extra_task_id / capability。
// builder 不输出 `mode` 字段,故无需 per-route mode 剥离。
registerRoute('sound', 'minimax-speech', 'quick', {
  endpoint: '/v1/audios/generations',
})
registerRoute('sound', 'minimax-speech', 'batch', {
  endpoint: '/v1/audios/generations',
})

// minimax-music(文生音乐, 单 mode generate-music): 走 /v1/audios/generations,
// model 由 body.model(minimax-music-v2.6 / v2.5)在 foxapi 分派上游。
// builder 输出字段(model / prompt / lyrics? / is_instrumental? / lyrics_optimizer? / audio_setting?)
// 与 foxapi 字段 1:1。全局 stripBuilderWrapperFields 已剥 project_id / node_id, 无需 transformBody。
registerRoute('sound', 'minimax-music', 'generate-music', {
  endpoint: '/v1/audios/generations',
})
