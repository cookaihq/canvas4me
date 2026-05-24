/**
 * llm capability builder —— 4 个 mode 各自的请求体组装。
 *
 * URL 路由由 modeDef.modelSeries 决定(在 register.js 里把 mode 自己的 id 设为 modelSeries):
 *   /api/apps/ai-canvas/v1/node/llm/{llm-text|llm-vision|llm-audio|llm-video}/submit
 *
 * 后端 schema 是 extra="forbid",只接受 API 文档列出的字段。不能塞 capability / mode / top_p / stop。
 *
 * prompt / system_prompt 拼接规则:
 *   params.prompt 是字符串,可能内嵌 {{ai-canvas:edge:<sourceNodeId>}} placeholder
 *   (来自文本端口「连入 + 手输」兼容模式 — 见 ui-standards #text-input-with-edges)。
 *   提交前调 expandPromptPlaceholders 把 placeholder 替换成对应源节点的 content.text,
 *   旧数据(纯文本无 placeholder)等同 identity。
 */
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'
import { assembleMessages } from './_shared/buildCustomMessages'
import { resolveModelConstraints } from './_shared/modelConstraints'

export const MAX_IMAGES = 10
export const MAX_VIDEOS = 10
export const MAX_FILES = 10
export const MAX_AUDIOS = 10

export function buildLlmRequestBody({ mode, modeParams, collectedInputs, canvasId, nodeId }) {
  const params = modeParams || {}

  // prompt / system_prompt: placeholder 展开后即最终送上游的字符串
  const systemPrompt = expandPromptPlaceholders(
    params.systemPrompt || '',
    collectedInputs,
    'system-prompt',
  )
  const promptText = expandPromptPlaceholders(
    params.prompt || '',
    collectedInputs,
    'prompt',
  )

  // ── 共有字段 ──
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model: params.model,
    temperature: params.temperature != null ? params.temperature : 0.7,
    reasoning: !!params.reasoning,
  }
  if (systemPrompt) body.system_prompt = systemPrompt
  if (params.maxTokens != null && params.maxTokens !== '') {
    body.max_tokens = params.maxTokens
  }

  // ── mode 独有字段 ──
  if (mode === 'llm-text') {
    body.prompt = promptText
  } else if (mode === 'llm-vision') {
    body.prompt = promptText
    body.image_urls = collectAttachmentUrls(collectedInputs, params, 'image', 'images').slice(0, MAX_IMAGES)
  } else if (mode === 'llm-audio') {
    // prompt 可选:端口和面板都空时不发字段
    if (promptText) body.prompt = promptText
    // 单 URL:端口优先(只允许一条连线),否则面板
    const audioPortInput = collectedInputs.audio
    const audioPort = Array.isArray(audioPortInput) ? audioPortInput[0] : audioPortInput
    const audioPortUrl = audioPort?.content?.url || ''
    const audioPanel = params.audio?.url || params.audio_url || ''
    body.audio_url = audioPortUrl || audioPanel
  } else if (mode === 'llm-video') {
    body.prompt = promptText
    const uploadedUrls = collectAttachmentUrls(collectedInputs, params, 'video', 'videos')
    // 用户粘贴的 YouTube 链接 (Gemini 模型原生识别) — 不走 OSS 上传、不进健康检查
    const youtubeLinks = Array.isArray(params.videoLinks)
      ? params.videoLinks.filter(u => typeof u === 'string' && u)
      : []
    body.video_urls = [...uploadedUrls, ...youtubeLinks].slice(0, MAX_VIDEOS)
  } else if (mode === 'llm-custom') {
    // 混合模式：messages 形态（不发 llm-* 旧顶层字段）。先收集各类附件 URL。
    const cons = resolveModelConstraints(params.model || '')
    const capOf = (kind, fb) => cons[kind]?.maxCount ?? fb
    const imageUrls = collectAttachmentUrls(collectedInputs, params, 'image', 'images').slice(0, capOf('image', MAX_IMAGES))
    const videoUploaded = collectAttachmentUrls(collectedInputs, params, 'video', 'videos')
    const youtubeLinks = Array.isArray(params.videoLinks)
      ? params.videoLinks.filter(u => typeof u === 'string' && u)
      : []
    const videoUrls = [...videoUploaded, ...youtubeLinks].slice(0, capOf('video', MAX_VIDEOS))
    const audioUrls = collectAttachmentUrls(collectedInputs, params, 'audio', 'audios').slice(0, capOf('audio', MAX_AUDIOS))
    const fileUrls = collectAttachmentUrls(collectedInputs, params, 'file', 'files').slice(0, capOf('file', MAX_FILES))

    const messages = assembleMessages({
      systemPrompt, promptText, images: imageUrls, videos: videoUrls, audios: audioUrls, files: fileUrls,
    })

    const customBody = {
      project_id: canvasId,
      node_id: nodeId,
      model: params.model,
      messages,
    }
    if (params.temperature != null) customBody.temperature = params.temperature
    if (params.maxTokens != null && params.maxTokens !== '') customBody.max_tokens = params.maxTokens

    // 混合模式 url 埋在 messages 内，本版不做运行前嵌套 URL 探测/自愈（附件 url 新鲜）。
    // youtube 链接是外部 url，无需健康检查。
    return { body: customBody, urlFields: [], externalUrls: youtubeLinks }
  } else {
    throw new Error(`[llm.builder] unknown mode "${mode}"`)
  }

  // urlFields:声明哪些字段含 URL,运行前 useRunCapability 会探测+自愈失效 URL
  const urlFields = []
  if (mode === 'llm-vision') urlFields.push('image_urls')
  if (mode === 'llm-audio')  urlFields.push('audio_url')
  if (mode === 'llm-video')  urlFields.push('video_urls')

  // externalUrls:llm-video 的 YouTube 链接是外部 URL,要从健康检查范围内排除
  const externalUrls = mode === 'llm-video' && Array.isArray(params.videoLinks)
    ? params.videoLinks.filter(u => typeof u === 'string' && u)
    : []

  return { body, urlFields, externalUrls }
}

function collectAttachmentUrls(collectedInputs, params, portId, panelKey) {
  const urls = []
  const portInput = collectedInputs[portId]
  const portList = Array.isArray(portInput) ? portInput : portInput ? [portInput] : []
  for (const item of portList) {
    const url = item?.content?.url
    if (url) urls.push(url)
  }
  const panelList = Array.isArray(params[panelKey]) ? params[panelKey] : []
  for (const item of panelList) {
    const url = item?.url || (typeof item === 'string' ? item : '')
    if (url) urls.push(url)
  }
  return urls
}
