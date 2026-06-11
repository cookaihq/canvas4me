/**
 * nodeShape —— 把画布上的一个 React Flow 节点投影成外部命令侧需要的描述。
 * list_canvas(批量概要)与 get_node(单节点详情)共用,保证两处口径一致。
 *
 * 端口推导(connect 工具据此连线,是硬需求):
 *   - capability 节点(type='capability'):端口由 (capability, mode) 经 resolvePorts 解析。
 *   - content 节点(type='input'):无输入端口;单输出端口 id = data.subType(与 handle id 一致)。
 *   - 输出节点(type='output-*'):单输入端口 id = 'input'(承接宿主能力节点产物);无对外输出端口。
 *   - 其余(group / note 等):无端口。
 *
 * 连线落点(portConnections)只读取、不改写 —— 写连线统一走 facade。
 */
import {
  resolveModeId,
  isOutputNodeType,
  getCapabilityFromOutputType,
} from '@/canvas/registry/nodeTypes'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import { resolvePorts } from './capabilityShape'

/**
 * 节点的展示名:用户起的名字优先,否则回退到类型标签。
 */
function nodeName(node) {
  return node.data?.name ?? node.data?.label ?? null
}

/**
 * 找到「承载某节点运行状态/产物」的节点。
 *
 * 能力节点本体跑起来后 runStatus 恒为 idle —— 真实状态(polling/running/done/error)与产物
 * 都落在它下游的 output 节点上(output.data.sourceCapabilityId 反指回能力节点;老画布兜底
 * sourceAbilityId)。因此读取/判定能力节点运行态时,必须改读它的 output 节点。
 *
 * 适用所有形态:折叠能力创建即带常驻 output;非折叠能力运行后也会生成 output —— 两者都靠
 * 这条反查命中。能力节点尚无 output(从未运行的非折叠能力)或传入的本就不是能力节点时,
 * 原样返回传入节点。
 *
 * 这是 get_result / run_node 提交自检 / assertNotRunning 共用的唯一「状态落点」解析口径,
 * 三处保持一致。
 *
 * @param {object} node    目标节点
 * @param {object[]} allNodes 当前全部节点(用于反查 output)
 * @returns {object} 承载状态的节点(能力节点 → 其 output;否则 → 自身)
 */
export function resolveStatusNode(node, allNodes) {
  if (!node || node.type !== 'capability') return node
  const output = (allNodes || []).find(
    (n) => isOutputNodeType(n.type) &&
      (n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId) === node.id
  )
  return output || node
}

/**
 * 推导单个节点的 { inputs, outputs } 端口快照。
 * @returns {{ inputs: object[], outputs: object[] }}
 */
export function resolveNodePorts(node) {
  if (node.type === 'capability') {
    const cap = node.data?.capability
    if (!cap) return { inputs: [], outputs: [] }
    return resolvePorts(cap, node.data?.mode)
  }
  if (node.type === 'input') {
    const subType = node.data?.subType
    return {
      inputs: [],
      outputs: subType ? [{ id: subType, type: subType }] : [],
    }
  }
  if (isOutputNodeType(node.type)) {
    // 输出节点是产物展示落点:单输入端口 'input',对外无 source 端口。
    return {
      inputs: [{ id: 'input' }],
      outputs: [],
    }
  }
  return { inputs: [], outputs: [] }
}

/**
 * 判断节点是否已有产物(content 有 url 或 text)。
 */
function hasContent(node) {
  const c = node.data?.content
  if (!c || typeof c !== 'object') return false
  return Boolean(c.url) || Boolean(c.text)
}

/**
 * 节点概要(list_canvas 用)。detail='full' 时附 params(modeParams 当前 mode 桶)与 content。
 *
 * @param {object} node React Flow 节点
 * @param {{ full?: boolean }} [opts]
 */
export function summarizeNode(node, opts = {}) {
  const { full = false } = opts
  const base = {
    id: node.id,
    type: node.type,
    name: nodeName(node),
    position: node.position,
    ports: resolveNodePorts(node),
  }

  if (node.type === 'capability') {
    base.capability = node.data?.capability ?? null
    base.mode = node.data?.mode ?? null
    base.runStatus = normalizeRunStatus(node.data?.runStatus)
    base.hasOutput = hasContent(node)
    if (full) {
      const mode = resolveModeId(node.data?.capability, node.data?.mode)
      base.params = node.data?.modeParams?.[mode] ?? {}
    } else {
      const mode = resolveModeId(node.data?.capability, node.data?.mode)
      const params = node.data?.modeParams?.[mode]
      if (params && typeof params === 'object') {
        base.paramsSummary = Object.keys(params)
      }
    }
  } else if (node.type === 'input') {
    base.subType = node.data?.subType ?? null
    base.hasOutput = hasContent(node)
    if (full) base.content = node.data?.content ?? {}
  } else if (isOutputNodeType(node.type)) {
    base.capability = getCapabilityFromOutputType(node.type)
    base.runStatus = normalizeRunStatus(node.data?.runStatus)
    base.hasOutput = hasContent(node)
    base.sourceCapabilityId = node.data?.sourceCapabilityId ?? node.data?.sourceAbilityId ?? null
    if (full) base.content = node.data?.content ?? {}
  }

  return base
}

/**
 * 单节点完整 dump(get_node 用):modeParams 全桶 / content / runStatus / lastRunSnapshot /
 * portConnections / 端口 / 几何。
 */
export function dumpNode(node) {
  return {
    id: node.id,
    type: node.type,
    name: nodeName(node),
    position: node.position,
    style: node.style ?? null,
    ports: resolveNodePorts(node),
    ...(node.type === 'capability'
      ? {
          capability: node.data?.capability ?? null,
          mode: node.data?.mode ?? null,
          runStatus: normalizeRunStatus(node.data?.runStatus),
          modeParams: node.data?.modeParams ?? {},
          portConnections: node.data?.portConnections ?? {},
          content: node.data?.content ?? null,
          lastRunSnapshot: node.data?.lastRunSnapshot ?? null,
        }
      : {}),
    ...(node.type === 'input'
      ? {
          subType: node.data?.subType ?? null,
          content: node.data?.content ?? {},
        }
      : {}),
    ...(isOutputNodeType(node.type)
      ? {
          capability: getCapabilityFromOutputType(node.type),
          runStatus: normalizeRunStatus(node.data?.runStatus),
          content: node.data?.content ?? {},
          sourceCapabilityId: node.data?.sourceCapabilityId ?? node.data?.sourceAbilityId ?? null,
        }
      : {}),
  }
}
