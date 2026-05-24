/**
 * 节点装饰带高度
 *
 * 节点卡片上下各有「装饰带」：
 * - 顶部：NodeMetaRow / FoldedNodeMeta — 通过 NodeToolbar (offset=2, 高度 22px) 浮在
 *   节点上方的 1× 平面 (viewport 外, 不随 zoom 缩放). 综合占位 ≈ 24px (2 + 22).
 * - 底部：TimerLabel（OutputNode 才有），CSS `bottom: -26px; height: 22px`，仍在节点
 *   DOM 内 (随 zoom 缩放).
 *
 * 这些装饰带在 React Flow 节点几何之外，但视觉上属于卡片。卡片堆叠时必须把它们算进间距。
 */
export const NODE_DECORATION_OVERHANG = 26

/** 卡片之间的"呼吸距离"（不含装饰带） */
export const CARD_BREATHING_GAP = 16

/**
 * 输出卡片堆叠间距 ≈ 前卡底部 TimerLabel(26) + 呼吸(16) + 新卡顶部 SeqBadge/NameLabel(26)
 * 用于 useRunCapability：连续运行同一能力时，输出节点纵向堆叠。
 */
export const OUTPUT_STACK_GAP = NODE_DECORATION_OVERHANG * 2 + CARD_BREATHING_GAP // 68

/**
 * 能力卡片堆叠间距
 *
 * 派生 / 复制后的新节点大概率会立刻被选中,选中态下节点上方会出现两层浮层
 * (均位于 viewport 外的 1× 平面, 不随 zoom 缩放):
 *   - 顶部 NodeMeta 行 (FoldedNodeMeta): NodeToolbar offset 2, 高度 22px → 占 24px
 *   - 选中态统一工具栏 (NodeToolbarPortal): NodeToolbar offset 26, 容器实测高 36px
 *     (padding 4×2 + border 1×2 + 按钮 26 = 36, 见 styles.css §node-toolbar) → 总撑 62px
 * 上一个节点底部还有 TimerLabel overhang (26px, 在 viewport 内, 随 zoom).
 *
 * 安全间距 = 上节点 TimerLabel(26) + 呼吸(16) + 选中工具栏总撑出(26+36=62) = 104
 *
 * 用于 deriveCapabilityNode (切换能力派生) 与右键"复制"派生新节点.
 */
export const CAPABILITY_STACK_GAP = 104

/**
 * 派生新能力节点的纵向间距(原能力节点正下方 +80px gap)
 *
 * 用于折叠形态下的派生场景: 重跑(节点已 Done 时点 Run) / 外部 batch (x2/x4):
 * 派生 1 个能力节点 + 1 个输出节点 + 1 条连线, 能力节点位于原节点下方 +80px,
 * 与原节点 x 对齐. 80px 是为新节点的选中工具栏 (节点上方 NodeToolbar offset 26 +
 * 工具栏高 ~30 + 留白 ~18 ≈ 74) 预留充足空间, 避免工具栏贴到上一个节点底边.
 */
export const DERIVE_VERTICAL_GAP = 80

/**
 * 节点尺寸档位(按内容类型) — V2 折叠节点 / 输入节点共享标准
 *
 * 初始尺寸: Ready / Running / Failed 状态 (产物未加载时的占位尺寸)
 * Done 状态: 宽度锁定档位(width 不变), 高度按产物宽高比自适应
 */
export const NODE_SIZE_PRESETS = {
  // 图片: 348 × 465 (Ready), Done 高 = 348 × (产物 h / 产物 w)
  image: {
    initial: { width: 348, height: 465 },
    lockedWidth: 348,
  },
  // 文本: 348 × 348 (Ready), Done 高在 [248, 600] 区间, 超过最大值时预览区内部滚动
  text: {
    initial: { width: 348, height: 348 },
    lockedWidth: 348,
    minPreviewHeight: 248,
    maxPreviewHeight: 600,
  },
  // 视频横档(主档): 620 × 348 (Ready), Done 高按产物宽高比
  'video-landscape': {
    initial: { width: 620, height: 348 },
    lockedWidth: 620,
  },
  // 视频竖档(副档): 348 × 620 (Ready), Done 高按产物宽高比
  'video-portrait': {
    initial: { width: 348, height: 620 },
    lockedWidth: 348,
  },
  // 音频: 348 × 146 固定(波形 + 时长, 无内容比例)
  audio: {
    initial: { width: 348, height: 146 },
    lockedWidth: 348,
    fixedHeight: 146,
  },
  // 文件: 348 × 348 固定(图标 + 文件名, 无内容比例)
  file: {
    initial: { width: 348, height: 348 },
    lockedWidth: 348,
    fixedHeight: 348,
  },
}

/**
 * 把"内容类型 + 比例参数"映射到尺寸档位 key
 *
 * 适用场景:
 * - 输入节点: subType ∈ {text, image, audio, video, file}; 视频档位由实际媒体宽高决定
 * - 折叠能力节点: 产物类型 ∈ {text, image, audio, video, file}; 视频档位由 mode 比例参数决定
 *
 * @param {'text'|'image'|'audio'|'video'|'file'} contentType - 内容类型
 * @param {object} [opts]
 * @param {boolean} [opts.portrait] - 视频是否竖档(width < height)。仅 contentType='video' 生效
 * @returns {keyof typeof NODE_SIZE_PRESETS}
 */
export function pickSizePresetKey(contentType, opts = {}) {
  if (contentType === 'video') {
    return opts.portrait ? 'video-portrait' : 'video-landscape'
  }
  if (contentType === 'image') return 'image'
  if (contentType === 'audio') return 'audio'
  if (contentType === 'file') return 'file'
  return 'text'
}

/**
 * 取初始尺寸(Ready / Running / Failed 状态)
 * @param {keyof typeof NODE_SIZE_PRESETS} key
 * @returns {{ width: number, height: number }}
 */
export function getInitialSize(key) {
  return NODE_SIZE_PRESETS[key]?.initial || NODE_SIZE_PRESETS.text.initial
}

/**
 * 计算 Done 态节点高度
 *
 * @param {keyof typeof NODE_SIZE_PRESETS} key - 档位
 * @param {object} [opts]
 * @param {number} [opts.assetWidth] - 产物像素宽(图片/视频)
 * @param {number} [opts.assetHeight] - 产物像素高(图片/视频)
 * @param {number} [opts.contentHeight] - 文本预览区实际内容高度(文本)
 * @returns {number} 节点总高(等于预览区高 + 非预览区固定开销, 由调用方按节点结构再加 chrome 高度)
 *                   说明: 此处直接返回"预览区"的目标高度; 节点壳的 header / footer 由各 view 自己叠加
 */
export function computeDoneHeight(key, opts = {}) {
  const preset = NODE_SIZE_PRESETS[key]
  if (!preset) return getInitialSize('text').height
  // 固定高度档位(音频/文件): 直接返回 fixedHeight
  if (preset.fixedHeight) return preset.fixedHeight
  // 文本档: 内容高度 clamp 到 [min, max]
  if (key === 'text') {
    const { contentHeight = preset.minPreviewHeight } = opts
    return Math.min(preset.maxPreviewHeight, Math.max(preset.minPreviewHeight, contentHeight))
  }
  // 图片 / 视频: 按产物宽高比算高度 = 档位宽 × (h / w)
  const { assetWidth, assetHeight } = opts
  if (assetWidth > 0 && assetHeight > 0) {
    return Math.round(preset.lockedWidth * (assetHeight / assetWidth))
  }
  return preset.initial.height
}
