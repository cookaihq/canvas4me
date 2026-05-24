/**
 * 拖入上传临时 store —— 管理"上传中/失败"节点的 File 对象引用 + 重试入口。
 *
 * 为什么不放进 node.data：
 *   - File 不可序列化（Structured Clone Algorithm 可以但 storage 持久化没意义）
 *   - File 也不该跟随画布数据被自动保存到后端
 *
 * 生命周期：
 *   - 拖入立即 registerFile(nodeId, file, retryFn)
 *   - 上传成功 → clearFile(nodeId) 释放
 *   - 上传失败 → 保留，渲染器调 retryNode(nodeId) 触发重试
 *   - 节点被删 → clearFile(nodeId) 释放（由调用方在删除节点时调）
 */

const fileMap = new Map() // nodeId -> File
const retryMap = new Map() // nodeId -> () => Promise<void>

export function registerFile(nodeId, file, retryFn) {
  fileMap.set(nodeId, file)
  retryMap.set(nodeId, retryFn)
}

export function getFile(nodeId) {
  return fileMap.get(nodeId)
}

export function clearFile(nodeId) {
  fileMap.delete(nodeId)
  retryMap.delete(nodeId)
}

export function retryNode(nodeId) {
  const fn = retryMap.get(nodeId)
  if (!fn) return Promise.resolve()
  return fn()
}

export function hasRetry(nodeId) {
  return retryMap.has(nodeId)
}
