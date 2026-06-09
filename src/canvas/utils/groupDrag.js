import { getNodeRect, computeGroupBox, isPointInRect, rectsIntersect } from './groupGeometry.js'

/** 节点中心落入哪个组矩形（用于 drop-target 与 adopt）。groups 取绝对矩形。 */
export function findDropTargetGroup(nodeRect, groups) {
  const center = { x: nodeRect.x + nodeRect.width / 2, y: nodeRect.y + nodeRect.height / 2 }
  for (const g of groups) {
    if (isPointInRect(center, getNodeRect(g))) return g.id
  }
  return null
}

/**
 * 松手时处理拖动引起的进出组 + 受影响组几何重算（recompute-on-dragStop, spec §9.7）。纯函数。
 * - 成员被拖：与所属组（含 padding 扩展区）完全不相交 → detach（清 parentId、转绝对）；仍相交 → 留组。
 * - 自由节点被拖：中心落入某组 → adopt（设 parentId）。group 自身被拖：不入组（不嵌套）。
 * - 每个受影响组：按其当前成员的绝对坐标重算 box+padding，写新几何 + 成员新相对坐标。空组保留（不重算几何）。
 * - 输出把 group 排在非 group 前（父在子前, spec §9.4）。
 */
export function applyDragToGroups(prevNodes, draggedIdSet, padding) {
  const groups = prevNodes.filter(n => n.type === 'group')
  if (groups.length === 0) return prevNodes
  const groupById = new Map(groups.map(g => [g.id, g]))

  // membership: 非 group 节点 → 当前所属 groupId | null
  const membership = new Map()
  for (const n of prevNodes) {
    if (n.type === 'group') continue
    membership.set(n.id, (n.parentId && groupById.has(n.parentId)) ? n.parentId : null)
  }

  // 绝对坐标快照（用 prev 组原点；成员 relative+origin，自由节点即 position）
  const absById = new Map()
  const sizeById = new Map()
  for (const n of prevNodes) {
    if (n.type === 'group') continue
    const gid = membership.get(n.id)
    const origin = gid ? groupById.get(gid).position : { x: 0, y: 0 }
    absById.set(n.id, { x: n.position.x + origin.x, y: n.position.y + origin.y })
    const r = getNodeRect(n)
    sizeById.set(n.id, { width: r.width, height: r.height })
  }

  // 获取组矩形（绝对坐标）以及其含 padding 扩展的矩形。
  // ⚠️ detach 判定刻意用 padded 矩形（组框再外扩一个 padding）而非 bare 组框 —— 这是 spec §3.2 的迟滞(hysteresis)：
  // 成员只超出可见组框一点点(< padding)仍算"留组"，须移出框外满一个 padding 才脱离，避免边界附近反复进出抖动。
  // 不要"修正"成 bare groupRect —— 那会让成员擦边就脱离（对应单测 stay+expand 即验证超出框 2px 仍 stay）。
  const groupRect = new Map(groups.map(g => [g.id, getNodeRect(g)]))
  const groupPaddedRect = new Map(groups.map(g => {
    const r = getNodeRect(g)
    return [g.id, { x: r.x - padding, y: r.y - padding, width: r.width + 2 * padding, height: r.height + 2 * padding }]
  }))

  // 判定被拖节点的归属变化
  const affected = new Set()
  for (const id of draggedIdSet) {
    const n = prevNodes.find(x => x.id === id)
    if (!n || n.type === 'group') continue // group 自身被拖不入组
    const abs = absById.get(id), sz = sizeById.get(id)
    const r = { x: abs.x, y: abs.y, width: sz.width, height: sz.height }
    const cur = membership.get(id)
    if (cur) {
      // 成员与所属组的 padded 矩形完全不相交 → detach；仍相交 → 留组
      if (!rectsIntersect(r, groupPaddedRect.get(cur))) {
        membership.set(id, null)
        affected.add(cur)
      } else {
        affected.add(cur)
      }
    } else {
      // 自由节点：中心落入某组矩形 → adopt
      const target = findDropTargetGroup(r, groups)
      if (target) { membership.set(id, target); affected.add(target) }
    }
  }
  if (affected.size === 0) return prevNodes

  // 受影响组重算几何（空组 → null 表示保留原样）
  const newBox = new Map()
  for (const gid of affected) {
    const memberIds = [...membership].filter(([, g]) => g === gid).map(([nid]) => nid)
    if (memberIds.length === 0) { newBox.set(gid, null); continue }
    const memberAbs = memberIds.map(nid => ({ position: absById.get(nid), measured: sizeById.get(nid) }))
    newBox.set(gid, computeGroupBox(memberAbs, padding))
  }

  // 重建：group 写新几何；非 group 写新 parentId + 相对/绝对 position
  const groupsOut = prevNodes.filter(n => n.type === 'group').map(n => {
    const box = newBox.get(n.id)
    if (!box) return n // 未受影响 或 空组保留
    // 双写顶层 width/height(渲染优先, 覆盖手动 resize 写的顶层值) + style(同步), 否则 resize 后自动重算盖不掉顶层、框不跟随
    return { ...n, position: { x: box.x, y: box.y }, width: box.width, height: box.height, style: { ...n.style, width: box.width, height: box.height } }
  })
  const othersOut = prevNodes.filter(n => n.type !== 'group').map(n => {
    const gid = membership.get(n.id)
    const abs = absById.get(n.id)
    if (!gid) return (n.parentId ? { ...n, parentId: undefined, position: abs } : n)
    const box = newBox.get(gid)
    const origin = box ? { x: box.x, y: box.y } : groupById.get(gid).position
    return { ...n, parentId: gid, position: { x: abs.x - origin.x, y: abs.y - origin.y } }
  })
  return [...groupsOut, ...othersOut] // 父在子前
}
