/**
 * 能力节点数据读写工具
 *
 * 数据模型（见 concepts.md §和输入端口的关系）：
 *   data.modeParams      —— { [modeId]: { ...form params } }     表单参数按 mode 分桶
 *   data.portConnections —— { [handle]: [{ source, sourceHandle }, ...] }  连线按端口 id 分桶
 *
 * 设计原则：
 *   - 所有 getter 返回空值兜底（不抛错）；老数据兜底见 migrateCapabilityNodes.js
 *   - 所有 writer 返回新 data 对象（immutable），供 setNodes 使用
 *   - portConnections 统一用数组存储：single 端口数组长度 ≤ 1；multiple 端口可多条
 */

// ─── modeParams ───

/**
 * 读取指定 mode 的表单参数。
 */
export function getModeParams(data, mode) {
  return data?.modeParams?.[mode] || {}
}

/**
 * 部分更新指定 mode 的表单参数（浅合并）。
 * 返回新的 data 对象。
 */
export function patchModeParams(data, mode, partial) {
  const current = getModeParams(data, mode)
  return {
    ...data,
    modeParams: {
      ...(data?.modeParams || {}),
      [mode]: { ...current, ...partial },
    },
  }
}

/**
 * 完全替换指定 mode 的表单参数。
 */
export function writeModeParams(data, mode, params) {
  return {
    ...data,
    modeParams: {
      ...(data?.modeParams || {}),
      [mode]: params || {},
    },
  }
}

// ─── portConnections ───

/**
 * 读取所有端口连线（object 形式）。
 * 始终返回 object，值为数组（可能为空数组）。
 */
export function getPortConnections(data) {
  return data?.portConnections || {}
}

/**
 * 读取指定端口的所有连线。
 * 返回数组：single 端口返回 0 或 1 条；multiple 端口可多条。
 */
export function getConnections(data, handle) {
  const conns = data?.portConnections?.[handle]
  if (!conns) return []
  return Array.isArray(conns) ? conns : [conns]
}

/**
 * 追加一条连线。
 * - multiple=false: 替换（只保留这一条）
 * - multiple=true: 去重后追加（按 source+sourceHandle 匹配）
 */
export function addConnection(data, handle, conn, multiple = false) {
  const existing = getConnections(data, handle)
  let next
  if (multiple) {
    const isDup = existing.some(
      c => c.source === conn.source && c.sourceHandle === conn.sourceHandle
    )
    next = isDup ? existing : [...existing, conn]
  } else {
    next = [conn]
  }
  return {
    ...data,
    portConnections: {
      ...(data?.portConnections || {}),
      [handle]: next,
    },
  }
}

/**
 * 按 source + sourceHandle 删除指定端口的一条连线。
 * 如果删完后数组为空，**保留**空数组（仍表示"这个端口曾被连过"，但当前为空）。
 * 若希望彻底清理键，调用 clearConnections。
 */
export function removeConnection(data, handle, source, sourceHandle) {
  const existing = getConnections(data, handle)
  const next = existing.filter(
    c => !(c.source === source && c.sourceHandle === sourceHandle)
  )
  return {
    ...data,
    portConnections: {
      ...(data?.portConnections || {}),
      [handle]: next,
    },
  }
}

/**
 * 彻底清理指定端口的连线键。
 */
export function clearConnections(data, handle) {
  const next = { ...(data?.portConnections || {}) }
  delete next[handle]
  return { ...data, portConnections: next }
}

/**
 * 批量清理：按 source 节点 id 删除该节点在所有端口上的连线。
 * 在上游节点被删除时调用，防止 portConnections 持有僵尸引用。
 */
export function clearConnectionsBySource(data, sourceId) {
  const all = data?.portConnections || {}
  let changed = false
  const next = {}
  for (const handle of Object.keys(all)) {
    const existing = Array.isArray(all[handle]) ? all[handle] : [all[handle]]
    const filtered = existing.filter(c => c.source !== sourceId)
    if (filtered.length !== existing.length) changed = true
    next[handle] = filtered
  }
  if (!changed) return data
  return { ...data, portConnections: next }
}
