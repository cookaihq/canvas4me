/**
 * LLM 生成 —— capability 元数据
 *
 * 元数据 (id / nodeType / label / description) 与行为字段分离,
 * 外部 (能力总览页 / 文档生成) 可通过 import.meta.glob 一次性拿到所有 capability
 * 的展示信息, 不触发 register.js 的副作用 (副作用 = registerCapability 注入全局表).
 */
export default {
  id: 'llm',
  nodeType: 'llm',
  label: "LLM 生成",
  description: "大语言模型生成节点，支持文本 / 视觉 / 音频 / 视频 / 混合五种 mode。",
}
