/**
 * GPT Image 2 子能力注册
 *
 * 上线 mode:
 *   - gpt-image-2        (完整版: 11 档预设 + 自定义分辨率 + quality/output_format/background)
 *   - gpt-image-2-limit  (精简版: 仅 3 档预设)
 *
 * 见 docs/capabilities/image/gpt-image-2.md
 */
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'
import { buildGptImage2RequestBody, MAX_REFERENCE_IMAGES } from './builder'
import { resolveGptImage2Content } from './resolveContent'
import { expandGptImage2Runs } from './expandRuns'
import { ASPECT_RATIOS, CLARITIES, isCombinationValid } from './_shared/resolutionMath'
// outputNode 必须 eager：React Flow 直接当组件渲染，不走 Suspense/lazy
import OutputNode from './OutputNode.jsx'

registerCapability({
  ...meta,
  // 折叠形态(form 'folded'): 能力节点本体携带产物, 下游 outputNode 不渲染.
  // productType: 节点尺寸按图片档位 (348×465 初始, Done 态高度按产物宽高比自适应).
  // dockedPanels: 选中时下方吸附的紧凑参数面板, 每个 mode 一份独立文件 (允许冗余, 保持隔离).
  // 详见 docs/archive/design.md §3.3 生成即锁定 / §3.6 DockedPanel 规范(文档已归档,以 docs/reference/ux-spec.md §9 为准)
  form: 'folded',
  productType: 'image',
  dockedPanels: {
    'gpt-image-2':       () => import('./modes/GptImage2DockedPanel'),
    'gpt-image-2-limit': () => import('./modes/GptImage2LimitDockedPanel'),
  },
  defaultMode: 'gpt-image-2',
  modes: {
    'gpt-image-2': {
      label: '完整版',
      inputs: [
        // multiple: true → 允许多个文本节点连入(每个内嵌为 placeholder + chip),
        // 与面板手输内容共存,不再走旧的 face-off 互斥分支
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        { id: 'image', label: '参考图', accept: ['image'], multiple: true, maxInputs: MAX_REFERENCE_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image'] },
        { id: 'mask', label: '蒙版', accept: ['image'], role: 'mask_image', canAcceptRoles: ['mask_image'] },
      ],
      outputs: [{ id: 'image-out', type: 'image', role: 'generated_image' }],
      api: { mode: 'async' },
      // 详见 docs/reference/ux-spec.md §9.6 — 常用参数进底栏 chip + Popover,
      // 其余参数(output_format / background / seed / mask_url)进齿轮高级区。
      // 参数模型: aspect_ratio + clarity → builder 合成 {width,height} 写入 body.resolution。
      // 联动 disabled: 部分组合算出尺寸不在后端允许范围(总像素 / 边长上限), popover 按 computeDisabled 灰掉。
      commonParams: [
        {
          key: 'quality',
          label: '画质',
          control: 'buttons',
          optionsLayout: 'row',
          defaultValue: 'high',
          options: [
            { value: 'low',    label: '低画质', shortLabel: 'Low' },
            { value: 'medium', label: '标准画质', shortLabel: 'Med' },
            { value: 'high',   label: '高画质', shortLabel: 'High' },
          ],
        },
        {
          key: 'clarity',
          label: '清晰度',
          control: 'buttons',
          optionsLayout: 'row',
          defaultValue: '2K',
          options: CLARITIES.map(c => ({ value: c.value, label: c.value })),
          computeDisabled: (optValue, params) => {
            const ratio = params?.aspect_ratio || '3:4'
            const ok = isCombinationValid(ratio, optValue)
            return { disabled: !ok, reason: ok ? null : '该清晰度与当前比例组合超出像素/边长约束' }
          },
        },
        {
          key: 'aspect_ratio',
          label: '比例',
          control: 'aspect-grid',
          defaultValue: '3:4',
          options: ASPECT_RATIOS.map(r => ({ value: r.value, label: r.value, w: r.w, h: r.h })),
          computeDisabled: (optValue, params) => {
            const clarity = params?.clarity || '2K'
            const ok = isCombinationValid(optValue, clarity)
            return { disabled: !ok, reason: ok ? null : '该比例与当前清晰度组合超出像素/边长约束' }
          },
        },
        {
          key: 'num_outputs',
          label: '张数',
          control: 'stepper',
          defaultValue: 1,
          min: 1,
          max: 10,
          shortFormat: (v) => `${v ?? 1}张`,
        },
      ],
    },
    'gpt-image-2-limit': {
      label: '精简版',
      inputs: [
        // multiple: true → 允许多个文本节点连入(每个内嵌为 placeholder + chip),
        // 与面板手输内容共存,不再走旧的 face-off 互斥分支
        { id: 'prompt', label: '提示词', accept: ['text'], multiple: true, required: true, role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        { id: 'image', label: '参考图', accept: ['image'], multiple: true, maxInputs: MAX_REFERENCE_IMAGES, role: 'reference_image', canAcceptRoles: ['reference_image'] },
      ],
      outputs: [{ id: 'image-out', type: 'image', role: 'generated_image' }],
      api: { mode: 'async' },
      // 精简版后端只接 3 档 resolution 字符串 (1024x1024 / 1024x1536 / 1536x1024),
      // 不支持 quality / num_outputs / mask / output_format / background, 故 commonParams 只留 1 项。
      commonParams: [
        {
          key: 'resolution',
          label: '比例',
          control: 'buttons',
          defaultValue: '1024x1024',
          options: [
            { value: '1024x1024', label: '1:1', shortLabel: '1:1' },
            { value: '1536x1024', label: '3:2', shortLabel: '3:2' },
            { value: '1024x1536', label: '2:3', shortLabel: '2:3' },
          ],
        },
      ],
    },
  },
  view: () => import('./view.jsx'),
  outputNode: OutputNode,
  outputPanel: () => import('./OutputPanel.jsx'),
  cards: {
    'gpt-image-2':       () => import('./cards/GptImage2Card.jsx'),
    'gpt-image-2-limit': () => import('./cards/GptImage2LimitCard.jsx'),
  },
  build: buildGptImage2RequestBody,
  resolveContent: resolveGptImage2Content,
  expandRuns: expandGptImage2Runs,
  // Failed 卡片摘要: GPT Image 2 上游(OpenAI / foxapi 包装)常见错误体
  //   - { error: { message, code, type } }   → 取 message
  //   - { message }                          → 取 message
  //   - string                               → 直接返回(由公共 helper 截断)
  // 公共 helper getCapabilityErrorSummary 会负责 ≤80 字截断,这里只关心抽哪一段
  formatError(rawError) {
    if (rawError == null) return ''
    if (typeof rawError === 'string') return rawError
    const message = rawError?.error?.message
      || rawError?.message
      || (typeof rawError?.error === 'string' ? rawError.error : null)
    return message || ''
  },
  // 折叠节点尺寸联动: 完整版从 modeParams.aspect_ratio ('W:H') 反算目标 aspect;
  // 精简版从 modeParams.resolution ('WIDTHxHEIGHT') 反算 (后端只接 3 档预设).
  // 详见 docs/archive/folded-node-spec.md §3.3.
  resolveTargetAspect: ({ aspect_ratio, resolution } = {}) => {
    if (typeof aspect_ratio === 'string') {
      const m = aspect_ratio.match(/^(\d+)\s*:\s*(\d+)$/)
      if (m) {
        const w = Number(m[1])
        const h = Number(m[2])
        if (w > 0 && h > 0) return w / h
      }
    }
    if (typeof resolution === 'string') {
      const m = resolution.match(/^(\d+)\s*[x×]\s*(\d+)$/i)
      if (m) {
        const w = Number(m[1])
        const h = Number(m[2])
        if (w > 0 && h > 0) return w / h
      }
    }
    return null
  },
})
