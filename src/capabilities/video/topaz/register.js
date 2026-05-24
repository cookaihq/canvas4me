import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { WandSparkles } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildTopazRequestBody } from './builder'
import { resolveTopazContent } from './resolveContent'
import OutputNode from './OutputNode.jsx'
import {
  DEFAULT_ENHANCEMENT_MODEL,
  DEFAULT_UPSCALE_FACTOR,
  TOPAZ_MODE,
  TOPAZ_MODEL,
} from './constants'

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  category: 'video-process',
  displayIcon: WandSparkles,
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: TOPAZ_MODE,
  modes: {
    [TOPAZ_MODE]: {
      label: '视频放大',
      modelSeries: 'topaz',
      inputs: [
        {
          id: 'video',
          label: '输入视频',
          accept: ['video'],
          required: true,
          role: 'source_video',
          canAcceptRoles: ['source_video'],
        },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: [
        {
          key: 'enhancement_model',
          label: '增强模型',
          control: 'select',
          defaultValue: DEFAULT_ENHANCEMENT_MODEL,
        },
        {
          key: 'upscale_factor',
          label: '放大倍率',
          control: 'buttons',
          defaultValue: DEFAULT_UPSCALE_FACTOR,
          options: [
            { value: 1, label: '1x' },
            { value: 2, label: '2x' },
            { value: 3, label: '3x' },
            { value: 4, label: '4x' },
          ],
        },
      ],
    },
  },

  dockedPanels: {
    [TOPAZ_MODE]: () => import('./modes/UpscaleVideoDockedPanel.jsx'),
  },

  cards: {
    [TOPAZ_MODE]: () => import('./cards/TopazCard.jsx'),
  },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),
  build: buildTopazRequestBody,
  resolveContent: resolveTopazContent,

  pricing: {
    resolveModelId({ modeParams }) {
      const factor = modeParams?.upscale_factor ?? DEFAULT_UPSCALE_FACTOR
      const fps = Number(modeParams?.target_fps)
      if (fps >= 60) return `${TOPAZ_MODEL}[60fps]`
      return factor > 1 ? `${TOPAZ_MODEL}[1080p]` : TOPAZ_MODEL
    },
    computeUnits() {
      return null
    },
    perUnitNote() {
      return '实际按输出视频时长计费'
    },
  },

  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    const unsupported = rawError?.unsupported_advanced_options
    if (Array.isArray(unsupported) && unsupported.length > 0) {
      return `当前模型不支持高级参数: ${unsupported.join(', ')}`
    }
    return rawError?.message
      || rawError?.error?.message
      || rawError?.data?.error
      || (typeof rawError?.error === 'string' ? rawError.error : '')
  },
})
