/**
 * Sync 口型同步 子能力注册 —— 单 mode(sync-video)。
 * 折叠形态;category 'talking-head'(数字人)。
 * 端口: in video(source_video,必填) + audio(driver_audio,必填);out video-out(generated_video)。
 * 上游: model sync-3 / lipsync-2 / lipsync-2-pro;sync_mode loop/bounce/cut_off/silence/remap。
 * temperature / active_speaker 当前不暴露(仅 lipsync-2/pro 支持,sync-3 不支持)。
 */
import meta from './meta'
import PlaceholderIcon from '@/canvas/assets/icons/PlaceholderIcon.svg'
import { Film } from '@/canvas/icons'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { getAudioDuration, getVideoDuration } from '@/canvas/utils/mediaMetadata'
import { buildSyncRequestBody } from './builder'
import { resolveSyncContent } from './resolveContent'
import OutputNode from './OutputNode.jsx'

const SYNC_MODELS = ['sync-3', 'lipsync-2', 'lipsync-2-pro']
const SYNC_MODES = ['loop', 'bounce', 'cut_off', 'silence', 'remap']
const SYNC_MODE_LABELS = {
  loop: 'Loop (循环)', bounce: 'Bounce (来回)', cut_off: 'Cut off (截断)',
  silence: 'Silence (静音填充)', remap: 'Remap (重映射)',
}
// 等宽 segment 用的紧凑标签(避免 5 选项挤不下完整双语 label)
const SYNC_MODE_SHORT = {
  loop: 'Loop', bounce: 'Bounce', cut_off: 'Cut off', silence: 'Silence', remap: 'Remap',
}

registerCapability({
  ...meta,
  icon: PlaceholderIcon,
  category: 'talking-head',
  displayIcon: Film,
  form: 'folded',
  productType: 'video',
  foldedOrientation: 'landscape',
  hideModeBadgeInHeader: true,

  defaultMode: 'sync-video',
  modes: {
    'sync-video': {
      label: '同步视频',
      modelSeries: 'sync',
      inputs: [
        { id: 'video', label: '源视频', accept: ['video'], required: true, role: 'source_video', canAcceptRoles: ['source_video'] },
        { id: 'audio', label: '驱动音频', accept: ['audio'], required: true, role: 'driver_audio', canAcceptRoles: ['driver_audio'] },
      ],
      outputs: [{ id: 'video-out', type: 'video', role: 'generated_video' }],
      api: { mode: 'async' },
      commonParams: [
        {
          key: 'sync_mode', label: '同步模式', icon: '🔄', control: 'buttons',
          defaultValue: 'loop',
          options: SYNC_MODES.map(v => ({ value: v, label: SYNC_MODE_LABELS[v], shortLabel: SYNC_MODE_SHORT[v] })),
        },
        {
          key: 'model', label: '模型', icon: '🤖', control: 'buttons',
          defaultValue: 'sync-3',
          options: SYNC_MODELS.map(v => ({ value: v, label: v, shortLabel: v })),
        },
      ],
    },
  },

  dockedPanels: { 'sync-video': () => import('./modes/SyncVideoDockedPanel') },
  cards: { 'sync-video': () => import('./cards/SyncCard.jsx') },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildSyncRequestBody,
  resolveContent: resolveSyncContent,

  pricing: {
    resolveModelId({ modeParams }) {
      return SYNC_MODELS.includes(modeParams?.model) ? modeParams.model : 'sync-3'
    },
    async computeUnits({ modeParams, collectedInputs }) {
      try {
        const syncMode = modeParams?.sync_mode || 'loop'
        const audioUrl = pickUrl(collectedInputs?.audio)
        const videoUrl = pickUrl(collectedInputs?.video)
        if (syncMode === 'silence') return videoUrl ? await getVideoDuration(videoUrl) : null
        if (syncMode === 'cut_off') {
          if (!audioUrl || !videoUrl) return null
          const [a, v] = await Promise.all([
            getAudioDuration(audioUrl).catch(() => null),
            getVideoDuration(videoUrl).catch(() => null),
          ])
          if (a == null && v == null) return null
          if (a == null) return v
          if (v == null) return a
          return Math.min(a, v)
        }
        return audioUrl ? await getAudioDuration(audioUrl) : null
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
