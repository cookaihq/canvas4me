/**
 * Nano Banana —— capability 元数据
 * 元数据与行为字段分离，外部（能力总览页 / 文档生成）可通过 import.meta.glob
 * 一次性拿到展示信息，不触发 register.js 的副作用。
 */
export default {
  id: 'nano-banana',
  nodeType: 'image',
  label: 'Nano Banana',
  description: 'Gemini 图片生成：文生图 + 多图参考/编辑，两档模型可选。',
}
