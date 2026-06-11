/**
 * 工具 list_projects —— 列出全部画布项目(id / name / updated_at)。
 *
 * 经 ctx.canvasStore.list() 读取(由执行器注入)。handler 只读。
 */

/** @type {import('./index').AgentTool} */
export const listProjects = {
  name: 'list_projects',
  description: '列出全部画布项目(id、名称、更新时间)。',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_args, ctx) => {
    const { canvasStore } = ctx
    if (!canvasStore) throw new Error('list_projects 不可用:缺少 canvasStore')
    const projects = await canvasStore.list()
    return { projects: projects || [] }
  },
}
