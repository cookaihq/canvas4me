// src/capabilities/tool/capcut-draft/register.js
import meta from './meta'
import { registerCapability } from '@/canvas/registry/nodeTypes'

registerCapability({
  ...meta,
  // form 'folded':节点选中后下方吸附 DockedPanel,容纳「编辑时间线」按钮。
  // 折叠形态的节点本体由 cards.{mode} 渲染 (CapabilityNode 走 CAPABILITY_CARDS),
  // 不挂 view 字段 — 那是 CapabilityPanel 的入口, 折叠节点选中时不显示 CapabilityPanel。
  form: 'folded',
  // capcut-draft 不走标准 useRunCapability:不创建 output 节点(outputs=[])、
  // api=null 让标准运行按钮禁用。真正的提交入口在 DockedPanel 的「编辑时间线」按钮
  // → 模态框 → 「生成草稿」按钮,直接调能力自带 runtime,不触发 onRun。
  defaultMode: 'default',
  modes: {
    default: {
      label: '默认',
      inputs: [{
        id: 'materials',
        label: '素材',
        accept: ['image', 'video', 'audio', 'text'],
        multiple: true,
        maxInputs: 20, // 超过 20 由 adapter 截断，溢出由角标提示
        role: 'capcut_material',
        canAcceptRoles: ['capcut_material', 'generated_image', 'generated_video', 'generated_audio', 'prompt_text'],
      }],
      outputs: [],  // 无下游输出节点
      api: null,    // 禁用标准运行按钮
    },
  },
  cards: {
    default: () => import('./cards/CapcutDraftCard.jsx'),
  },
  dockedPanels: { default: () => import('./DockedPanel.jsx') },
})
