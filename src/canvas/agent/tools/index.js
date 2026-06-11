/**
 * 工具注册表 —— 把外部命令的工具名映射到具体落地逻辑。
 *
 * 每个工具 = { name, description, inputSchema(JSON Schema), handler(args, ctx) }。
 * - buildToolDeclarations() → [{ name, description, inputSchema }],连上后发 hello 用。
 * - dispatch(tool, args, ctx) → 按名路由到 handler;未知工具 / handler 抛错时抛清晰错误。
 *
 * ctx 由执行器构造并经 ref 保鲜(见 useAgentExecutor 的 ctx-ref):
 *   { facade, canvasStore, switchCanvas, getProjectMeta, isEditing, run, viewport,
 *     groupActions, connect, isValidConnection }
 *   —— 读/写画布、项目存取、运行能力、视口、分组、连线等都在此;往里加字段无需改本注册表路由。
 *
 * 扩展方式:新增工具文件 → 在下方 TOOLS 数组登记即可,执行器与传输层都不用动。
 *
 * @typedef {object} AgentTool
 * @property {string} name
 * @property {string} description
 * @property {object} inputSchema                         入参 JSON Schema
 * @property {(args: object, ctx: object) => any} handler 返回值可为任意 JSON
 */
import { listCanvas } from './listCanvas'
import { addNode } from './addNode'
import { listCapabilities } from './listCapabilities'
import { getCapability } from './getCapability'
import { listProjects } from './listProjects'
import { createProject } from './createProject'
import { openProject } from './openProject'
import { getNode } from './getNode'
import { acquireEditLock, releaseEditLock } from './editLock'
import { connect } from './connect'
import { setParams } from './setParams'
import { updateNode } from './updateNode'
import { groupNodes, ungroupNodes } from './groupNodes'
import { runNode } from './runNode'
import { getResult } from './getResult'
import { focusNode } from './focusNode'

/** @type {AgentTool[]} */
const TOOLS = [
  // 发现:能力
  listCapabilities,
  getCapability,
  // 项目
  listProjects,
  createProject,
  openProject,
  // 读画布
  listCanvas,
  getNode,
  getResult,
  // 编辑锁(本部署无锁,空操作)
  acquireEditLock,
  releaseEditLock,
  // 写画布:节点
  addNode,
  updateNode,
  setParams,
  // 写画布:连线
  connect,
  // 写画布:分组
  groupNodes,
  ungroupNodes,
  // 运行
  runNode,
  // 视口(只移动镜头)
  focusNode,
]

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]))

/**
 * 给 hello 信封用的工具声明列表(只含元信息,不含 handler)。
 * @returns {Array<{ name: string, description: string, inputSchema: object }>}
 */
export function buildToolDeclarations() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

/**
 * 按工具名路由到对应 handler 执行。
 * @param {string} tool 工具名
 * @param {object} args 入参
 * @param {object} ctx  执行上下文(含 facade 等)
 * @returns {any} handler 返回值
 */
export function dispatch(tool, args, ctx) {
  const def = TOOL_MAP.get(tool)
  if (!def) throw new Error(`未知工具: ${tool}`)
  return def.handler(args || {}, ctx)
}
