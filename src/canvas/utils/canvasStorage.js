/**
 * 画布加载/保存的纯函数封装(接受 canvasStore 实例,由调用方通过 useCanvasStore() 拿)。
 *
 * 这层薄包装做三件事:
 *   - loadCanvas: 兜底缺省值 + 入口处 sanitize, 防止上游脏数据流进 React Flow
 *   - saveCanvas: 序列化前 sanitize 掉 isDraft edges + 节点上的运行时/会话级字段.
 *                 (折叠节点 DockedPanel 的 draft 是会话级临时态, 不持久化;
 *                  详见 docs/archive/20260513-folded-node-edit-semantics.md §4.6)
 *   - saveCanvas: 把 409 错误转成 LockLostError(装饰层 only)
 */

// 持久化:顶层白名单 —— 只存这些结构字段,RF 运行态(measured/internals/selected/
// dragging/resizing/hidden)与未列字段自动丢弃。顶层结构稳定,新能力不往此层加字段。
const NODE_TOP_WHITELIST = ['id', 'type', 'position', 'width', 'height', 'parentId', 'zIndex', 'style']

// 持久化:data 黑名单 —— 只删这些派生态/会话态,其余领域字段默认保留(新能力加 data
// 字段无需改这里,避免白名单漏字段导致静默丢数据)。
const DATA_BLACKLIST = [
  '_draft', '_mediaWidth', '_mediaHeight', '_mediaFileSize', '_mediaDuration',
  '_imageAspect', '_ignoredCount', 'canvasSeq', 'hiddenEdgeCount', 'downstreamOutput', 'userTouched',
]

function sanitizePersistedContent(content) {
  if (!content || typeof content !== 'object') return content
  // localPreviewUrl 是会话级 blob: URL,严禁持久化(刷新即失效)
  // rawError 是原始 Error/任务状态对象,非序列化安全且属运行态诊断,不持久化
  //(人类可读的 content.error 字符串已保留)
  const { localPreviewUrl: _drop, rawError: _rawErr, ...rest } = content
  // content.url 若误带 blob:/data: 兜底为 null,防御未来其他写入源
  const url = rest.url
  const isBadUrl = typeof url === 'string' && /^(blob:|data:)/.test(url)
  return isBadUrl ? { ...rest, url: null } : rest
}

/**
 * 把一个 React Flow 节点裁成"可持久化"形态:
 *   - 顶层取白名单字段(甩掉 measured/internals/selected/dragging/resizing/hidden 等)
 *   - data 取黑名单之外的全部字段(领域态默认保留),并 sanitize content
 */
export function toPersistedNode(node) {
  if (!node) return node
  const out = {}
  for (const k of NODE_TOP_WHITELIST) if (k in node) out[k] = node[k]
  const data = node.data || {}
  const outData = {}
  for (const k of Object.keys(data)) {
    if (DATA_BLACKLIST.includes(k)) continue
    outData[k] = k === 'content' ? sanitizePersistedContent(data[k]) : data[k]
  }
  out.data = outData
  return out
}

/**
 * 加载画布数据
 * @param {import('@/platform/interfaces/CanvasStore').CanvasStore} canvasStore
 * @param {string} canvasId
 * @returns {{ canvas: { nodes, edges, viewport }, lockStatus: object }}
 */
export async function loadCanvas(canvasStore, canvasId) {
  const resp = await canvasStore.get(canvasId)
  const { canvas, lock_status } = resp
  // 入口 sanitize: 老画布存盘里可能残留运行时字段, 这里统一洗干净,
  // 避免污染流进 React Flow 后表现为"加载即选中"等鬼影状态.
  const sanitized = canvas ? sanitizeCanvasPayload(canvas) : null
  return {
    canvas: sanitized || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    lockStatus: lock_status || { is_locked: false, holder: null },
  }
}

/**
 * 保存画布内容
 * @param {import('@/platform/interfaces/CanvasStore').CanvasStore} canvasStore
 * @param {string} canvasId
 * @param {{ nodes, edges, viewport }} data
 * @returns {Promise<void>}
 * @throws 409 时抛出 LockLostError(装饰层 only)
 */
export async function saveCanvas(canvasStore, canvasId, data) {
  try {
    await canvasStore.saveCanvas(canvasId, sanitizeCanvasPayload(data))
  } catch (err) {
    if (err.status === 409 || err.code === 409) {
      const lockErr = new Error('编辑锁已被其他用户获取，无法保存')
      lockErr.isLockLost = true
      throw lockErr
    }
    throw err
  }
}

/**
 * 持久化前 sanitize: 删 isDraft edges + 节点持久化裁剪(顶层白名单 + data 黑名单).
 * 也顺便清掉 edge.data.failed / className=is-orphan (失败迁移标记是 UI 状态, 不存盘)
 */
export function sanitizeCanvasPayload(data) {
  if (!data) return data
  const nextEdges = Array.isArray(data.edges)
    ? data.edges
      .filter(e => !e?.isDraft)
      .map(stripEdgeRuntimeMarks)
    : data.edges
  const nextNodes = Array.isArray(data.nodes)
    ? data.nodes.map(toPersistedNode)
    : data.nodes
  return { ...data, edges: nextEdges, nodes: nextNodes }
}

function stripEdgeRuntimeMarks(edge) {
  let touched = false
  let next = edge
  if (edge?.data && Object.prototype.hasOwnProperty.call(edge.data, 'failed')) {
    const { failed: _drop, ...rest } = edge.data
    next = { ...next, data: rest }
    touched = true
  }
  if (edge?.className && /\bis-orphan\b/.test(edge.className)) {
    const tokens = String(edge.className).split(/\s+/).filter(t => t && t !== 'is-orphan')
    next = { ...next, className: tokens.length ? tokens.join(' ') : undefined }
    touched = true
  }
  return touched ? next : edge
}
