/**
 * Creatify Aurora 子能力注册 —— 单 mode(image-audio-to-video)。
 * 折叠形态(form 'folded' / productType 'video' / foldedOrientation 'landscape')。
 * category 'talking-head'(数字人,纯展示分组标签)。
 * 端口: in image(subject_image,必填) + audio(driver_audio,必填);out video-out(generated_video)。
 * 上游: 固定 model creatify-aurora,resolution 480p / 720p 决定计费档位。
 */
import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { Image } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { getAudioDuration } from '@/canvas/utils/mediaMetadata'
import { buildCreatifyAuroraRequestBody } from './builder'
import { resolveCreatifyAuroraContent } from './resolveContent'
import OutputNode from './OutputNode.jsx'

const RESOLUTIONS = ['480p', '720p']

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  category: 'talking-head',
  displayIcon: Image,
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: 'image-audio-to-video',
  modes: {
    'image-audio-to-video': {
      label: '高保真口播',
      modelSeries: 'creatify-aurora',
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
          options: RESOLUTIONS.map(v => ({ value: v, label: v, shortLabel: v })),
        },
      ],
    },
  },

  dockedPanels: { 'image-audio-to-video': () => import('./modes/ImageAudioToVideoDockedPanel') },
  cards: { 'image-audio-to-video': () => import('./cards/CreatifyAuroraCard.jsx') },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildCreatifyAuroraRequestBody,
  resolveContent: resolveCreatifyAuroraContent,

  pricing: {
    resolveModelId({ modeParams }) {
      const resolution = RESOLUTIONS.includes(modeParams?.resolution) ? modeParams.resolution : '720p'
      return `creatify-aurora[${resolution}]`
    },
    async computeUnits({ modeParams, collectedInputs }) {
      try {
        const url = pickUrl(collectedInputs?.audio) || modeParams?.audio_url
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
    for (const item of input) { const url = item?.content?.url || item?.url; if (url) return url }
    return null
  }
  return input.content?.url || input.url || null
}
