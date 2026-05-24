/**
 * GPT Image 2 —— capability 元数据
 *
 * 元数据 (id / nodeType / label / description) 与行为字段分离,
 * 外部 (能力总览页 / 文档生成) 可通过 import.meta.glob 一次性拿到所有 capability
 * 的展示信息, 不触发 register.js 的副作用 (副作用 = registerCapability 注入全局表).
 */
export default {
  id: 'gpt-image-2',
  nodeType: 'image',
  label: "GPT Image 2",
  description: "通用图像生成与编辑：支持文生图、参考图融合、局部蒙版重绘。",
}
