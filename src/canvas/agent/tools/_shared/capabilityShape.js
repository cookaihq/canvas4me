/**
 * capabilityShape —— 把能力注册表(registry)的内部数据结构,投影成外部命令侧需要的
 * 规整能力描述。list_capabilities / get_capability 直接复用;list_canvas / get_node
 * 在给画布节点补端口(ports)时也复用 resolvePorts。
 *
 * 投影规则(谁映射成谁):
 *   - 一个 capability → { nodeType, capability, label, description, modes:[...] }
 *   - 一个 mode → { id, label, params, ports }
 *   - 一个 param(来自 mode.commonParams 的 { key, label, control, defaultValue, options }):
 *       { key, label, type: control, default: defaultValue, enum?: options.map(value), required? }
 *   - ports = { inputs: resolveInputs(cap, mode), outputs: getCapabilityOutputs(cap, mode) }
 *
 * 已知局限:llm 这类能力的 model 参数 options 在运行时注入(不在静态 commonParams 里声明),
 * 因此这里只能给出 commonParams 声明的原貌 —— model 没有静态 enum 时,enum 字段缺省。
 */
import {
  CAPABILITIES,
  resolveModeId,
  getCapabilityOutputs,
} from '@/canvas/registry/nodeTypes'
import { resolveInputs } from '@/canvas/registry/resolveInputs'

/**
 * 把单个 commonParams 条目投影成外部命令侧的 param 描述。
 * control → type、defaultValue → default、options[].value → enum。
 * label / type 仅在 spec 提供时写入,避免精简 param spec 冒出 undefined 字段。
 */
function describeParam(spec) {
  const out = { key: spec.key }
  if (spec.label != null) out.label = spec.label
  if (spec.control != null) out.type = spec.control
  if (spec.defaultValue !== undefined) out.default = spec.defaultValue
  if (Array.isArray(spec.options) && spec.options.length > 0) {
    out.enum = spec.options
      .map((o) => (o && typeof o === 'object' ? o.value : o))
      .filter((v) => v !== undefined)
  }
  if (spec.required) out.required = true
  return out
}

/**
 * 解析 (capability, mode) 下的端口快照。content / capability / output 各类节点
 * 都可借此拿到 { inputs, outputs }(其中 content / output 节点端口由调用方另行构造)。
 *
 * inputs: [{ id, label, accept, required, multiple, maxInputs?, role, canAcceptRoles }]
 * outputs: [{ id, type, role }]
 */
export function resolvePorts(capabilityId, mode) {
  const resolvedMode = resolveModeId(capabilityId, mode)
  const inputs = resolveInputs(capabilityId, resolvedMode).map((p) => ({
    id: p.id,
    label: p.label,
    accept: p.accept,
    required: Boolean(p.required),
    multiple: Boolean(p.multiple),
    ...(p.maxInputs != null ? { maxInputs: p.maxInputs } : {}),
    ...(p.role ? { role: p.role } : {}),
    ...(Array.isArray(p.canAcceptRoles) ? { canAcceptRoles: p.canAcceptRoles } : {}),
  }))
  const outputs = getCapabilityOutputs(capabilityId, resolvedMode).map((o) => ({
    id: o.id,
    type: o.type,
    ...(o.role ? { role: o.role } : {}),
  }))
  return { inputs, outputs }
}

/**
 * 描述单个 mode → { id, label, params, ports }。
 */
function describeMode(capabilityId, modeId, modeDef) {
  const params = Array.isArray(modeDef.commonParams)
    ? modeDef.commonParams.map(describeParam)
    : []
  return {
    id: modeId,
    label: modeDef.label,
    params,
    ports: resolvePorts(capabilityId, modeId),
  }
}

/**
 * 描述单个 capability → { nodeType, capability, label, description, defaultMode, modes:[...] }。
 * capability 不存在时返回 null。
 *
 * @param {string} capabilityId
 * @returns {object | null}
 */
export function describeCapability(capabilityId) {
  const cap = CAPABILITIES[capabilityId]
  if (!cap) return null
  const modeEntries = Object.entries(cap.modes || {})
  return {
    nodeType: cap.nodeType,
    capability: capabilityId,
    label: cap.label,
    description: cap.description ?? null,
    defaultMode: cap.defaultMode ?? null,
    modes: modeEntries.map(([modeId, modeDef]) => describeMode(capabilityId, modeId, modeDef)),
  }
}

/**
 * 枚举注册表里全部 capability 的描述。
 *
 * 直接遍历 CAPABILITIES 的 key —— 不经过 getCapabilitiesByNodeType,
 * 因为后者会按范围过滤,而外部命令需要看到注册表里的全部能力。
 *
 * 刻意不做范围过滤:这里返回的是「注册表里所有能力」的全集,不裁剪。若某能力在当前
 * 环境不可用,add_node 会拒绝创建并回错;调用方据此处理被拒的 add_node 即可。
 *
 * @returns {object[]}
 */
export function describeAllCapabilities() {
  return Object.keys(CAPABILITIES).map((id) => describeCapability(id))
}
