/**
 * MiniMax Music(文生音乐)子能力注册
 *
 * 形态: form 'folded' + productType 'audio'(节点本体=音频产物, 固定 348×146)。
 * 单 mode 'generate-music'(动作语义命名; v2.6/v2.5 是面板 model 字段, 不是 mode)。
 *
 * 端口 role(跨能力切换按 role 迁连线):
 *   - prompt : prompt_text
 *   - lyrics : lyrics_text(开放 prompt_text / generated_text fallback —— 主工作流是 LLM 写词→连入)
 *   - 输出 audio-out : generated_audio
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildMinimaxMusicRequestBody } from './builder'
import { resolveMinimaxMusicContent } from './resolveContent'
import { DEFAULT_MODEL } from './_shared/constants'
// outputNode 必须 eager: React Flow 直接当组件渲染, 不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

registerCapability({
  ...meta,
  category: 'music-gen',  // 能力选择器分组标题(纯展示, 不进节点 data)
  form: 'folded',
  productType: 'audio',
  // audio 无 aspect 联动, 不实现 resolveTargetAspect, 节点固定 348×146。

  defaultMode: 'generate-music',
  modes: {
    'generate-music': {
      label: '生成音乐',
      inputs: [
        { id: 'prompt', label: '音乐描述', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        { id: 'lyrics', label: '歌词', accept: ['text'], multiple: true, role: 'lyrics_text', canAcceptRoles: ['lyrics_text', 'prompt_text', 'generated_text'] },
      ],
      outputs: [{ id: 'audio-out', type: 'audio', role: 'generated_audio' }],
      api: { mode: 'async' },
      commonParams: [
        { key: 'model', defaultValue: DEFAULT_MODEL },
      ],
    },
  },

  dockedPanels: {
    'generate-music': () => import('./modes/MinimaxMusicDockedPanel'),
  },

  cards: {
    'generate-music': () => import('./cards/MinimaxMusicCard.jsx'),
  },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildMinimaxMusicRequestBody,
  resolveContent: resolveMinimaxMusicContent,

  pricing: {
    resolveModelId({ modeParams }) {
      return modeParams?.model || DEFAULT_MODEL
    },
  },

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
