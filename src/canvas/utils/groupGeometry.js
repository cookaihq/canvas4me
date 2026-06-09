// 分组几何纯函数。无副作用、不碰 store——只读节点几何、算坐标。可单测。
export function getNodeRect(node) {
  const w = node.measured?.width ?? toNum(node.width) ?? toNum(node.style?.width) ?? 0
  const h = node.measured?.height ?? toNum(node.height) ?? toNum(node.style?.height) ?? 0
  return { x: node.position.x, y: node.position.y, width: w, height: h }
}

function toNum(v) {
  if (typeof v === 'number') return v
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

export function getBoundingBox(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    const r = getNodeRect(n)
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function computeGroupBox(nodes, padding) {
  const b = getBoundingBox(nodes)
  return { x: b.x - padding, y: b.y - padding, width: b.width + 2 * padding, height: b.height + 2 * padding }
}

export function toRelative(pos, origin) { return { x: pos.x - origin.x, y: pos.y - origin.y } }
export function toAbsolute(pos, origin) { return { x: pos.x + origin.x, y: pos.y + origin.y } }

export function isPointInRect(p, rect) {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
