import { NodeTypeIcons } from '@/canvas/icons'

/**
 * AI Canvas — 能力注册中枢(三层:Node Type → Capability → Mode)
 *
 * 2.1 收口完成后,本文件只剩协议定义 + 工具函数,不再含任何具体子能力数据。
 * 各子能力在 `src/capabilities/{nodeType}/{cap}/register.js` 里调
 * `registerCapability(spec)`,运行时由 `src/capabilities/index.js` barrel 触发注册。
 *
 * 收集器:
 *   - CAPABILITIES                    元数据 + modes
 *   - CAPABILITY_VIEWS                视图壳懒加载
 *   - CAPABILITY_OUTPUT_NODE_TYPES    输出节点组件 eager (React Flow nodeTypes 用,
 *                                     key 是 `output-${cap}`,被 outputNodeTypes.js spread)
 *   - CAPABILITY_OUTPUT_PANELS        输出节点面板懒加载
 *   - CAPABILITY_CARDS                画布卡片渲染器懒加载 (key: `${cap}/${mode}`)
 *   - CAPABILITY_BUILDERS[type]       同步 builder (按 nodeType 分桶,缺失时 dispatcher fallback 到 default)
 *   - CAPABILITY_CONTENT_RESOLVERS    轮询结果 → node.data.content 的解析器
 *                                     (每个 capability 必须单独写,不提供通用 fallback)
 */

// ─── 节点类型(画布上的 4 种能力卡片) ───

export const NODE_TYPES = [
  { id: 'llm',   label: '大语言模型', icon: NodeTypeIcons.llm },
  { id: 'image', label: '图片创作',   icon: NodeTypeIcons.image },
  { id: 'video', label: '视频创作',   icon: NodeTypeIcons.video },
  { id: 'sound', label: '声音创作',   icon: NodeTypeIcons.sound },
  { id: 'tool',  label: '工具',       icon: NodeTypeIcons.tool },
]

// ─── 收集器(由 registerCapability 注入) ───

export const CAPABILITIES = {}
export const CAPABILITY_VIEWS = {}
export const CAPABILITY_OUTPUT_PANELS = {}
export const CAPABILITY_CARDS = {}

// ─── 输出节点工具 ───

export function getOutputNodeType(capability) {
  return `output-${capability}`
}

export function getCapabilityFromOutputType(nodeType) {
  if (typeof nodeType !== 'string' || !nodeType.startsWith('output-')) return null
  return nodeType.slice('output-'.length)
}

export function isOutputNodeType(nodeType) {
  return typeof nodeType === 'string' && nodeType.startsWith('output-')
}

// ─── Mode 工具 ───

/**
 * 归一化 (capability, mode) 对：mode 为空或无效时回退到 defaultMode
 * @returns {string|null} 有效 mode id；capability 不存在时返回 null
 */
export function resolveModeId(capabilityId, mode) {
  const capability = CAPABILITIES[capabilityId]
  if (!capability) return null
  if (mode && capability.modes?.[mode]) return mode
  return capability.defaultMode
}

/**
 * 读取 (capability, mode) 下的 mode 定义
 */
export function getModeDef(capabilityId, mode) {
  const capability = CAPABILITIES[capabilityId]
  if (!capability) return null
  const modeId = resolveModeId(capabilityId, mode)
  return modeId ? capability.modes[modeId] : null
}

/**
 * 读取 (capability, mode) 下的 outputs 数组（每个元素含 id / type / renderer? / validateContent?）
 *
 * Schema:
 *   - []                                    无输出端口（结果节点纯展示型能力）
 *   - [{ id, type, ...}]                    单输出端口（绝大多数能力）
 *   - [{ id, type }, { id, type }, ...]     多输出端口（如同时输出图片 + mask）
 *
 * 命名约定：
 *   - outputs[0] 为"主输出"，能力节点跑完后用它作为自动连线的 sourceHandle
 *   - handle id 统一带 `-out` 后缀（如 'image-out', 'video-out', 'text-out'）。
 *     原因：React Flow 要求同节点内 source/target handle id 全局唯一，而能力节点的
 *     input handle 常用 'image'/'video'/'audio' 等 type 字面量，若 output handle 再
 *     使用同名会撞车。content 节点（input 节点）单输出无冲突，其 handle id 直接用 subType。
 *   - 同 type 多个 output 时用语义名 + `-out`（如 'mask-out'、'first-frame-out'）
 */
