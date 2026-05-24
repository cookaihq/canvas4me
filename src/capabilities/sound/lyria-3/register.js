/**
 * Lyria 3（Google 文生音乐）子能力注册
 *
 * 形态: form 'folded' + productType 'audio'（节点本体=音频产物，固定 348×146）。
 * 单 mode 'generate-music'（动作语义命名；clip/pro 是面板 model 字段，不是 mode）。
 *
 * 端口 role（跨能力切换按 role 迁连线）:
 *   - prompt : prompt_text
 *   - images : reference_image（开放 generated_image / subject_image fallback）
 *   - 输出 audio-out : generated_audio
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildLyria3RequestBody } from './builder'
import { resolveLyria3Content } from './resolveContent'
import { DEFAULT_MODEL, MAX_MOODBOARD_IMAGES } from './_shared/constants'
// outputNode 必须 eager: React Flow 直接当组件渲染，不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

registerCapability({
  ...meta,
  category: 'music-gen',  // 能力选择器分组标题（纯展示，不进节点 data）
  form: 'folded',
  productType: 'audio',
  // audio 无 aspect 联动，不实现 resolveTargetAspect，节点固定 348×146。

  defaultMode: 'generate-music',
  modes: {
    'generate-music': {
      label: '生成音乐',
      inputs: [
        { id: 'prompt', label: '音乐描述', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        { id: 'images', label: '情绪板', accept: ['image'], multiple: true, maxInputs: MAX_MOODBOARD_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image', 'generated_image', 'subject_image'] },
      ],
      outputs: [{ id: 'audio-out', type: 'audio', role: 'generated_audio' }],
      api: { mode: 'async' },
      // model 是折叠常用参数（底栏 chip + ModelParamSelector popover），
      // 默认值通过 commonParams 注入 modeParams.model；选项在 DockedPanel 传 extraOptions.model.options。
      commonParams: [
        { key: 'model', defaultValue: DEFAULT_MODEL },
      ],
    },
  },

  dockedPanels: {
    'generate-music': () => import('./modes/Lyria3DockedPanel'),
  },

  cards: {
    'generate-music': () => import('./cards/Lyria3Card.jsx'),
  },

  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),

  build: buildLyria3RequestBody,
  resolveContent: resolveLyria3Content,
  // 单 mode 简单 ×N，缺省 expandRuns（运行时退化为 runCount 次相同迭代）。

  // 积分预估: model_id = body.model（lyria-3 / lyria-3-pro）
  pricing: {
    resolveModelId({ modeParams }) {
      return modeParams?.model || DEFAULT_MODEL
    },
  },

  // Failed 卡片摘要: 后端 {code,message,data} 包装 + 上游平铺响应
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
