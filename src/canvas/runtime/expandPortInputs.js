/**
 * 给 capability view 用：把"连到某端口的所有 edges"展开为统一的 input item 列表。
 *
 * @param {string} targetNodeId  下游能力节点 id
 * @param {string} targetHandle  端口 id（如 'image'）
 * @param {Array}  edges
 * @param {Array}  nodes
 * @returns {Array<{ url, source, edgeId, sourceNodeId, name, uploading, type?, fileSize?, mimeType? }>}
 */
export function expandPortInputs({ targetNodeId, targetHandle, edges, nodes }) {
  const matchedEdges = edges.filter(e => e.target === targetNodeId && e.targetHandle === targetHandle)
  const items = []

  for (const edge of matchedEdges) {
    const src = nodes.find(n => n.id === edge.source)
    if (!src) continue

    const url = src.data?.content?.url
    const uploading = !!src.data?.content?.uploading
    if (!url && !uploading) continue
    items.push({
      url: url || null,
      source: 'edge',
      edgeId: edge.id,
      sourceNodeId: src.id,
      name: src.data?.name || src.data?.label || '',
      type: src.data?.subType,
      fileSize: src.data?.content?.fileSize ?? src.data?._mediaFileSize ?? null,
      mimeType: src.data?.content?.mimeType ?? null,
      uploading,
    })
  }

  return items
}