export function getCapabilityOutputs(capabilityId, mode) {
  return getModeDef(capabilityId, mode)?.outputs ?? []
}

/**
 * 读取 (capability, mode) 下指定 handle 的 output 定义
 */
export function getCapabilityOutputByHandle(capabilityId, mode, handleId) {
  const outputs = getCapabilityOutputs(capabilityId, mode)
  return outputs.find(o => o.id === handleId) ?? null
}

/**
 * 读取 (capability, mode) 的"主输出" = outputs[0]
 * 用于边线着色、自动连线、输出节点默认渲染。无输出时返回 null。
 */
export function getCapabilityPrimaryOutput(capabilityId, mode) {
  return getCapabilityOutputs(capabilityId, mode)[0] ?? null
}

/**
 * 读取 (capability, mode) 下的 mode label（用于面板 Header mode-badge / 选择器）
 */
export function getModeLabel(capabilityId, mode) {
  return getModeDef(capabilityId, mode)?.label ?? null
}

/**
 * 判断 capability 是否多模式（mode 数 > 1）—— 多模式才渲染 mode 选择器和 mode-badge
 */
export function isMultiMode(capabilityId) {
  const capability = CAPABILITIES[capabilityId]
  if (!capability) return false
  return Object.keys(capability.modes || {}).length > 1
}

/**
 * 读取 (capability, mode) 的 URL 段 —— shape 1（多系列 capability）由 mode.modelSeries 决定，
 * 缺省时 fallback 到 capability id（shape 2 及更简单形态）。
 */
export function getModelSeries(capabilityId, mode) {
  return getModeDef(capabilityId, mode)?.modelSeries || capabilityId
}

/**
 * 读取 capability 的 pricing spec。可选字段：
 *   - resolveModelId({ mode, modeParams }): string   自定义 pricing 接口的 model_id
 *   - computeUnits({ mode, modeParams, collectedInputs }): number | Promise<number> | null
 * 未注册时返回 null，面板不显示积分。
 */
export function getCapabilityPricing(capabilityId) {
  return CAPABILITIES[capabilityId]?.pricing || null
}

/**
 * Header 是否隐藏 mode-badge（某些 capability 已用自己的选择器表达 mode，不需要右上角胶囊）。
 */
export function shouldHideModeBadgeInHeader(capabilityId) {
  return CAPABILITIES[capabilityId]?.hideModeBadgeInHeader === true
}

// ─── Capability 形态(form) ───
//
// 'separated': 能力节点本身不携带产物, 下游 outputNode 独立渲染(默认)
// 'folded'   : 能力节点本体携带产物, 渲染层把下游 outputNode 折叠掉
//
// form 是 capability 在 registry 上声明的代码级属性, 不写到节点 data 里.
// runner 渲染层据此识别折叠形态, 详见 docs/archive/20260501-folded-ability-node.md §6.1

/**
 * 读取 capability 的 form 字段, 缺省为 'separated'
 * @param {string} capabilityId
 * @returns {'separated' | 'folded'}
 */
export function getCapabilityForm(capabilityId) {
  const form = CAPABILITIES[capabilityId]?.form
  return form === 'folded' ? 'folded' : 'separated'
}

/**
 * capability 是否为折叠形态
 * @param {string} capabilityId
 * @returns {boolean}
 */
export function isFoldedCapability(capabilityId) {
  return getCapabilityForm(capabilityId) === 'folded'
}

// ─── 占位机制("即将上线") ───
//
// capability 级占位:spec.placeholder = true
//   → 列表/picker 仍显示这个 capability,但加"即将上线"角标 + 点击不创建节点(toast)
// mode 级占位:spec.modes[mode].placeholder = true
//   → mode 选择器仍显示该选项,但带角标 + 不可选

const PLACEHOLDER_HINT_DEFAULT = '即将上线'

/**
 * capability 是否占位(整体)。
 */
export function isPlaceholderCapability(capabilityId) {
  return CAPABILITIES[capabilityId]?.placeholder === true
}

