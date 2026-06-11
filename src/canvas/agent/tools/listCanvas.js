/**
 * 工具 list_canvas —— 读当前在线画布的完整结构图:节点(带端口)+ 连线 + 分组。
 *
 * 端口是硬需求:每个节点都带 ports.{inputs,outputs},外部 agent 才能据此 connect。
 * 端口推导见 _shared/nodeShape.js(capability 节点按 mode 解析、content 节点单输出、
 * 输出节点单输入)。
 *
 * detail='full' 时,每个节点额外 dump 当前 mode 的参数(capability)与产物 content。
 * 分组成员关系由子节点 parentId 反查(group 节点本身不存 memberIds)。
 *
 * 项目元信息(project)best-effort:执行器接通 getProjectMeta 时返回 { id, name },否则省略。
 *
 * handler 只读,不写画布。
 */
import { summarizeNode } from './_shared/nodeShape'

/** @type {import('./index').AgentTool} */
export const listCanvas = {
  name: 'list_canvas',
  description: '读当前画布的完整结构:节点(含输入/输出端口)、连线、分组。detail="full" 额外含每个节点的参数与产物。',
  inputSchema: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        enum: ['summary', 'full'],
        description: '"summary"(默认)只回结构概要;"full" 额外 dump 每个节点的参数与产物。',
      },
    },
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    const { facade, getProjectMeta } = ctx
    const full = args?.detail === 'full'
    const nodes = facade.getNodes()
    const edges = facade.getEdges()

    // 分组成员:扫所有节点的 parentId,归到对应 group。
    const membersByGroup = new Map()
    for (const n of nodes) {
      if (n.parentId) {
        if (!membersByGroup.has(n.parentId)) membersByGroup.set(n.parentId, [])
        membersByGroup.get(n.parentId).push(n.id)
      }
    }

    const out = {
      nodes: nodes
        .filter((n) => n.type !== 'group')
        .map((n) => summarizeNode(n, { full })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      })),
      groups: nodes
        .filter((n) => n.type === 'group')
        .map((g) => ({
          id: g.id,
          name: g.data?.name ?? '',
          memberIds: membersByGroup.get(g.id) || [],
        })),
    }

    // 项目元信息可选:执行器接通时附上。
    const meta = typeof getProjectMeta === 'function' ? getProjectMeta() : null
    if (meta && meta.id) out.project = { id: meta.id, name: meta.name ?? '' }

    return out
  },
}
