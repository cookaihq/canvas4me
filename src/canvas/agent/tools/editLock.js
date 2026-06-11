/**
 * 工具 acquire_edit_lock / release_edit_lock —— 编辑锁的获取/释放。
 *
 * 本部署没有协作锁机制(画布始终可编辑),因此这两个工具是「永远成功的空操作」:
 * 不会真的去抢/放任何锁,只是把当前是否可编辑(isEditing,执行器可选注入)如实回报,
 * 让上层 agent 的「先取锁再改」流程能无障碍走通。永不阻塞、永不失败。
 *
 * 之所以仍提供这两个工具:让「取锁 → 改 → 放锁」的通用 agent 流程在本部署里也能
 * 无差别执行,而不必为「无锁环境」写分支。
 */

/** ctx.isEditing 是「调用时求值」的闭包,缺省视为可编辑(本部署无只读锁)。 */
function readEditing(ctx) {
  return ctx?.isEditing?.() !== false
}

/** @type {import('./index').AgentTool} */
export const acquireEditLock = {
  name: 'acquire_edit_lock',
  description: '获取编辑锁。本部署无锁机制,恒成功(空操作),回报当前是否可编辑。',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: (_args, ctx) => ({ ok: true, lock: 'noop', editing: readEditing(ctx) }),
}

/** @type {import('./index').AgentTool} */
export const releaseEditLock = {
  name: 'release_edit_lock',
  description: '释放编辑锁。本部署无锁机制,恒成功(空操作)。',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: (_args, ctx) => ({ ok: true, lock: 'noop', editing: readEditing(ctx) }),
}
