/**
 * Seedance 2.0 子能力注册 —— 见 docs/capabilities/video/seedance-2.md
 *
 * 形态:
 *   - form 'folded'             : 节点本体 = 视频产物
 *   - productType 'video'       : 折叠视频卡 (FoldedVideoPreviewCard)
 *   - foldedOrientation 'landscape': 默认 video-landscape 档 (620×348)
 *
 * 4 mode (按"输入素材类型"切分, 4 mode × 2 variant 共 6 个独立上游 model — FLF 复用 I2V):
 *   - text-to-video       (默认)
 *   - image-to-video       — 单图驱动
 *   - first-last-frame     — 首尾帧插值 (上游模型复用 I2V)
 *   - reference-to-video   — 全能参考 (image_urls / video_urls / audio_urls + chip prompt)
 *
 * 端口 role 映射 (跨能力切换按 role 迁连线, 见 docs/reference/port-role-convention.md):
 *   - prompt         : prompt_text
 *   - I2V start_image: first_frame_image (canAcceptRoles 含 subject_image — 单图驱动接受主体图)
 *   - FLF start_image: first_frame_image
 *   - FLF end_image  : last_frame_image
 *   - R2V image      : reference_image (语义独立, 不接受非参考类)
 *   - R2V video      : reference_video
 *   - R2V audio      : reference_audio
 *   - 输出 video-out : generated_video (4 mode 共用)
 *
 * commonParams 5 项 (按设计文档 §2.2 顺序, 4 mode 共用):
 *   1. aspect_ratio  — 比例 (chip 显示原始值, 联动节点尺寸)
 *   2. resolution    — 清晰度 (computeDisabled: model_variant=fast 时 1080p disabled)
 *   3. duration      — 时长 (slider 4-15; -1 = Auto, 由模型决定)
 *   4. generate_audio — 生成音频 (switch)
 *   5. model_variant — 模型版本 (standard / fast, 影响请求体 model 字段拼接 + 定价)
 */
import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { Clapperboard } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildSeedance2RequestBody } from './builder'
import { resolveSeedance2Content } from './resolveContent'
import { expandSeedance2Runs } from './expandRuns'
// outputNode 必须 eager: React Flow 直接当组件渲染, 不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

// R2V 端口上限 — 与 reference-to-video inputs schema 的 maxInputs 保持一致
export const R2V_MAX_IMAGES = 9
export const R2V_MAX_VIDEOS = 3
export const R2V_MAX_AUDIOS = 3

// 上游模型族枚举 — 6 个独立 model id (FLF 复用 I2V, 故 4 mode × 2 variant 共 6 个)
// 见设计文档 §3 Mode + ModelVariant → Model 映射
export const SEEDANCE2_MODELS = {
  'text-to-video':      { standard: 'seedance-2.0-text-to-video',      fast: 'seedance-2.0-fast-text-to-video' },
  'image-to-video':     { standard: 'seedance-2.0-image-to-video',     fast: 'seedance-2.0-fast-image-to-video' },
  'first-last-frame':   { standard: 'seedance-2.0-image-to-video',     fast: 'seedance-2.0-fast-image-to-video' },
  'reference-to-video': { standard: 'seedance-2.0-reference-to-video', fast: 'seedance-2.0-fast-reference-to-video' },
}

const ASPECT_OPTIONS = [
  { value: 'adaptive', label: 'Auto', shortLabel: 'Auto', w: 16, h: 9 },
  { value: '16:9',     label: '16:9', shortLabel: '16:9', w: 16, h: 9 },
  { value: '4:3',      label: '4:3',  shortLabel: '4:3',  w: 4,  h: 3 },
  { value: '1:1',      label: '1:1',  shortLabel: '1:1',  w: 1,  h: 1 },
  { value: '3:4',      label: '3:4',  shortLabel: '3:4',  w: 3,  h: 4 },
  { value: '9:16',     label: '9:16', shortLabel: '9:16', w: 9,  h: 16 },
  { value: '21:9',     label: '21:9', shortLabel: '21:9', w: 21, h: 9 },
]

const RESOLUTION_OPTIONS = [
  { value: '480p',  label: '480P',  shortLabel: '480P' },
  { value: '720p',  label: '720P',  shortLabel: '720P' },
  { value: '1080p', label: '1080P', shortLabel: '1080P' },
]

const MODEL_VARIANT_OPTIONS = [
  { value: 'standard', label: 'Seedance 2.0',      shortLabel: 'Seedance 2.0' },
  { value: 'fast',     label: 'Seedance 2.0 fast', shortLabel: 'Seedance 2.0 fast' },
]

