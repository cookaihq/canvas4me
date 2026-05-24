/**
 * llm 子能力注册 —— 当前只对用户开放「混合模式」(llm-custom);
 * 其余 4 个 mode(文本对话/图像理解/音频理解/视频理解)已注释隐藏,
 * 因为混合模式是它们的超集(各类输入均可选)。如需恢复,取消下方注释即可。
 *
 * URL 路由:每 mode 把自己的 id 设为 modelSeries,useRunCapability 用它拼:
 *   POST /api/apps/ai-canvas/v1/node/llm/{llm-text|llm-vision|llm-audio|llm-video|llm-custom}/submit
 *
 * 端口 id 跨 mode 共享:同名端口在各 mode 间复用 edges(切到不支持的 mode 时连线数据保留)。
 *
 * 端口 role 映射 (跨能力切换按 role 迁连线, 见 docs/reference/port-role-convention.md):
 *   - system-prompt : system_prompt (5 mode 共用)
 *   - prompt        : prompt_text   (5 mode 共用)
 *   - image (llm-vision): reference_image  — 图像理解的素材当"理解参考"
 *   - audio (llm-audio) : reference_audio  — 音频理解的素材当"理解参考"
 *   - video (llm-video) : reference_video  — 视频理解的素材当"理解参考"
 *   - 输出 text-out : generated_text (5 mode 共用)
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildLlmRequestBody, MAX_IMAGES, MAX_VIDEOS, MAX_AUDIOS, MAX_FILES } from './builder'
import { resolveLlmContent } from './resolveContent'
import OutputNode from './OutputNode.jsx'

// 文本端口 multiple: true → 允许多个文本节点连入(每个以 placeholder 占位嵌在 prompt 字符串里),
// 且与面板手输内容共存(不走旧的 face-off 互斥分支)。见 ui-standards #text-input-with-edges
const SYSTEM_PROMPT_INPUT = { id: 'system-prompt', label: '系统提示词', accept: ['text'], multiple: true, role: 'system_prompt', canAcceptRoles: ['system_prompt'] }
// 用户提示词可选(接口允许 prompt 缺省)
const PROMPT_INPUT_OPTIONAL = { id: 'prompt', label: '用户提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] }

// ── 以下 required 变体仅被已隐藏的 4 个 mode 使用,一并注释。恢复 mode 时取消注释。 ──
// const PROMPT_INPUT = { id: 'prompt', label: '用户提示词', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] }
// const IMAGE_INPUT = { id: 'image', label: '图片', accept: ['image'], multiple: true, maxInputs: MAX_IMAGES, required: true, role: 'reference_image', canAcceptRoles: ['reference_image'] }
// const AUDIO_INPUT = { id: 'audio', label: '音频', accept: ['audio'], multiple: true, maxInputs: MAX_AUDIOS, required: true, role: 'reference_audio', canAcceptRoles: ['reference_audio'] }
// const VIDEO_INPUT = { id: 'video', label: '视频', accept: ['video'], multiple: true, maxInputs: MAX_VIDEOS, required: true, role: 'reference_video', canAcceptRoles: ['reference_video'] }

// 混合模式用的可选变体（与同名端口 accept/multiple 一致，仅去掉 required）
const IMAGE_INPUT_OPTIONAL = { id: 'image', label: '图片', accept: ['image'], multiple: true, maxInputs: MAX_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image'] }
const VIDEO_INPUT_OPTIONAL = { id: 'video', label: '视频', accept: ['video'], multiple: true, maxInputs: MAX_VIDEOS, role: 'reference_video', canAcceptRoles: ['reference_video'] }
const AUDIO_INPUT_OPTIONAL = { id: 'audio', label: '音频', accept: ['audio'], multiple: true, maxInputs: MAX_AUDIOS, role: 'reference_audio', canAcceptRoles: ['reference_audio'] }
const FILE_INPUT = { id: 'file', label: '文件', accept: ['file'], multiple: true, maxInputs: MAX_FILES, role: 'reference_file', canAcceptRoles: ['reference_file'] }

// 输出统一 text:下游任何接 text 端口的节点都能消费;handle id 带 -out 后缀避免与
// input handle 撞名(详见 canvas/registry/nodeTypes.js getCapabilityOutputs JSDoc)
const TEXT_OUTPUTS = [{ id: 'text-out', type: 'text', role: 'generated_text' }]

registerCapability({
  ...meta,
  form: 'folded',
  productType: 'llm',
  defaultMode: 'llm-custom',
  modes: {
    'llm-custom': {
      label: '混合模式',
      modelSeries: 'llm-custom',  // URL 段:/node/llm/llm-custom/submit
      inputs: [SYSTEM_PROMPT_INPUT, PROMPT_INPUT_OPTIONAL, IMAGE_INPUT_OPTIONAL, AUDIO_INPUT_OPTIONAL, VIDEO_INPUT_OPTIONAL, FILE_INPUT],
      outputs: TEXT_OUTPUTS,
      api: { mode: 'async' },
      // 详见 docs/reference/ux-spec.md §9.6 — model 唯一常用参数,options 由 useLlmModels 运行时注入。
      // 其他参数(systemPrompt / temperature / maxTokens / reasoning)进齿轮高级区。
      commonParams: [
        { key: 'model', label: '模型', icon: '⚡', control: 'buttons' },
      ],
    },
    // ── 以下 4 个 mode 暂时隐藏,只对用户开放「混合模式」(见文件头注释)。恢复时取消注释。 ──
    // 'llm-text': {
    //   label: '文本对话',
    //   modelSeries: 'llm-text',  // URL 段:/node/llm/llm-text/submit
    //   inputs: [SYSTEM_PROMPT_INPUT, PROMPT_INPUT],
    //   outputs: TEXT_OUTPUTS,
    //   api: { mode: 'async' },
    //   commonParams: [
    //     { key: 'model', label: '模型', icon: '⚡', control: 'buttons' },
    //   ],
    // },
    // 'llm-vision': {
    //   label: '图像理解',
    //   modelSeries: 'llm-vision',
    //   inputs: [SYSTEM_PROMPT_INPUT, PROMPT_INPUT, IMAGE_INPUT],
    //   outputs: TEXT_OUTPUTS,
    //   api: { mode: 'async' },
    //   commonParams: [
    //     { key: 'model', label: '模型', icon: '⚡', control: 'buttons' },
    //   ],
    // },
    // 'llm-audio': {
    //   label: '音频理解',
    //   modelSeries: 'llm-audio',
    //   inputs: [SYSTEM_PROMPT_INPUT, PROMPT_INPUT_OPTIONAL, AUDIO_INPUT],
    //   outputs: TEXT_OUTPUTS,
    //   api: { mode: 'async' },
    //   commonParams: [
    //     { key: 'model', label: '模型', icon: '⚡', control: 'buttons' },
    //   ],
    // },
    // 'llm-video': {
    //   label: '视频理解',
    //   modelSeries: 'llm-video',
    //   inputs: [SYSTEM_PROMPT_INPUT, PROMPT_INPUT, VIDEO_INPUT],
    //   outputs: TEXT_OUTPUTS,
    //   api: { mode: 'async' },
    //   commonParams: [
    //     { key: 'model', label: '模型', icon: '⚡', control: 'buttons' },
    //   ],
    // },
  },
  dockedPanels: {
    // 'llm-text':   () => import('./modes/LlmTextDockedPanel'),
    // 'llm-vision': () => import('./modes/LlmVisionDockedPanel'),
    // 'llm-audio':  () => import('./modes/LlmAudioDockedPanel'),
    // 'llm-video':  () => import('./modes/LlmVideoDockedPanel'),
    'llm-custom': () => import('./modes/LlmCustomDockedPanel'),
  },
  view: () => import('./view.jsx'),
  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),
  cards: {
    // 'llm-text':   () => import('./cards/LlmTextCard'),
    // 'llm-vision': () => import('./cards/LlmVisionCard'),
    // 'llm-audio':  () => import('./cards/LlmAudioCard'),
    // 'llm-video':  () => import('./cards/LlmVideoCard'),
    'llm-custom': () => import('./cards/LlmCustomCard'),
  },
  build: buildLlmRequestBody,
  resolveContent: resolveLlmContent,
  // Failed 卡片摘要: LLM 上游 (openrouter / azure / 官方 chat.completions) 嵌套较深
  //   常见形态:
  //   1) string                                                  → 直接返回
  //   2) { error: { message } }                                   → 取 message
  //   3) { error: { metadata: { raw: '{"error":{"message":...}}'} } }
  //                                                              → 解析 raw JSON 再取 message
  //   4) { message }                                              → 取 message
  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError

    // openrouter 风格的 metadata.raw 是 JSON 字符串, 尝试再下挖一层
    const rawNested = rawError?.error?.metadata?.raw
    if (typeof rawNested === 'string' && rawNested.length > 0) {
      try {
        const parsed = JSON.parse(rawNested)
        const m = parsed?.error?.message || parsed?.message
        if (typeof m === 'string' && m.length > 0) return m
      } catch {
        // 不是合法 JSON 也算个摘要候选, 继续往下走
      }
    }

    const message = rawError?.error?.message
      || rawError?.message
      || (typeof rawError?.error === 'string' ? rawError.error : null)
    return message || ''
  },
})
