/**
 * Fabric 数字人 子能力注册 —— 单 mode(generate-video)。
 * 折叠形态(form 'folded' / productType 'video' / foldedOrientation 'landscape')。
 * category 'talking-head'(数字人,纯展示分组标签)。
 * 端口: in image(subject_image,必填) + audio(driver_audio,必填);out video-out(generated_video)。
 * 上游: model fabric-1.0 / fabric-1.0-fast,resolution 480p / 720p。
 */
import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { Image } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { getAudioDuration } from '@/canvas/utils/mediaMetadata'
import { buildFabricRequestBody } from './builder'
import { resolveFabricContent } from './resolveContent'
import OutputNode from './OutputNode.jsx'

const FABRIC_MODELS = ['fabric-1.0', 'fabric-1.0-fast']
const FABRIC_RESOLUTIONS = ['480p', '720p']

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  category: 'talking-head',
  displayIcon: Image,
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: 'generate-video',
  modes: {
    'generate-video': {
      label: '生成视频',
      modelSeries: 'fabric',
      inputs: [
        { id: 'image', label: '人物图', accept: ['image'], required: true, role: 'subject_image', canAcceptRoles: ['subject_image'] },
        { id: 'audio', label: '驱动音频', accept: ['audio'], required: true, role: 'driver_audio', canAcceptRoles: ['driver_audio'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: [
        {
          key: 'resolution', label: '分辨率', icon: '📐', control: 'buttons',
          defaultValue: '720p',
          options: FABRIC_RESOLUTIONS.map(v => ({ value: v, label: v, shortLabel: v })),
        },
        {
          key: 'model', label: '模型', icon: '🤖', control: 'buttons',
          defaultValue: 'fabric-1.0',
          options: FABRIC_MODELS.map(v => ({ value: v, label: v, shortLabel: v })),
        },
      ],
    },
  },

  dockedPanels: { 'generate-video': () => import('./modes/GenerateVideoDockedPanel') },
  cards: { 'generate-video': () => import('./cards/FabricCard.jsx') },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildFabricRequestBody,
  resolveContent: resolveFabricContent,

  pricing: {
    resolveModelId({ modeParams }) {
      const model = FABRIC_MODELS.includes(modeParams?.model) ? modeParams.model : 'fabric-1.0'
      const resolution = modeParams?.resolution || '720p'
      return `${model}[${resolution}]`
    },
    async computeUnits({ modeParams, collectedInputs }) {
      try {
        const url = pickUrl(collectedInputs?.audio)
        if (!url) return null
        return await getAudioDuration(url)
      } catch { return null }
    },
  },

  resolveTargetAspect() { return null },

  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    return rawError?.message || rawError?.error?.message || rawError?.data?.error || (typeof rawError?.error === 'string' ? rawError.error : '') || ''
  },
})

function pickUrl(input) {
  if (!input) return null
  if (Array.isArray(input)) {
    for (const item of input) { const url = item?.content?.url; if (url) return url }
    return null
  }
  return input.content?.url || null
}
