import { NODE_TYPES, CAPABILITIES, CAPABILITY_CARDS, resolveModeId, isFoldedCapability, getCapabilityPrimaryOutput } from '../registry/nodeTypes'
import { resolveInitialParams } from './capabilityDefaults'
import { resolveInputs } from '../registry/resolveInputs'
import { isPreviewableFile } from './fileInfo'
import { CAPABILITY_STACK_GAP, getInitialSize, pickSizePresetKey } from '../constants/spacing'

export const PREVIEWABLE_FILE_HEIGHT = 450

let counter = 0

function genId(prefix) {
  counter++
  return `${prefix}-${Date.now()}-${counter}`
}

/**
 * 创建输入节点
 *
 * 尺寸档位(按内容类型, 详见 constants/spacing.js):
 *   text  → 348 × 348
 *   image → 348 × 465
 *   video → 620 × 348(横档, 默认) / 348 × 620(竖档, 由 extraData.portrait=true 决定)
 *   audio → 348 × 146
 *   file  → 348 × 348(可预览文件用 PREVIEWABLE_FILE_HEIGHT 覆盖)
 *
 * @param {'text'|'image'|'audio'|'video'|'file'} subType
 * @param {{ x: number, y: number }} position
 * @param {object} extraData - 可选的额外数据(portrait: 视频是否竖档)
 */
export function createInputNode(subType, position, extraData = {}) {
  const labels = {
    text: '文本',
    image: '图片',
    audio: '音频',
    video: '视频',
    file: '文件',
  }
  const presetKey = pickSizePresetKey(subType, { portrait: !!extraData?.portrait })
  let { width, height } = getInitialSize(presetKey)
  // 文件子类型：拿到可预览扩展时（pdf/image/video/audio），用更高的初始高度展示预览
  if (subType === 'file' && isPreviewableFile(extraData?.content)) {
    height = PREVIEWABLE_FILE_HEIGHT
  }
  // 把 portrait 标志从 extraData 中剥离, 不写入节点 data(只用于尺寸选档)
  const { portrait: _portrait, ...restExtra } = extraData
  return {
    id: genId('input'),
    type: 'input',
    position: { ...position },
    data: {
      subType,
      label: labels[subType] || '输入',
      content: {},
      locked: false,
      ...restExtra,
    },
    style: { width, height },
  }
}

/**
 * 创建能力节点
 * @param {string} nodeType - 'llm' | 'image' | 'video' | 'sound'
 * @param {{ x: number, y: number }} position
 * @param {string|null} capability - 预选的子能力
 */
// 未选子能力时，卡片展示 chip picker（CapabilityCardInitialPicker）。
// 初始高度按该能力类型下的子能力数量估算；视频类型较多，超出时 chip 列表内部滚动。
const INITIAL_HEIGHT_BY_NODE_TYPE = {
  llm:   200,  // 4 个 chip
  image: 260,  // 6 个 chip
  video: 300,  // 10 个 chip，内部可滚
  sound: 180,  // 3 个 chip
}

/**
 * 计算能力节点选中子能力后的合适高度，规则按渲染器类型区分：
 * - 三段式卡片（CAPABILITY_CARDS 有注册）：header 40 + footer 30 + 每个端口槽 ≈ 28px
 * - 水平 fallback 卡片（CapabilityCardRenderer）：单行基础 40 + 每个端口 30px 预留
 * 选中后用户仍可用 NodeResizer 手动调整。
 */
export function computeCapabilityCardHeight(capabilityId, modeId) {
  if (!capabilityId) return null
  const resolvedMode = resolveModeId(capabilityId, modeId)
  const inputCount = resolveInputs(capabilityId, resolvedMode).length
  const hasStructuredCard = Boolean(CAPABILITY_CARDS[`${capabilityId}/${resolvedMode}`])
  if (hasStructuredCard) {
    return Math.max(176, 70 + (inputCount + 1) * 28)
  }
  return Math.max(100, 40 + inputCount * 30)
}

/**
 * 为折叠能力节点创建常驻 output 节点 + 能力节点→output 的 internal 边(idle 空产物)。
 *
 * 折叠能力节点"创建即带 output",三者(能力节点 + output + internal 边)始终成对存在,
 * 消除"创建到运行之间没有 output 可连"的窗口期 —— 拉线时 onConnect 必能找到 internal 边
 * 改写连接源,从根上杜绝 source=能力节点 的坏边。
 *
 * output 与运行后的 output 同结构(参见 useRunCapability 的输出节点),只是缺运行态字段
 * (extraTaskId / runStatus 等);runStatus 缺省经 normalizeRunStatus 归一为 Ready。
 *
 * @param {object} capabilityNode 已构造好的折叠能力节点(含 id / position / style / data)
 * @returns {{ outputNode: object, internalEdge: object } | null} 主输出缺失时返回 null
 */