// 5 项 commonParams 设计文档 §2.2: aspect_ratio / resolution / duration / generate_audio / model_variant
// 4 个 mode 复用同一份 (差异只在主区: prompt / 上传 / 参考素材, 由各 mode DockedPanel 自渲染)
const SEEDANCE2_COMMON_PARAMS = [
  {
    key: 'aspect_ratio',
    label: '比例',
    icon: '📐',
    control: 'aspect-grid',
    defaultValue: 'adaptive',
    options: ASPECT_OPTIONS,
  },
  {
    key: 'resolution',
    label: '清晰度',
    icon: '🎬',
    control: 'buttons',
    optionsLayout: 'row',
    defaultValue: '720p',
    options: RESOLUTION_OPTIONS,
    // Fast 版上游不支持 1080p, Popover 灰掉对应按钮 (设计文档 §2.2)
    computeDisabled: (optValue, params) => {
      const variant = params?.model_variant || 'standard'
      const blocked = variant === 'fast' && optValue === '1080p'
      return { disabled: blocked, reason: blocked ? 'Fast 版不支持 1080p' : null }
    },
  },
  {
    key: 'duration',
    label: '时长',
    icon: '⏱',
    control: 'slider',
    defaultValue: 5,
    min: 4,
    max: 15,
    step: 1,
    suffix: 's',
  },
  {
    key: 'generate_audio',
    label: '生成音频',
    icon: '🔊',
    control: 'switch',
    defaultValue: true,
  },
  {
    key: 'model_variant',
    label: '模型版本',
    icon: '⚡',
    control: 'buttons',
    defaultValue: 'standard',
    options: MODEL_VARIANT_OPTIONS,
  },
]

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  category: 'video-gen',
  displayIcon: Clapperboard,
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: 'text-to-video',
  modes: {
    'text-to-video': {
      label: '文生视频',
      modelSeries: 'seedance-2',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: SEEDANCE2_COMMON_PARAMS,
    },
    'image-to-video': {
      label: '图生视频',
      modelSeries: 'seedance-2',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        // 单图驱动: 接受 subject_image 作 fallback (主体图当首帧用语义近)
        { id: 'start_image', label: '图片', accept: ['image'], role: 'first_frame_image', canAcceptRoles: ['first_frame_image', 'subject_image'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: SEEDANCE2_COMMON_PARAMS,
    },
    'first-last-frame': {
      label: '首尾帧',
      modelSeries: 'seedance-2',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        { id: 'start_image', label: '首帧', accept: ['image'], role: 'first_frame_image', canAcceptRoles: ['first_frame_image'] },
        { id: 'end_image', label: '尾帧', accept: ['image'], role: 'last_frame_image', canAcceptRoles: ['last_frame_image'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: SEEDANCE2_COMMON_PARAMS,
    },
    'reference-to-video': {
      label: '全能参考',
      modelSeries: 'seedance-2',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        // 参考类语义独立, 不接受 subject / first_frame 等非参考类的连线 (避免错位)
        { id: 'image', label: '参考图', accept: ['image'], multiple: true, maxInputs: R2V_MAX_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image'] },
        { id: 'video', label: '参考视频', accept: ['video'], multiple: true, maxInputs: R2V_MAX_VIDEOS, role: 'reference_video', canAcceptRoles: ['reference_video'] },
        { id: 'audio', label: '参考音频', accept: ['audio'], multiple: true, maxInputs: R2V_MAX_AUDIOS, role: 'reference_audio', canAcceptRoles: ['reference_audio'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: SEEDANCE2_COMMON_PARAMS,
    },
  },

  dockedPanels: {
    'text-to-video':      () => import('./modes/TextToVideoDockedPanel'),
    'image-to-video':     () => import('./modes/ImageToVideoDockedPanel'),
    'first-last-frame':   () => import('./modes/FirstLastFrameDockedPanel'),
    'reference-to-video': () => import('./modes/ReferenceToVideoDockedPanel'),
  },

  cards: {
    'text-to-video':      () => import('./cards/TextToVideoCard.jsx'),
    'image-to-video':     () => import('./cards/ImageToVideoCard.jsx'),
    'first-last-frame':   () => import('./cards/FirstLastFrameCard.jsx'),
    'reference-to-video': () => import('./cards/ReferenceToVideoCard.jsx'),
  },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildSeedance2RequestBody,
  resolveContent: resolveSeedance2Content,
  expandRuns: expandSeedance2Runs,

  // 计费 ability_id 由 (mode, model_variant, resolution, R2V 是否带视频) 决定 — 见设计文档 §4.1
  // 全系列按"输出视频秒数"结算, 后端按 resolution 分档计费, ability_id 带 [<resolution>] 后缀.
  // R2V 带视频再叠 |video-input — 价格不同.
  pricing: {
    resolveModelId({ mode, modeParams, collectedInputs }) {
      const variant = modeParams?.model_variant === 'fast' ? 'fast' : 'standard'
      const resolution = modeParams?.resolution || '720p'
      const baseModel = SEEDANCE2_MODELS[mode]?.[variant]
      if (!baseModel) return null
      let suffix = resolution
      if (mode === 'reference-to-video') {
        const portVideos = collectedInputs?.video
        const hasPortVideo = Array.isArray(portVideos)
          ? portVideos.some(v => v?.content?.url)
          : !!portVideos?.content?.url
        const hasPanelVideo = (modeParams?.panel_video_urls || []).length > 0
        if (hasPortVideo || hasPanelVideo) suffix = `${resolution}|video-input`
      }
      return `${baseModel}[${suffix}]`
    },
    computeUnits({ modeParams }) {
      // duration === -1 (Auto): 不知道总时长, 返回 null → UI 渲染"按每秒 N 积分"
      const duration = modeParams?.duration
      if (typeof duration !== 'number' || duration <= 0) return null
      return duration
    },
  },

  // 节点尺寸联动: 按 modeParams.aspect_ratio 反算 width/height 比例.
  // adaptive 时返回 null, 走 NODE_SIZE_PRESETS.video-landscape 兜底 (1.78).
  // Done 后由 FoldedVideoPreviewCard 写回 _imageAspect 接管真实比例.
  resolveTargetAspect: ({ aspect_ratio } = {}) => {
    if (typeof aspect_ratio !== 'string') return null
    if (aspect_ratio === 'adaptive') return null
    const m = aspect_ratio.match(/^(\d+)\s*:\s*(\d+)$/)
    if (!m) return null
    const w = Number(m[1])
    const h = Number(m[2])
    if (w > 0 && h > 0) return w / h
    return null
  },

  // Failed 卡片摘要: 后端通用 {code, message, data} 包装 + foxapi OpenAI 风格平铺
  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    const message = rawError?.message
      || rawError?.error?.message
      || rawError?.data?.error
      || (typeof rawError?.error === 'string' ? rawError.error : null)
    return message || ''
  },
})