/**
 * mode 是否占位(同 capability 内的部分 mode 占位)。
 */
export function isPlaceholderMode(capabilityId, mode) {
  return getModeDef(capabilityId, mode)?.placeholder === true
}

/**
 * 占位文案 hint(可选,默认 "即将上线")。
 * 当前不暴露自定义文案,统一显示默认值;留作后续扩展接口。
 */
export function getPlaceholderHint() {
  return PLACEHOLDER_HINT_DEFAULT
}

// ─── 通用工具 ───

export function getCapabilitiesByNodeType(nodeType) {
  return Object.entries(CAPABILITIES)
    .filter(([, cap]) => cap.nodeType === nodeType)
    .filter(([, cap]) => isCapabilityVisibleForCurrentTeam(cap))
    .map(([id, cap]) => ({ id, ...cap }))
}

// ─── 团队级 capability 可见性(阶段 5) ───
//
// _teamScope 字段(由 register.js 自己声明):
//   - undefined / 'public':通用 capability,所有用户可见
//   - 'share'             :团队级共享 capability(所有团队可见,登录即可)
//   - <alias>             :团队独占 capability(仅 internal_alias === alias 的团队可见)
//
// 扩展注册:装饰层入口启动时调 setExtendedRegistryEnabled(true) + 切团队时
// 调 setCurrentTeamAlias(alias)。基础入口不调上面两个 setter,
// _extendedRegistryEnabled 永远是 false,所有非 public scope 的 capability 都不可见。
// 切团队不卸载旧 capability,_teamScope 过滤负责"看不见"。

let _extendedRegistryEnabled = false
let _currentTeamAlias = null

/**
 * 装饰层入口启动时调一次启用扩展注册。基础入口不调,
 * _extendedRegistryEnabled 保持 false。
 */
export function setExtendedRegistryEnabled(enabled) {
  _extendedRegistryEnabled = !!enabled
}

/**
 * 装饰层 入口在 currentTeam 变化时调,传当前团队 internal_alias(可为空字符串/null)。
 */
export function setCurrentTeamAlias(alias) {
  _currentTeamAlias = alias || null
}

export function getCurrentTeamAlias() {
  return _currentTeamAlias
}

function isCapabilityVisibleForCurrentTeam(cap) {
  const scope = cap._teamScope
  if (!scope || scope === 'public') return true
  if (!_extendedRegistryEnabled) return false
  if (scope === 'share') return true
  return scope === _currentTeamAlias
}

export function getNodeType(nodeTypeId) {
  return NODE_TYPES.find(t => t.id === nodeTypeId)
}

// ─── registerCapability:子能力注册的统一入口 ───

export const CAPABILITY_BUILDERS = {
  llm: {},
  image: {},
  video: {},
  sound: {},
  tool: {},
}

// 轮询成功/转存失败回调 → node.data.content 的解析器注册表。
// key: capability id；value: (result) => { url?, fileSize?, mimeType?, fileName?, text? } | null
// 每个 capability 必须单独实现（不提供通用 fallback），未注册 → onSuccess 走 null 分支 + console.warn。
export const CAPABILITY_CONTENT_RESOLVERS = {}

// React Flow 要求 nodeTypes 同步可用,所以 outputNode 是 eager Component(非 lazy import)。
// outputNodeTypes.js 会把这里 spread 进 OUTPUT_NODE_TYPES,直接喂给 React Flow。
export const CAPABILITY_OUTPUT_NODE_TYPES = {}

