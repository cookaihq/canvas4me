/**
 * 工具 create_project —— 新建一个画布项目并立即打开它(把当前画布切到新项目)。
 *
 * 流程(谁干什么活):
 *   1. ctx.canvasStore.create(name) 在存储层落一条新画布记录,拿到 { id, name, updated_at }。
 *   2. ctx.switchCanvas(id) 把当前在线画布切到这条新画布(由执行器经 ref 注入)。
 *
 * switchCanvas 缺失(执行器未接通切换能力)时,创建仍成功,但只回 created,不切画布,
 * 并在返回里标 opened:false,让 agent 知道需要自己再调 open_project。
 */

/** @type {import('./index').AgentTool} */
export const createProject = {
  name: 'create_project',
  description: '新建一个画布项目并立即打开(把当前画布切到新项目)。',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '项目名称(缺省由存储层取默认名)' },
    },
    additionalProperties: false,
  },
  handler: async (args, ctx) => {
    const { canvasStore, switchCanvas } = ctx
    if (!canvasStore) throw new Error('create_project 不可用:缺少 canvasStore')
    const created = await canvasStore.create(args?.name)
    if (!created?.id) throw new Error('create_project 失败:存储层未返回新项目 id')
    if (typeof switchCanvas === 'function') {
      await switchCanvas(created.id)
      return { ok: true, project: created, opened: true }
    }
    return { ok: true, project: created, opened: false }
  },
}
