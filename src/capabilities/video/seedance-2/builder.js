/**
 * Seedance 2.0 builder —— 见 docs/capabilities/video/seedance-2.md §3
 *
 * 后端 schema 按 model 字段分派 (见 ai-tools-api/docs/API_REFERENCE/apps/ai_canvas/node_video/seedance_2.md):
 *   - text-to-video      : model, prompt, resolution?, aspect_ratio?, duration?, generate_audio?, seed?
 *   - image-to-video     : model, prompt, image_url, end_image_url?, resolution?, ...
 *   - reference-to-video : model, prompt, image_urls?, video_urls?, audio_urls?, resolution?, ...
 *   - envelope (wrapper) : project_id, node_id, extra_task_id
 *
 * ⚠️ 不能往 body 里塞 capability / mode / model_variant — 后端按 model 字段分派 schema, 多余字段触发 422.
 *
 * 字段来源优先级:
 *   - prompt: 端口 collectedInputs.prompt 优先, 其次 modeParams.prompt
 *   - 图片: 端口 collectedInputs.start_image / end_image 优先, 其次 modeParams.image_url / end_image_url
 *   - R2V 多素材: 端口数组 + 面板上传数组合并 (端口在前)
 */

import { SEEDANCE2_MODELS, R2V_MAX_IMAGES, R2V_MAX_VIDEOS, R2V_MAX_AUDIOS } from './register'
import { buildSeedancePromptText } from './_shared/seedance-prompt'
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'

