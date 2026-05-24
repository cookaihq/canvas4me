/**
 * 端口连线 → 媒体卡核心 item（不含已格式化 meta，meta 由 hook 计算）。
 * 规则：找连到该端口的源节点；源节点既无 url 又非上传中 → 视为无（null）。
 * 预览源取自上游：图片用 url || localPreviewUrl；音频无视觉预览（thumb 留空）。
 * 元信息（宽/高/大小/时长）取自上游节点渲染时回写的 `_media*` 派生字段。
 */
export function deriveMediaItem({ node, edges, nodes, portId, subType }) {
  const edge = edges.find((e) => e.target === node.id && e.targetHandle === portId)
  if (!edge) return null
  const src = nodes.find((n) => n.id === edge.source)
  if (!src) return null
  const data = src.data || {}
  const content = data.content || {}
  const uploading = !!content.uploading
  const url = content.url || null
  if (!url && !uploading) return null
  const preview = url || content.localPreviewUrl || null
  return {
    id: edge.id,
    type: subType,
    thumb: (subType === 'image' || subType === 'video') ? (preview || undefined) : undefined,
    name: data.name || content.fileName || '',
    uploading,
    url,
    edgeId: edge.id,
    sourceNodeId: src.id,
    width: data._mediaWidth ?? null,
    height: data._mediaHeight ?? null,
    fileSize: data._mediaFileSize ?? null,
    duration: data._mediaDuration ?? null,
  }
}
