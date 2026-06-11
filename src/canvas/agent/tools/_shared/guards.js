/**
 * guards —— 写类工具(add_node / connect / set_params / update_node / run_node ...)共用的
 * 入参与目标节点校验。中转转发的是 agent 原始入参,未经校验 → 落地前在此统一把关,
 * 非法时抛清晰错误(执行器 catch 后回 error 给上层 agent 纠错)。
 */
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import { resolveStatusNode } from './nodeShape'

/**
 * 当前是否可编辑(ctx.isEditing 是「调用时求值」闭包,缺省视为可编辑)。
 * 不可编辑时抛错,阻止写类工具落地。
 */
export function assertEditable(ctx) {
  if (ctx?.isEditing && ctx.isEditing() === false) {
    throw new Error('当前为只读,无法修改画布')
  }
}

/**
 * 按 id 取节点,不存在时抛错。
 * @returns {object} React Flow 节点
 */
export function requireNode(ctx, nodeId) {
  if (!nodeId || typeof nodeId !== 'string') throw new Error('需要字符串 nodeId')
  const node = ctx.facade.getNodes().find((n) => n.id === nodeId)
  if (!node) throw new Error(`节点不存在: ${nodeId}`)
  return node
}

/**
 * 节点被锁(连入正在运行的任务,data.locked=true)时抛错——锁定节点不允许改参/删除。
 */
export function assertNotLocked(node) {
  if (node?.data?.locked) throw new Error(`节点已锁定(连入运行中任务),暂不可修改: ${node.id}`)
}

/**
 * 节点正在运行(Running/Polling/Streaming)时抛错——进行中的节点不允许改参/删除/重跑。
 *
 * 能力节点本体 runStatus 恒为 idle,运行态在它下游的 output 节点上 —— 故须传 ctx,
 * 经 resolveStatusNode 反查到状态落点节点再判定;否则能力节点产物 Polling 时本守门永不触发。
 * content / output 等非能力节点 resolveStatusNode 原样返回,行为不变。
 *
 * @param {object} node 目标节点
 * @param {object} ctx  执行上下文(用 ctx.facade.getNodes() 反查 output);缺省退化为只看自身
 */
export function assertNotRunning(node, ctx) {
  const statusNode = ctx?.facade
    ? resolveStatusNode(node, ctx.facade.getNodes())
    : node
  const status = normalizeRunStatus(statusNode?.data?.runStatus)
  if (status === 'Running' || status === 'Polling' || status === 'Streaming') {
    throw new Error(`节点运行中(${status}),请等待完成: ${node.id}`)
  }
}

/**
 * 校验 url 必须是远端可访问的 http(s) url。
 * 画布只存 http(s) url —— base64(data:)/内存对象 url(blob:)写进画布会让 JSON 体积爆炸 /
 * 关画布即失效,一律按非法入参拒绝。
 */
export function assertHttpUrl(url, field = 'url') {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(`${field} 必须是字符串 url`)
  }
  if (/^(blob:|data:)/i.test(url)) {
    throw new Error(`${field} 不接受 base64/内存对象 url,必须是远端 http(s) url`)
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`${field} 必须是 http(s) url`)
  }
}

/**
 * 递归扫描任意值,若有字符串以 data:/blob: 开头则抛错。
 * 用于 set_params 等「参数对象里可能内联 url」的场景:画布只存 http(s) url,
 * 不接受写入 base64 / 内存对象 url。不限制具体字段名,任意层级命中即拒绝。
 */
export function assertNoLocalUrls(value, path = 'params') {
  if (typeof value === 'string') {
    if (/^(blob:|data:)/i.test(value)) {
      throw new Error(`${path} 含 base64/内存对象 url(${value.slice(0, 24)}…),画布只接受远端 http(s) url`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoLocalUrls(v, `${path}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) assertNoLocalUrls(value[k], `${path}.${k}`)
  }
}
