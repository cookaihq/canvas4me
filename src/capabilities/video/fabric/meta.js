/**
 * Fabric 数字人 —— capability 元数据
 * 元数据与行为字段分离,外部可通过 import.meta.glob 拿展示信息而不触发 register 副作用。
 */
export default {
  id: 'fabric',
  nodeType: 'video',
  label: 'Fabric 数字人',
  description: '人物图 + 驱动音频,生成口型同步说话视频。',
}
