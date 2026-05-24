/**
 * MiniMax Speech —— capability 元数据
 *
 * 元数据 (id / nodeType / label / description) 与行为字段分离,
 * 外部 (能力总览页 / 文档生成) 可通过 import.meta.glob 一次性拿到所有 capability
 * 的展示信息, 不触发 register.js 的副作用 (副作用 = registerCapability 注入全局表).
 */
export default {
  id: 'minimax-speech',
  nodeType: 'sound',
  label: 'MiniMax Speech',
  description: '文本转语音 (TTS), 多语言多音色, 支持情绪/语速/变声等高级参数.',
}