export function buildSeedance2RequestBody({ mode, modeParams, collectedInputs, canvasId, nodeId }) {
  const variant = modeParams?.model_variant === 'fast' ? 'fast' : 'standard'
  const model = SEEDANCE2_MODELS[mode]?.[variant]
  if (!model) {
    throw new Error(`[seedance-2] unknown mode/variant: mode=${mode} variant=${variant}`)
  }

  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model,
  }

  // prompt: 端口优先, 面板兜底
  const promptInput = collectedInputs?.prompt
  const portPromptText = Array.isArray(promptInput)
    ? promptInput[0]?.content?.text
    : promptInput?.content?.text

  if (mode === 'text-to-video') {
    const prompt = portPromptText || expandPromptPlaceholders(modeParams?.prompt || '', collectedInputs, 'prompt')
    if (!prompt.trim()) throw new Error('请填写 Prompt')
    body.prompt = prompt
  } else if (mode === 'image-to-video') {
    const prompt = portPromptText || expandPromptPlaceholders(modeParams?.prompt || '', collectedInputs, 'prompt')
    if (prompt) body.prompt = prompt
    const imageUrl = pickPortUrl(collectedInputs?.start_image) || modeParams?.image_url
    if (!imageUrl) throw new Error('请提供图片 (start_image 端口或面板上传)')
    body.image_url = imageUrl
  } else if (mode === 'first-last-frame') {
    const prompt = portPromptText || expandPromptPlaceholders(modeParams?.prompt || '', collectedInputs, 'prompt')
    if (prompt) body.prompt = prompt
    const startUrl = pickPortUrl(collectedInputs?.start_image) || modeParams?.image_url
    if (!startUrl) throw new Error('请提供首帧图片')
    const endUrl = pickPortUrl(collectedInputs?.end_image) || modeParams?.end_image_url
    if (!endUrl) throw new Error('请提供尾帧图片')
    body.image_url = startUrl
    body.end_image_url = endUrl
  } else if (mode === 'reference-to-video') {
    // R2V prompt: 端口优先, 否则用 segments 序列化
    let prompt = portPromptText
    if (!prompt) {
      const segs = modeParams?._reference_prompt_segments
      prompt = Array.isArray(segs) ? buildSeedancePromptText(segs) : expandPromptPlaceholders(modeParams?.prompt || '', collectedInputs, 'prompt')
    }
    prompt = (prompt || '').trim()
    if (!prompt) throw new Error('请填写 Prompt')
    body.prompt = prompt

    // 端口侧 image / video / audio (multiple)
    const portImageUrls = pickPortUrls(collectedInputs?.image)
    const portVideoUrls = pickPortUrls(collectedInputs?.video)
    const portAudioUrls = pickPortUrls(collectedInputs?.audio)
    const panelImageUrls = (modeParams?.panel_image_urls || []).map(p => p.url).filter(Boolean)
    const panelVideoUrls = (modeParams?.panel_video_urls || []).map(p => p.url).filter(Boolean)
    const panelAudioUrls = (modeParams?.panel_audio_urls || []).map(p => p.url).filter(Boolean)

    const imageUrlsRaw = [...portImageUrls, ...panelImageUrls]
    const videoUrlsRaw = [...portVideoUrls, ...panelVideoUrls]
    const audioUrlsRaw = [...portAudioUrls, ...panelAudioUrls]

    const total = imageUrlsRaw.length + videoUrlsRaw.length + audioUrlsRaw.length
    if (total === 0) throw new Error('至少上传一项参考素材')
    if (imageUrlsRaw.length === 0 && videoUrlsRaw.length === 0 && audioUrlsRaw.length > 0) {
      throw new Error('仅音频不够，请同时上传图片或视频')
    }

    if (imageUrlsRaw.length > R2V_MAX_IMAGES) {
      console.warn(`[seedance-2] image truncated ${imageUrlsRaw.length}→${R2V_MAX_IMAGES}`)
    }
    if (videoUrlsRaw.length > R2V_MAX_VIDEOS) {
      console.warn(`[seedance-2] video truncated ${videoUrlsRaw.length}→${R2V_MAX_VIDEOS}`)
    }
    if (audioUrlsRaw.length > R2V_MAX_AUDIOS) {
      console.warn(`[seedance-2] audio truncated ${audioUrlsRaw.length}→${R2V_MAX_AUDIOS}`)
    }
    const imageUrls = imageUrlsRaw.slice(0, R2V_MAX_IMAGES)
    const videoUrls = videoUrlsRaw.slice(0, R2V_MAX_VIDEOS)
    const audioUrls = audioUrlsRaw.slice(0, R2V_MAX_AUDIOS)

    if (imageUrls.length > 0) body.image_urls = imageUrls
    if (videoUrls.length > 0) body.video_urls = videoUrls
    if (audioUrls.length > 0) body.audio_urls = audioUrls
  } else {
    throw new Error(`[seedance-2] unknown mode: ${mode}`)
  }

  // Fast 版上游不支持 1080p — Popover 的 computeDisabled 已防止用户选中, 这里再兜底一道
  if (variant === 'fast' && modeParams?.resolution === '1080p') {
    throw new Error('Fast 版不支持 1080p，请改用标准版或选 720p')
  }

  // 公共参数: 与 commonParams 默认值不同时才显式携带
  if (modeParams?.resolution && modeParams.resolution !== '720p') {
    body.resolution = modeParams.resolution
  }
  if (modeParams?.aspect_ratio && modeParams.aspect_ratio !== 'adaptive') {
    body.aspect_ratio = modeParams.aspect_ratio
  }
  // duration: 仅 number 类型显式携带 (-1 = Auto, 也是 number, 后端识别)
  if (typeof modeParams?.duration === 'number') {
    body.duration = modeParams.duration
  }
  if (modeParams?.generate_audio === false) {
    body.generate_audio = false
  }
  if (typeof modeParams?.seed === 'number' && modeParams.seed !== -1) {
    body.seed = modeParams.seed
  }

  return { body, urlFields: [] }
}

function pickPortUrl(input) {
  if (!input) return null
  if (Array.isArray(input)) {
    for (const item of input) {
      const url = item?.content?.url
      if (url) return url
    }
    return null
  }
  return input?.content?.url || null
}

function pickPortUrls(input) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map(item => item?.content?.url).filter(Boolean)
  }
  const url = input?.content?.url
  return url ? [url] : []
}