export function createFoldedOutputNode(capabilityNode) {
  const { capability, mode: rawMode, nodeType } = capabilityNode.data
  const mode = resolveModeId(capability, rawMode)
  const primaryOutput = getCapabilityPrimaryOutput(capability, mode)
  if (!primaryOutput) return null
  const capDef = CAPABILITIES[capability]
  const isLlm = nodeType === 'llm'
  const outputId = genId('output')
  const capWidth = typeof capabilityNode.style?.width === 'number'
    ? capabilityNode.style.width
    : parseFloat(capabilityNode.style?.width) || 220
  const outputNode = {
    id: outputId,
    type: `output-${capability}`,
    position: {
      x: capabilityNode.position.x + capWidth + 200,
      y: capabilityNode.position.y,
    },
    data: {
      subType: primaryOutput.type || 'text',
      renderer: primaryOutput.renderer || null,
      label: `${capDef?.label || ''} 输出`,
      content: isLlm ? { text: '' } : {},
      locked: false,
      // sourceCapabilityId 是输出节点反查"宿主能力节点"的结构化依据(老画布用 sourceAbilityId)
      sourceCapabilityId: capabilityNode.id,
      sourceCapability: capability,
      sourceMode: mode,
      autoPositioned: true,
    },
    style: {
      width: isLlm ? 300 : 200,
      height: isLlm ? 200 : (primaryOutput.type === 'audio' ? 100 : 160),
    },
  }
  const internalEdge = {
    id: `edge-${capabilityNode.id}-${outputId}`,
    source: capabilityNode.id,
    sourceHandle: primaryOutput.id,
    target: outputId,
    targetHandle: 'input',
    type: 'custom',
  }
  return { outputNode, internalEdge }
}

/**
 * 折叠能力节点的 capability 原地变更后,把它的常驻 output「改型」对齐新 capability。
 *
 * 保留 output 节点 id(从而保住下游已连的边),只换 type / 渲染相关 data / 重置 content,
 * 并返回 internal 边应使用的 sourceHandle(新 capability 的主输出端口 id)。调用方据此
 * 在 facade 里替换 output 节点、改写 internal 边的 sourceHandle。
 *
 * @param {object} outputNode  现有常驻 output 节点
 * @param {string} capability  新 capability id
 * @param {string} mode        新 mode(经 resolveModeId 归一)
 * @param {string} [nodeType]  能力大类(llm 的空产物用 { text: '' })
 * @returns {{ outputNode: object, sourceHandle: string } | null} 新 cap 无主输出时返回 null
 */
export function retargetFoldedOutputNode(outputNode, capability, mode, nodeType) {
  const resolvedMode = resolveModeId(capability, mode)
  const primaryOutput = getCapabilityPrimaryOutput(capability, resolvedMode)
  if (!primaryOutput) return null
  const capDef = CAPABILITIES[capability]
  const isLlm = nodeType === 'llm'
  return {
    outputNode: {
      ...outputNode,
      type: `output-${capability}`,
      data: {
        ...outputNode.data,
        subType: primaryOutput.type || 'text',
        renderer: primaryOutput.renderer || null,
        label: `${capDef?.label || ''} 输出`,
        content: isLlm ? { text: '' } : {},
        sourceCapability: capability,
        sourceMode: resolvedMode,
      },
    },
    sourceHandle: primaryOutput.id,
  }
}

/**
 * 创建能力节点
 *
 * @param {string} nodeType - 'llm' | 'image' | 'video' | 'sound'
 * @param {{ x: number, y: number }} position
 * @param {string|null} capability - 预选的子能力
 * @param {object} [opts]
 * @param {string} [opts.mode]
 *        预选 mode（仅 capability 非空时生效）。未传或传入无效 mode 时回退到 capability 的 defaultMode。
 *        用于"按上次记忆/缓存恢复"等场景，让创建方显式指定 mode 而非总用 defaultMode。
 * @param {'text'|'image'|'video'|'audio'|'file'} [opts.productType]
 *        折叠态产物类型: 传入时按内容类型分档(图 348×465 / 文 348×348 / 视频横 620×348 等);
 *        不传时优先读 capability registry 的 productType 字段;
 *        都没有 → 沿用 220 宽 + 输入端口数估高的紧凑形态
 * @param {boolean} [opts.portrait] - 视频产物是否竖档(仅 productType='video' 时生效)
 */
