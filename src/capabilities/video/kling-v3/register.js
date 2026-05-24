/**
 * 可灵 V3 子能力注册 —— 见 docs/prototype/capabilities/video/20260523-kling-v3/index.html
 *
 * 形态:
 *   - form 'folded'              : 节点本体 = 视频产物
 *   - productType 'video'        : 折叠视频卡 (FoldedVideoPreviewCard)
 *   - foldedOrientation 'landscape': 默认 video-landscape 档 (620×348)
 *
 * 4 mode (按输入素材类型切分):
 *   - text-to-video     (默认)
 *   - image-to-video    — 图生视频
 *   - first-last-frame  — 首尾帧插值
 *   - motion-control    — 动作控制
 */
import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { Clapperboard } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildKlingV3RequestBody } from './builder'
import { resolveKlingV3Content } from './resolveContent'
import { expandKlingV3Runs } from './expandRuns'
import { resolveKlingV3ModelId, computeKlingV3Units } from './_shared/pricing'
// outputNode 必须 eager: React Flow 直接当组件渲染, 不走 Suspense/lazy
import KlingV3Output from './OutputNode'

const PROMPT_INPUT = {
  id: 'prompt',
  label: '提示词',
  accept: ['text'],
  multiple: true,
  role: 'prompt_text',
  canAcceptRoles: ['prompt_text'],
}

const VIDEO_OUT = { id: 'video-out', type: 'video', role: 'generated_video' }

const RES_PARAM = {
  key: 'resolution',
  label: '清晰度',
  icon: '🖥️',
  control: 'buttons',
  defaultValue: '720p',
  options: [
    { value: '720p', label: '720P' },
    { value: '1080p', label: '1080P' },
    { value: '4k', label: '4K' },
  ],
}

const DUR_PARAM = {
  key: 'duration',
  label: '时长',
  icon: '⏱️',
  control: 'buttons',
  defaultValue: 5,
  options: [
    { value: 5, label: '5s' },
    { value: 10, label: '10s' },
  ],
}

const AUDIO_PARAM = {
  key: 'generate_audio',
  label: '音频',
  icon: '🔊',
  control: 'switch',
  defaultValue: false,
}

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  displayIcon: Clapperboard,
  category: 'video-gen',
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: 'text-to-video',
  modes: {
    'text-to-video': {
      label: '文生视频',
      modelSeries: 'kling-v3',
      inputs: [PROMPT_INPUT],
      outputs: [VIDEO_OUT],
      api: { mode: 'async' },
      commonParams: [
        {
          key: 'aspect_ratio',
          label: '比例',
          icon: '📐',
          control: 'aspect-grid',
          defaultValue: '16:9',
          options: [
            { value: '16:9', label: '16:9', w: 16, h: 9 },
            { value: '9:16', label: '9:16', w: 9, h: 16 },
            { value: '1:1', label: '1:1', w: 1, h: 1 },
          ],
        },
        RES_PARAM,
        DUR_PARAM,
        AUDIO_PARAM,
      ],
    },
    'image-to-video': {
      label: '图生视频',
      modelSeries: 'kling-v3',
      inputs: [
        PROMPT_INPUT,
        {
          id: 'start_image',
          label: '起始图',
          accept: ['image'],
          role: 'first_frame_image',
          canAcceptRoles: ['first_frame_image', 'subject_image'],
        },
      ],
      outputs: [VIDEO_OUT],
      api: { mode: 'async' },
      commonParams: [RES_PARAM, DUR_PARAM, AUDIO_PARAM],
    },
    'first-last-frame': {
      label: '首尾帧',
      modelSeries: 'kling-v3',
      inputs: [
        PROMPT_INPUT,
        {
          id: 'start_image',
          label: '起始图',
          accept: ['image'],
          role: 'first_frame_image',
          canAcceptRoles: ['first_frame_image', 'subject_image'],
        },
        {
          id: 'end_image',
          label: '末帧',
          accept: ['image'],
          role: 'last_frame_image',
          canAcceptRoles: ['last_frame_image'],
        },
      ],
      outputs: [VIDEO_OUT],
      api: { mode: 'async' },
      commonParams: [RES_PARAM, DUR_PARAM, AUDIO_PARAM],
    },
    'motion-control': {
      label: '动作控制',
      modelSeries: 'kling-v3',
      inputs: [
        {
          id: 'character_image',
          label: '人物图',
          accept: ['image'],
          role: 'subject_image',
          canAcceptRoles: ['subject_image'],
        },
        {
          id: 'motion_video',
          label: '动作参考视频',
          accept: ['video'],
          role: 'reference_video',
          canAcceptRoles: ['reference_video'],
        },
        { ...PROMPT_INPUT, label: '补充描述' },
      ],
      outputs: [VIDEO_OUT],
      api: { mode: 'async' },
      commonParams: [
        {
          key: 'mode',
          label: '模式',
          icon: '⚙️',
          control: 'buttons',
          defaultValue: 'std',
          options: [
            { value: 'std', label: '标准' },
            { value: 'pro', label: '高质' },
          ],
        },
        {
          key: 'character_orientation',
          label: '朝向',
          icon: '🧭',
          control: 'buttons',
          defaultValue: 'image',
          options: [
            { value: 'image', label: '跟随人物图' },
            { value: 'video', label: '跟随视频' },
          ],
        },
        {
          key: 'keep_original_sound',
          label: '保留原声',
          icon: '🔊',
          control: 'buttons',
          defaultValue: 'yes',
          options: [
            { value: 'yes', label: '是' },
            { value: 'no', label: '否' },
          ],
        },
      ],
    },
  },

  dockedPanels: {
    'text-to-video':   () => import('./modes/TextToVideoDockedPanel'),
    'image-to-video':  () => import('./modes/ImageToVideoDockedPanel'),
    'first-last-frame': () => import('./modes/FirstLastFrameDockedPanel'),
    'motion-control':  () => import('./modes/MotionControlDockedPanel'),
  },

  cards: {
    'text-to-video':   () => import('./cards/TextToVideoCard.jsx'),
    'image-to-video':  () => import('./cards/ImageToVideoCard.jsx'),
    'first-last-frame': () => import('./cards/FirstLastFrameCard.jsx'),
    'motion-control':  () => import('./cards/MotionControlCard.jsx'),
  },

  outputNode: KlingV3Output,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildKlingV3RequestBody,
  resolveContent: resolveKlingV3Content,
  expandRuns: expandKlingV3Runs,

  pricing: {
    resolveModelId: ({ mode, modeParams }) => resolveKlingV3ModelId({ mode, modeParams }),
    computeUnits: (args, mode) => computeKlingV3Units({ mode, modeParams: args?.modeParams }),
  },

  resolveTargetAspect: ({ aspect_ratio } = {}) => {
    if (aspect_ratio === '9:16') return 9 / 16
    if (aspect_ratio === '1:1') return 1
    if (aspect_ratio === '16:9') return 16 / 9
    return null
  },
})