/**
 * 子能力注册入口。
 * 每个子能力在 `src/capabilities/{nodeType}/{cap}/register.js` 里调一次。
 *
 * @param {object} spec
 * @param {string} spec.id                        capability id(如 'nano-banana')
 * @param {string} spec.nodeType                  'llm' | 'image' | 'video' | 'sound'
 * @param {string} spec.label                     画布上展示的能力名
 * @param {string} [spec.shortLabel]              简短名(可选)
 * @param {*} [spec.icon]                         图标 SVG
 * @param {string} spec.defaultMode               默认 mode id
 * @param {object} spec.modes                     mode 定义(原 CAPABILITIES[id].modes)
 * @param {() => Promise<*>} [spec.view]          视图壳懒加载
 * @param {React.Component} [spec.outputNode]     输出节点 React 组件(eager,React Flow 要求)
 * @param {() => Promise<*>} [spec.outputPanel]   输出节点面板懒加载
 * @param {Record<string, () => Promise<*>>} [spec.cards]
 *                                                每个 mode 的画布卡片懒加载(key 为 mode id)
 * @param {Function} [spec.build]                 同步 builder(请求体组装函数)
 * @param {Function} [spec.resolveContent]        轮询结果 → node.data.content 的解析器(每个 capability 必须单独实现)
 * @param {boolean}  [spec.hideModeBadgeInHeader] true 时 CapabilityPanel Header 不渲染 mode-badge 胶囊(容纳自制 mode 选择器)
 * @param {object}   [spec.pricing]               pricing spec: { resolveModelId?, computeUnits? } 用于积分预估;未注册则不显示积分
 * @param {string[]} [spec.hideRunCountInModes]   这些 mode 下 CapabilityPanel 隐藏 x1/x2/x4 倍数选择器(强制 runCount=1,真实并发由 expandRuns 决定)
 * @param {Function} [spec.expandRuns]            把单次"点击运行"拆成 N 次迭代的扩展点。
 *                                                签名:({ mode, modeParams, collectedInputs, runCount }) =>
 *                                                  Array<{ modeParamsOverride?, collectedInputsOverride?, nodeName? }>
 *                                                通用层不感知具体 capability;缺省退化为 runCount 次完全一致的迭代。
 *                                                抛错时阻止提交并 toast 错误信息。
 */
export function registerCapability(spec) {
  const {
    id,
    nodeType,
    view,
    outputNode,
    outputPanel,
    cards,
    build,
    resolveContent,
    ...meta
  } = spec

  if (!id) throw new Error('[registerCapability] spec.id is required')
  if (!nodeType) throw new Error(`[registerCapability] spec.nodeType is required (id=${id})`)

  // Phase 5 lint: 强制每个 input/output 端口都声明 role 字段。
  // role 是公共契约 (见 docs/reference/port-role-convention.md), 缺失会让跨能力切换的
  // role 迁移函数 (migrateEdgesByRole) 直接判失败 → 用户体验是连线全部红虚线。在注册时
  // 阻止 silent failure, 让能力作者立即看到错误.
  validatePortRoles(id, meta.modes)

  CAPABILITIES[id] = { nodeType, ...meta }
  if (view) CAPABILITY_VIEWS[id] = view
  if (outputNode) CAPABILITY_OUTPUT_NODE_TYPES[`output-${id}`] = outputNode
  if (outputPanel) CAPABILITY_OUTPUT_PANELS[id] = outputPanel
  if (cards) {
    for (const [mode, loader] of Object.entries(cards)) {
      CAPABILITY_CARDS[`${id}/${mode}`] = loader
    }
  }
  if (build) {
    if (!CAPABILITY_BUILDERS[nodeType]) {
      throw new Error(`[registerCapability] unknown nodeType "${nodeType}" (id=${id})`)
    }
    CAPABILITY_BUILDERS[nodeType][id] = build
  }
  if (resolveContent) CAPABILITY_CONTENT_RESOLVERS[id] = resolveContent
}

function validatePortRoles(capabilityId, modes) {
  if (!modes || typeof modes !== 'object') return
  const errors = []
  for (const [modeId, modeDef] of Object.entries(modes)) {
    const inputs = Array.isArray(modeDef?.inputs) ? modeDef.inputs : []
    const outputs = Array.isArray(modeDef?.outputs) ? modeDef.outputs : []
    for (const port of inputs) {
      if (!port?.role) errors.push(`mode "${modeId}" input "${port?.id || '?'}" 缺 role`)
    }
    for (const port of outputs) {
      if (!port?.role) errors.push(`mode "${modeId}" output "${port?.id || '?'}" 缺 role`)
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[registerCapability] capability "${capabilityId}" 端口缺 role 字段:\n  - ${errors.join('\n  - ')}\n` +
      `按 docs/reference/port-role-convention.md §2 词典补 role + canAcceptRoles 字段; 不在词典里的 role 须先走 §4 PR 入册.`
    )
  }
}