export function createCapabilityNode(nodeType, position, capability = null, opts = {}) {
  const typeInfo = NODE_TYPES.find(t => t.id === nodeType)
  // 预选 capability 时，mode 优先取 opts.mode（若有效），否则回退到 defaultMode；未选 capability 时 mode=null
  let mode = null
  if (capability) {
    const capDef = CAPABILITIES[capability]
    const optMode = opts.mode && capDef?.modes?.[opts.mode] ? opts.mode : null
    mode = optMode || capDef?.defaultMode || null
  }

  // productType 来源: opts 显式传入 优先, 否则读 capability registry 上的声明
  // (折叠形态 capability 在 register.js 里通过 `productType: 'image'` 等声明)
  const productType = opts.productType || (capability ? CAPABILITIES[capability]?.productType : null)

  // 尺寸档位选择:
  // - productType 非空 → 走 NODE_SIZE_PRESETS(折叠态能力节点共享输入节点档位)
  // - 否则 → 沿用紧凑能力节点逻辑(220 宽 + 按输入端口数估高 / chip picker 预估)
  let width, height
  if (productType) {
    const presetKey = pickSizePresetKey(productType, { portrait: !!opts.portrait })
    const initial = getInitialSize(presetKey)
    width = initial.width
    height = initial.height
  } else {
    width = 220
    height = capability
      ? computeCapabilityCardHeight(capability, mode)
      : INITIAL_HEIGHT_BY_NODE_TYPE[nodeType] || 200
  }

  const capabilityNode = {
    id: genId('capability'),
    type: 'capability',
    position: { ...position },
    data: {
      nodeType,
      capability,
      mode,
      label: typeInfo?.label || nodeType,
      // 表单参数：按 mode 分桶存储。切 mode 无损（每个 mode 自有一套 params）
      // 当前 mode 桶用 resolveInitialParams 初始化:
      //   commonParams.defaultValue 兜底 + 上次该 (cap, mode) 用过的参数缓存覆盖 (prompt 不缓存)
      modeParams: capability && mode
        ? { [mode]: resolveInitialParams(capability, mode) }
        : {},
      // 端口连线快照：按端口 id 分桶存储。跨 mode 按 id + accept + multiple 匹配共享。
      // 单值端口：{ [handle]: { source, sourceHandle } }
      // 多值端口（multiple:true）：{ [handle]: [{ source, sourceHandle }, ...] }
      portConnections: {},
      // runStatus 保留旧值('idle')以兼容现有写入路径(useRunCapability / index.jsx 等)
      // 渲染时由 normalizeRunStatus() 统一映射到四态(Ready/Running/Done/Failed)
      runStatus: 'idle',
      locked: false,
      lastRunSnapshot: null,     // 参数快照（首次进 running 时拍）
      userTouched: {},           // 用户编辑过的字段标记 per-mode (markUserTouched 写入)
    },
    style: { width, height },
  }

  // 折叠能力(registry 声明 productType / form:'folded'): 创建即配上常驻 output + internal 边。
  // 调用方统一按 { nodes, edges } 处理(非折叠时 edges 为空)。
  if (capability && isFoldedCapability(capability)) {
    const pair = createFoldedOutputNode(capabilityNode)
    if (pair) return { nodes: [capabilityNode, pair.outputNode], edges: [pair.internalEdge] }
  }
  return { nodes: [capabilityNode], edges: [] }
}

/**
 * 基于一个已运行的能力节点，派生一个全新的能力节点。
 *
 * 两种使用场景：
 *
 * 1. 切换能力派生（CapabilityPanel 切 capability）：
 *    传 newCapability 与原节点不同, 新节点用 defaultMode + 空 params.
 *
 * 2. 折叠形态重跑 / 外部 batch 派生：
 *    传 opts.preserveParams = true, 保留原节点的 capability / mode / modeParams / portConnections,
 *    生成一个"克隆"能力节点用于再跑一次. newCapability 此时通常 = 原 capability.
 *
 * 新节点：
 *   - 同 nodeType（否则换能力大类应走画布新建，不走派生）
 *   - 默认 capability = newCapability, mode = 该 capability 的 defaultMode, 空 modeParams
 *   - preserveParams=true 时 capability/mode/modeParams/portConnections 全部复制源节点
 *   - 位置：原节点正下方, 默认间距 CAPABILITY_STACK_GAP（切能力场景）
 *     或 DERIVE_VERTICAL_GAP（折叠重跑场景, 由调用方传入 opts.gap）
 *
 * @param {object} sourceNode     画布上的源能力节点
 * @param {string} newCapability  新选中的子能力 id (preserveParams=true 时通常 = 原 capability)
 * @param {object} [opts]
 * @param {number} [opts.gap]     与源节点下边缘的纵向间距（默认 CAPABILITY_STACK_GAP）
 * @param {boolean} [opts.preserveParams]
 *                                true 时保留源节点 mode / modeParams / portConnections
 *                                (用于折叠形态重跑或 batch 派生); false 时 mode = defaultMode、空 params
 */
