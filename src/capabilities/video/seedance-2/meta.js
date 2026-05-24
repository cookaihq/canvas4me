/**
 * Seedance 2.0 —— capability 元数据
 *
 * 元数据 (id / nodeType / label / description) 与行为字段分离,
 * 外部 (能力总览页 / 文档生成) 可通过 import.meta.glob 一次性拿到所有 capability
 * 的展示信息, 不触发 register.js 的副作用 (副作用 = registerCapability 注入全局表).
 */
export default {
  id: 'seedance-2',
  nodeType: 'video',
  label: "Seedance 2.0",
  description: "字节视频生成：文生视频 / 图生视频 / 首尾帧 / 全能参考，标准与 Fast 两档。",
}
