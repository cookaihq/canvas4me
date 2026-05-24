/**
 * Nano Banana 子能力注册（单 mode generate-image；两档模型由折叠参数 model 选）
 * 见 docs/prototype/capabilities/image/20260523-nano-banana/index.html
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildNanoBananaRequestBody, MAX_REFERENCE_IMAGES } from './builder'
import { resolveNanoBananaContent } from './resolveContent'
import { MODEL_FLASH, MODEL_PRO } from './constants'
// outputNode 必须 eager：React Flow 直接当组件渲染，不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

// 带 w/h 供 aspect-grid 控件画长宽示意小图标;match_input_image 无固定比例(画 dashed 占位)
const ASPECT_OPTIONS = [
  '1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','21:9',
  '1:4','4:1','1:8','8:1','match_input_image',
].map(v => {
  if (v === 'match_input_image') return { value: v, label: '匹配输入图' }
  const [w, h] = v.split(':').map(Number)
  return { value: v, label: v, w, h }
})

// 0.5K 即 512px(上游同分辨率两个标签),只保留 0.5K 去冗余,且与服务端 schema 一致
const RESOLUTION_OPTIONS = ['0.5K','1K','2K','4K'].map(v => ({ value: v, label: v }))

const PRO_BLOCKED_ASPECT = ['1:4','4:1','1:8','8:1']
const PRO_BLOCKED_RES = ['0.5K']

registerCapability({
  ...meta,
  form: 'folded',
  productType: 'image',
  dockedPanels: {
    'generate-image': () => import('./modes/NanoBananaDockedPanel'),
  },
  defaultMode: 'generate-image',
  modes: {
    'generate-image': {
      label: '生成图片',
      inputs: [
        // multiple: true → 多文本节点连入内嵌为 chip，与面板手输共存
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        // 参考图：空 = 文生图；有 = 图生图/编辑。开放 subject/source fallback（PortRoleConvention §3.2）
        { id: 'image', label: '参考图', accept: ['image'], multiple: true, maxInputs: MAX_REFERENCE_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image', 'subject_image', 'source_image'] },
      ],
      outputs: [{ id: 'image-out', type: 'image', role: 'generated_image' }],
      api: { mode: 'async' },
      // 折叠常用参数：model + 比例 + 分辨率 —— 全部进同一个 ParamChip 合并 popover。
      // 关键：不要给 model 传 extraOptions.model，否则 DockedBottomBar 会把它拆成独立 ModelParamSelector chip。
      commonParams: [
        {
          key: 'model',
          label: '模型',
          control: 'buttons',
          optionsLayout: 'row',
          defaultValue: MODEL_FLASH,
          options: [
            { value: MODEL_FLASH, label: 'Nano Banana 2', shortLabel: 'Nano Banana 2' },
            { value: MODEL_PRO,   label: 'Nano Banana Pro', shortLabel: 'Nano Banana Pro' },
          ],
          shortFormat: (v) => (v === MODEL_PRO ? 'Nano Banana Pro' : 'Nano Banana 2'),
        },
        {
          key: 'aspect_ratio',
          label: '比例',
          control: 'aspect-grid',  // 每格带长宽示意小图标
          gridCols: 3,             // 一行三个
          cellLayout: 'horizontal', // 图标在比例文字左侧
          defaultValue: '1:1',
          options: ASPECT_OPTIONS,
          computeDisabled: (optValue, params) => {
            const blocked = params?.model === MODEL_PRO && PRO_BLOCKED_ASPECT.includes(optValue)
            return { disabled: blocked, reason: blocked ? 'Pro 不支持该比例' : null }
          },
        },
        {
          key: 'resolution',
          label: '分辨率',
          control: 'buttons',
          optionsLayout: 'row',
          defaultValue: '1K',
          options: RESOLUTION_OPTIONS,
          computeDisabled: (optValue, params) => {
            const blocked = params?.model === MODEL_PRO && PRO_BLOCKED_RES.includes(optValue)
            return { disabled: blocked, reason: blocked ? 'Pro 不支持该分辨率' : null }
          },
        },
      ],
    },
  },
  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),
  cards: {
    'generate-image': () => import('./cards/NanoBananaCard.jsx'),
  },
  build: buildNanoBananaRequestBody,
  resolveContent: resolveNanoBananaContent,
  // Failed 卡片摘要：foxapi / 包装错误体常见 { error: { message } } / { message } / string
  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    return rawError?.error?.message || rawError?.message
      || (typeof rawError?.error === 'string' ? rawError.error : '') || ''
  },
  // 折叠节点尺寸联动：从 modeParams.aspect_ratio ('W:H') 反算目标 aspect；match_input_image → null（用默认）
  resolveTargetAspect: ({ aspect_ratio } = {}) => {
    if (typeof aspect_ratio !== 'string') return null
    const m = aspect_ratio.match(/^(\d+)\s*:\s*(\d+)$/)
    if (!m) return null
    const w = Number(m[1]); const h = Number(m[2])
    return w > 0 && h > 0 ? w / h : null
  },
})