// TODO: 老画布兼容 data.nodeType ?? data.abilityType 下个迭代加一次性迁移脚本后移除
//       读取点：CapabilityPanel/NodePanel/CapabilityNode/CapabilityCardRenderer/useRunCapability/deriveCapabilityNode
export function deriveCapabilityNode(sourceNode, newCapability, opts = {}) {
  const { gap = CAPABILITY_STACK_GAP, preserveParams = false } = opts
  const nodeType = sourceNode?.data?.nodeType ?? sourceNode?.data?.abilityType
  const typeInfo = NODE_TYPES.find(t => t.id === nodeType)
  const mode = preserveParams
    ? (sourceNode?.data?.mode ?? CAPABILITIES[newCapability]?.defaultMode ?? null)
    : (CAPABILITIES[newCapability]?.defaultMode ?? null)

  // 折叠形态 capability(registry 上声明 productType): 派生节点的初始尺寸走档位,
  // 不要用 computeCapabilityCardHeight (那个按输入端口数估高, 适用紧凑能力节点)
  const productType = CAPABILITIES[newCapability]?.productType || null
  let height
  if (productType) {
    const presetKey = pickSizePresetKey(productType)
    height = getInitialSize(presetKey).height
  } else {
    height = computeCapabilityCardHeight(newCapability, mode) ||
      INITIAL_HEIGHT_BY_NODE_TYPE[nodeType] || 200
  }

  // 优先用 React Flow 实测高度 — done 能力节点含折叠输出图片预览,
  // 实测高度远大于 style.height (后者只是节点本体的 200/465 等档位值)。
  // React Flow 12 实测高度写在 outer node 顶层 height 字段 (InternalNode 在 measured.height),
  // 两个都兜底; 用实测高度才能让派生节点真正落在视觉底部之下而非重叠。
  const measuredH = typeof sourceNode?.measured?.height === 'number' ? sourceNode.measured.height
    : typeof sourceNode?.height === 'number' ? sourceNode.height
    : null
  const sourceRawH = sourceNode?.style?.height
  const styleH = typeof sourceRawH === 'number' ? sourceRawH : parseFloat(sourceRawH) || 200
  const sourceH = measuredH || styleH
  const sourceX = sourceNode?.position?.x || 0
  const sourceY = sourceNode?.position?.y || 0
  const sourceRawW = sourceNode?.style?.width
  const sourceW = typeof sourceRawW === 'number' ? sourceRawW : parseFloat(sourceRawW) || 220

  // preserveParams: 深拷贝 modeParams / portConnections 防止误共享引用
  // 否则: 新桶用 resolveInitialParams 初始化 (defaults + 上次缓存)
  const modeParams = preserveParams
    ? JSON.parse(JSON.stringify(sourceNode?.data?.modeParams || {}))
    : (newCapability && mode ? { [mode]: resolveInitialParams(newCapability, mode) } : {})
  const portConnections = preserveParams
    ? JSON.parse(JSON.stringify(sourceNode?.data?.portConnections || {}))
    : {}

  const derivedNode = {
    id: genId('capability'),
    type: 'capability',
    position: { x: sourceX, y: sourceY + sourceH + gap },
    data: {
      nodeType,
      capability: newCapability,
      mode,
      label: typeInfo?.label || nodeType,
      modeParams,
      portConnections,
      runStatus: 'idle',
      locked: false,
      lastRunSnapshot: null,     // 参数快照（首次进 running 时拍）
      userTouched: {},           // 用户编辑过的字段标记 per-mode (markUserTouched 写入)
    },
    style: { width: sourceW, height },
  }

  // 折叠能力: 派生节点同样成对带 output + internal 边(与 createCapabilityNode 一致)。
  if (isFoldedCapability(newCapability)) {
    const pair = createFoldedOutputNode(derivedNode)
    if (pair) return { nodes: [derivedNode, pair.outputNode], edges: [pair.internalEdge] }
  }
  return { nodes: [derivedNode], edges: [] }
}

/**
 * 创建备注节点
 * @param {{ x: number, y: number }} position
 */
export function createNoteNode(position) {
  return {
    id: genId('note'),
    type: 'note',
    position: { ...position },
    data: {
      text: '',
      color: '#fffbe6',
    },
    style: { width: 200, height: 120 },
  }
}
