/**
 * MiniMax Speech (TTS) 子能力注册 —— 见 docs/capabilities/sound/minimax-speech.md
 *
 * 形态:
 *   - form 'folded': 节点本体 = 音频产物 (固定 348×146)
 *   - productType 'audio': 项目内首个 folded audio capability
 *
 * 双 mode (按工作流切分):
 *   - quick (默认): 单段 ×M 倍数派生
 *   - batch:        N 段切分 × M 互乘派生 (N×M 个折叠能力节点)
 *
 * mode 不影响上游 model. model 由面板 modeParams.<mode>.model 字段决定
 * (speech-2.8-hd / speech-2.8-turbo); builder 在请求体里写入 body.model.
 *
 * 端口跨 mode 共享:
 *   - prompt (text 输入): 两 mode 共用 (id/accept/multiple 完全一致, 切 mode 保留连线)
 *   - audio (输出):       两 mode 共用
 *
 * 端口 role 映射 (跨能力切换按 role 迁连线, 见 docs/reference/port-role-convention.md):
 *   - prompt          : prompt_text (两 mode 共用)
 *   - 输出 audio-out  : generated_audio
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildMinimaxSpeechRequestBody } from './builder'
import { resolveMinimaxSpeechContent } from './resolveContent'
import { expandMinimaxSpeechRuns } from './expandRuns'
import {
  DEFAULT_MODEL,
  DEFAULT_VOICE_ID,
  DEFAULT_LANGUAGE,
  DEFAULT_SPEED,
  DEFAULT_FORMAT,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_BITRATE,
  DEFAULT_CHANNEL,
  DEFAULT_SEPARATOR,
  EMOTION_AUTO,
  VOICE_MODIFY_DEFAULT,
  PRONUNCIATION_DICT_DEFAULT,
} from './voice-presets'
// outputNode 必须 eager: React Flow 直接当组件渲染, 不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

// 两个 mode 共享同一组面板默认值. UI 实际的 popover / advanced 形态控件由 DockedPanel
// 自己渲染; commonParams 这里只声明那些参与 chip / 短摘要展示的字段, 默认值通过
// extractModeDefaults 写入 modeParams (defaultValue = source of truth).
function buildCommonParams() {
  return [
    // model 是 capability 私有字段, 不在 chip 摘要显示, 但用 commonParams 注入默认值,
    // 让 extractModeDefaults 能写到 modeParams.<mode>.model.
    { key: 'model',          defaultValue: DEFAULT_MODEL },
    { key: 'voice_id',       defaultValue: DEFAULT_VOICE_ID },
    { key: 'language_boost', defaultValue: DEFAULT_LANGUAGE },
    { key: 'emotion',        defaultValue: EMOTION_AUTO },
    { key: 'speed',          defaultValue: DEFAULT_SPEED },
    { key: 'english_normalization', defaultValue: false },
    { key: 'format',         defaultValue: DEFAULT_FORMAT },
    { key: 'sample_rate',    defaultValue: DEFAULT_SAMPLE_RATE },
    { key: 'bitrate',        defaultValue: DEFAULT_BITRATE },
    { key: 'channel',        defaultValue: DEFAULT_CHANNEL },
    { key: 'voice_modify',         defaultValue: { ...VOICE_MODIFY_DEFAULT } },
    { key: 'pronunciation_dict',   defaultValue: { tone_list: [] } },
  ]
}

registerCapability({
  ...meta,
  category: 'speech-synthesis',  // 能力选择器分组标题（纯展示，不进节点 data）
  form: 'folded',
  productType: 'audio',
  // audio 类型无 aspect 联动. effectiveAspect 始终 null, 节点固定 348×146.
  // 不实现 resolveTargetAspect (folded 规范 §3.3 对 audio 不适用).
  hideModeBadgeInHeader: true,  // sub-cap tabs 由 DockedPanel 自己渲染 (快速生成/批量生成)

  defaultMode: 'quick',
  modes: {
    quick: {
      label: '快速生成',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
      ],
      outputs: [{ id: 'audio-out', type: 'audio', role: 'generated_audio' }],
      api: { mode: 'async' },
      commonParams: [
        ...buildCommonParams(),
      ],
    },
    batch: {
      label: '批量生成',
      inputs: [
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
      ],
      outputs: [{ id: 'audio-out', type: 'audio', role: 'generated_audio' }],
      api: { mode: 'async' },
      commonParams: [
        ...buildCommonParams(),
        { key: 'separator', defaultValue: DEFAULT_SEPARATOR },
      ],
    },
  },

  dockedPanels: {
    quick: () => import('./modes/MinimaxSpeechDockedPanel'),
    batch: () => import('./modes/MinimaxSpeechDockedPanel'),
  },

  cards: {
    quick: () => import('./cards/QuickCard.jsx'),
    batch: () => import('./cards/BatchCard.jsx'),
  },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildMinimaxSpeechRequestBody,
  resolveContent: resolveMinimaxSpeechContent,
  expandRuns: expandMinimaxSpeechRuns,

  // 积分预估: model_id = body.model (speech-2.8-hd / speech-2.8-turbo)
  // computeUnits: 暂未启用 (TTS 计费按字符数, 后端定价表当前按 model 计 1 单位/次)
  pricing: {
    resolveModelId({ modeParams }) {
      return modeParams?.model || DEFAULT_MODEL
    },
  },

  // Failed 卡片摘要: 后端 {code, message, data} 包装 + 上游平铺响应
  // (常见上游错: unsupported_advanced_options, channel disabled 等)
  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    return (
      rawError?.message
      || rawError?.data?.error
      || rawError?.error?.message
      || (typeof rawError?.error === 'string' ? rawError.error : '')
      || ''
    )
  },
})

// 引用一下避免 lint 警告 (上面占位字段当前未直接用, 留给后续展开)
void PRONUNCIATION_DICT_DEFAULT
