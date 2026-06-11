/**
 * 工具 open_project —— 把当前在线画布切换到指定项目 id。
 *
 * 先用 ctx.canvasStore.get(id) 校验项目存在(不存在抛错让 agent 纠错),
 * 再用 ctx.switchCanvas(id) 切换(由执行器经 ref 注入)。
 */

/** @type {import('./index').AgentTool} */
export const openProject = {
  name: 'open_project',
  description: '把当前在线画布切换到指定项目 id。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要打开的项目 id' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: async (args, ctx) => {
    const { canvasStore, switchCanvas } = ctx
    const id = args?.id
    if (!id || typeof id !== 'string') throw new Error('open_project 需要字符串入参 id')
    if (typeof switchCanvas !== 'function') {
      throw new Error('open_project 不可用:执行器未接通画布切换能力')
    }
    // 先校验存在,避免 switchCanvas 在加载阶段才报模糊错误。
    if (canvasStore) {
      const detail = await canvasStore.get(id)
      if (!detail) throw new Error(`项目不存在: ${id}`)
    }
    await switchCanvas(id)
    return { ok: true, id }
  },
}
