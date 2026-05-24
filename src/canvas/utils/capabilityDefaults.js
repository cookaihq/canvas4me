/**
 * 能力节点初始 capability / mode / 表单参数 的解析与缓存
 *
 * 三类缓存（全部 localStorage）：
 *   - last-capability:{nodeType}        → 该 nodeType 上次用的 capability id
 *   - last-mode:{capability}            → 该 capability 上次用的 mode id（mode 跟着 capability 走）
 *   - last-params:{capability}:{mode}   → 上次在该 (cap, mode) 下用过的表单参数（不含 prompt）
 *
 * capability 解析三层兜底：
 *   1) localStorage 上次用的 (capability, mode)
 *   2) .env 配置的默认 capability（mode 取该 capability 的 defaultMode）
 *   3) 都拿不到 → (null, null)，节点落到 chip picker 形态由用户自选
 *
 * 表单参数缓存（getCachedParams / setCachedParams / resolveInitialParams）：
 *   - 写入时机：DockedPanel.handleParamsChange 即时写入(每次 onParamsChange 触发都写)
 *   - 排除字段：prompt 永不缓存(避免下次新建节点带出陈旧文本)
 *   - 读出时机：新建节点 / 派生节点 / 切 capability / 切 mode 等所有「需要初始化 mode 桶」的场景
 *
 * 详见 docs/reference/panel-params-cache.md。
 */
import { CAPABILITIES, resolveModeId } from '../registry/nodeTypes'
import { extractModeDefaults } from '../registry/extractModeDefaults'

const LAST_CAP_KEY = (nodeType) => `ai-canvas:last-capability:${nodeType}`
const LAST_MODE_KEY = (capability) => `ai-canvas:last-mode:${capability}`
const LAST_PARAMS_KEY = (capability, mode) => `ai-canvas:last-params:${capability}:${mode}`

const ENV_DEFAULTS_BY_NODE_TYPE = {
  llm: import.meta.env.VITE_DEFAULT_CAPABILITY_LLM,
  image: import.meta.env.VITE_DEFAULT_CAPABILITY_IMAGE,
  video: import.meta.env.VITE_DEFAULT_CAPABILITY_VIDEO,
  sound: import.meta.env.VITE_DEFAULT_CAPABILITY_SOUND,
  tool: import.meta.env.VITE_DEFAULT_CAPABILITY_TOOL,
}

function safeRead(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeWrite(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 配额等失败时静默忽略 */
  }
}

function isCapabilityValid(capabilityId, nodeType) {
  if (!capabilityId) return false
  const cap = CAPABILITIES[capabilityId]
  if (!cap) return false
  if (nodeType && cap.nodeType !== nodeType) return false
  return true
}

function isModeValid(capabilityId, modeId) {
  if (!capabilityId || !modeId) return false
  return Boolean(CAPABILITIES[capabilityId]?.modes?.[modeId])
}

export function getCachedCapability(nodeType) {
  const v = safeRead(LAST_CAP_KEY(nodeType))
  return isCapabilityValid(v, nodeType) ? v : null
}

export function getCachedMode(capability) {
  const v = safeRead(LAST_MODE_KEY(capability))
  return isModeValid(capability, v) ? v : null
}

export function setCachedCapability(nodeType, capability) {
  if (!isCapabilityValid(capability, nodeType)) return
  safeWrite(LAST_CAP_KEY(nodeType), capability)
}

export function setCachedMode(capability, mode) {
  if (!isModeValid(capability, mode)) return
  safeWrite(LAST_MODE_KEY(capability), mode)
}

// ── 表单参数缓存（per capability + mode） ─────────────────────────────

function safeJsonParse(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 读取指定 (capability, mode) 上次的表单参数缓存（不含 prompt）。
 * 返回普通对象；无缓存或解析失败时返回 null。
 */
export function getCachedParams(capability, mode) {
  if (!capability || !mode) return null
  const parsed = safeJsonParse(safeRead(LAST_PARAMS_KEY(capability, mode)))
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
}

/**
 * 写入指定 (capability, mode) 的表单参数缓存。
 * - 总是剥离 prompt 字段(避免下次新建节点带出陈旧文本)
 * - 剩余字段为空时不写入(没必要占 key)
 * - 序列化失败(循环引用等)静默忽略
 */
export function setCachedParams(capability, mode, params) {
  if (!capability || !mode || !params || typeof params !== 'object') return
  const { prompt: _drop, ...rest } = params
  if (Object.keys(rest).length === 0) return
  try {
    safeWrite(LAST_PARAMS_KEY(capability, mode), JSON.stringify(rest))
  } catch {
    /* 循环引用等序列化失败 → 静默忽略 */
  }
}

/**
 * 解析「新建一个 mode 桶」时该桶的初始参数。
 *
 * 合并顺序（后者覆盖前者）：
 *   1) extractModeDefaults — registry 声明的 commonParams.defaultValue
 *   2) getCachedParams      — 用户上次在该 (cap, mode) 下用过的参数（不含 prompt）
 *
 * 用于以下需要初始化 mode 桶的场景：
 *   - 新建能力节点 (nodeFactory.createCapabilityNode)
 *   - 派生能力节点 (nodeFactory.deriveCapabilityNode, !preserveParams)
 *   - 初始 chip picker 选中 capability (CapabilityCardInitialPicker)
 *   - 面板里切 capability 原地替换 (CapabilityPanel / DockedPanel)
 *   - 面板里切到一个新的 mode (DockedPanel.handleModeChange)
 *
 * 数据库迁移 (migrateCapabilityNodes) 不走此函数 —— 老数据修复只用 registry defaults，
 * 不应被用户最近一次操作的缓存污染。
 */
export function resolveInitialParams(capability, mode) {
  const defaults = extractModeDefaults(capability, mode)
  const cached = getCachedParams(capability, mode)
  return cached ? { ...defaults, ...cached } : defaults
}

/**
 * 解析新建能力节点的初始 (capability, mode)。
 * @param {'llm'|'image'|'video'|'sound'} nodeType
 * @returns {{ capability: string|null, mode: string|null }}
 */
export function resolveInitialCapability(nodeType) {
  // 1) 缓存
  const cached = getCachedCapability(nodeType)
  if (cached) {
    const cachedMode = getCachedMode(cached) || resolveModeId(cached, null)
    return { capability: cached, mode: cachedMode }
  }
  // 2) .env 默认
  const envDefault = ENV_DEFAULTS_BY_NODE_TYPE[nodeType]
  if (isCapabilityValid(envDefault, nodeType)) {
    return { capability: envDefault, mode: resolveModeId(envDefault, null) }
  }
  // 3) picker 形态
  return { capability: null, mode: null }
}
