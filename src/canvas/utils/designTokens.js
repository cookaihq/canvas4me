/**
 * AI Canvas 设计规范（Design Tokens）
 *
 * 对应文档：docs/design.md §2
 * 代码实现的唯一颜色标准
 */

// ─── 内容类型色 ───

export const CONTENT_TYPE_COLORS = {
  text:          '#0EA5E9',  // Sky-500     · tokens.css --ac-color-text
  image:         '#F97316',  // Orange-500  · tokens.css --ac-color-image
  audio:         '#10B981',  // Emerald-500 · tokens.css --ac-color-audio
  video:         '#F43F5E',  // Rose-500    · tokens.css --ac-color-video
  file:          '#94A3B8',  // Slate-400   · tokens.css --ac-color-file
  json:          '#14B8A6',  // Teal-500    · tokens.css --ac-color-json
  'llm-context': '#6366F1',  // Indigo-500  · tokens.css --ac-color-llm-context
  'music-style': '#10B981',  // 同 audio
  // 档案类(暖紫灰系) — 暗示"档案/引用"语义,与 image 系橙色明显区分
  'profile-id':  '#A89BB9',  // 偏紫(人物档案)
  'voice-id':    '#B8A89E',  // 偏棕(音色档案)
  'character-id':'#9E9BB8',  // 偏冷紫(角色档案)
}

/**
 * 获取内容类型对应的主色
 * @param {string} subType - 节点的 subType
 * @returns {string} 色值 hex
 */
export function getContentTypeColor(subType) {
  return CONTENT_TYPE_COLORS[subType] || '#9998B3'
}

/**
 * 获取内容类型对应的浅底色（10% 透明度）
 * @param {string} subType
 * @returns {string} 色值 hex with alpha
 */
export function getContentTypeBgColor(subType) {
  const color = getContentTypeColor(subType)
  return color + '1A'
}

// ─── 能力节点端口色 ───
// 端口颜色 = 该端口承载的内容类型色
// 端口 id 到内容类型的映射（常见端口名称）

const PORT_TYPE_MAP = {
  context: 'llm-context',
  'system-prompt': 'text',
  prompt:  'text',
  text:    'text',
  image:   'image',
  images:  'image',
  ref_image: 'image',
  first_frame: 'image',
  last_frame: 'image',
  audio:   'audio',
  music:   'audio',
  video:   'video',
  file:    'file',
  json:    'json',
  output:  null,   // 输出端口颜色由节点决定
}

/**
 * 根据端口 ID 获取端口颜色
 * @param {string} portId - 端口 ID
 * @param {string} [fallbackType] - 回退的内容类型
 * @returns {string} 色值 hex
 */
export function getPortColor(portId, fallbackType) {
  const contentType = PORT_TYPE_MAP[portId]
  if (contentType) return CONTENT_TYPE_COLORS[contentType]
  if (fallbackType) return getContentTypeColor(fallbackType)
  return '#6366F1' // 默认用 accent · tokens.css --ac-accent
}

// ─── 多输出端口垂直布局 ───
// 主端口 44px,之后每个副端口下移 36px(和 input 端口步进一致)

const OUTPUT_HANDLE_TOP_BASE = 44
const OUTPUT_HANDLE_TOP_STEP = 36

/**
 * 多输出端口的纵向位置(按 outputs 数组顺序)
 * @param {number} index - outputs 数组索引(0 = 主端口)
 * @returns {number} top 像素值
 */
export function getOutputHandleTop(index) {
  return OUTPUT_HANDLE_TOP_BASE + index * OUTPUT_HANDLE_TOP_STEP
}

// ─── 运行状态色 ───
// 统一状态枚举: Ready / Running / Polling / Streaming / Done / Failed
// 渲染层兼容旧值:
//   idle → Ready
//   running → Running
//   polling → Polling (从 Running 别名分离,获得独立呼吸动效)
//   streaming → Streaming (流式输出,横向流光动效)
//   validating → Running (submit 前 URL 探测瞬态,仍合并到 Running)
//   done → Done
//   error/transfer_failed → Failed

export const STATUS_COLORS = {
  // 新枚举(canonical) — 6 状态
  Ready:     '#94A3B8',  // 灰
  Running:   '#3B82F6',  // 蓝
  Polling:   '#06B6D4',  // 青 — 轮询中(呼吸)
  Streaming: '#06B6D4',  // 青 — 流式输出(流光)
  Done:      '#10B981',  // 绿 · tokens.css --ac-success
  Failed:    '#EF4444',  // 红

  // 旧枚举别名(向后兼容历史画布数据 + 部分尚未迁移的渲染分支)
  idle:    '#94A3B8',
  running: '#3B82F6',
  polling: '#06B6D4',     // 从 Running 分离 — 见上方注释
  streaming: '#06B6D4',
  validating: '#3B82F6',  // 提交前 URL 探测+自愈期间(短暂),视为 Running 子态
  done:    '#10B981',
  error:   '#EF4444',
  transfer_failed: '#EF4444',
}

/**
 * 将任意 runStatus 值规范化为六态枚举之一
 * @param {string|undefined|null} status - 节点的 runStatus
 * @returns {'Ready'|'Running'|'Polling'|'Streaming'|'Done'|'Failed'}
 */
export function normalizeRunStatus(status) {
  if (!status) return 'Ready'
  switch (status) {
    case 'Ready':
    case 'idle':
      return 'Ready'
    case 'Running':
    case 'running':
    case 'validating':
      return 'Running'
    case 'Polling':
    case 'polling':
      return 'Polling'
    case 'Streaming':
    case 'streaming':
      return 'Streaming'
    case 'Done':
    case 'done':
      return 'Done'
    case 'Failed':
    case 'error':
    case 'transfer_failed':
      return 'Failed'
    default:
      return 'Ready'
  }
}

/**
 * 获取 runStatus 对应的状态色(规范化后查表)
 * @param {string} status
 * @returns {string} hex
 */
export function getStatusColor(status) {
  const canonical = normalizeRunStatus(status)
  return STATUS_COLORS[canonical]
}
