import { memo, useEffect, useMemo, useRef } from 'react'
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { useCanvasFacade } from '../../state/canvasFacade'
import useCanvasPanThrough from '../../hooks/useCanvasPanThrough'
import { getContentRenderer } from '../../registry/renderers'
import { getContentTypeColor } from '../../utils/designTokens'
import { NODE_SIZE_PRESETS } from '../../constants/spacing'
import { formatMediaMeta } from '../../utils/mediaMeta'
import NodeMetaRow from '../NodeMetaRow'

const ASPECT_LOCK_SUBTYPES = new Set(['image', 'video'])
// 选中时让节点内 overflow:auto 容器（文本、PDF 缩略图）遵循统一滚轮契约：
// 未触底→滚内容 / 触底缓冲→转画布 pan（useCanvasPanThrough）。
// 未选中或非这些子类型时保持画布缩放。
const SCROLLABLE_SUBTYPES = new Set(['text', 'file'])

const SUB_TYPE_LABELS = {
  text: '文本',
  image: '图片',
  audio: '音频',
  video: '视频',
  file: '文件',
  'llm-context': '对话上下文',
  json: 'JSON',
}

/**
 * 输入节点壳组件
 * - 顶部细色条 = 内容类型色（通过 CSS 变量 --type-color）
 * - 右侧输出端口颜色 = 内容类型色（通过 CSS 变量 --port-color）
 * - 端口圆心距卡顶 44px，贴右边缘
 * - NodeResizer 支持拖拽调整大小（初始 255px 宽）
 * - 类型标签仅在 hover 时显示
 * - 根据 data.subType 分发到对应渲染器
 */
function InputNode({ id, data, selected }) {
  const ContentRenderer = getContentRenderer(data)
  const label = data.label || SUB_TYPE_LABELS[data.subType] || '输入'
  const typeColor = getContentTypeColor(data.subType)
  const aspectLock = ASPECT_LOCK_SUBTYPES.has(data.subType)

  // 选中 + 可滚动子类型时, 给节点本体挂滚轮穿透契约 (触底缓冲→转画布 pan);
  // 未选中时不挂, 滚轮照旧驱动画布缩放/平移. hook 会自管 .nowheel class 的增删.
  const panThroughRef = useCanvasPanThrough()
  const scrollPanThrough = selected && SCROLLABLE_SUBTYPES.has(data.subType)

  // 节点操作栏 (含装饰层注入的额外按钮如"加入素材库") 由 NodeToolbarPortal 在选中态统一渲染.

  // NodeMetaRow info 段: 图片/视频显示分辨率·大小, 音频/文件显示时长/大小,
  // 文本节点显示字数 (非空白字符数, 格式 "N 字").
  // 媒体元数据由 ImageRenderer/VideoRenderer 在加载完成后回写到 data._mediaWidth/_mediaHeight
  // /_mediaDuration/_mediaFileSize, 这里读出格式化为 info 文本.
  const metaInfo = useMemo(
    () => formatMetaInfo(data.subType, data),
    [data.subType, data._mediaWidth, data._mediaHeight, data._mediaDuration, data._mediaFileSize, data.content?.text]
  )

  // Handle id = data.subType(见下方 Handle 渲染)。老版本硬编码 id="output"改成按
  // subType 动态后,对已经挂载过的节点,React Flow 内部 handleBounds 可能还记着旧 id,
  // 导致连线时通过 DOM 找不到 handle。subType 变化时主动通知重测。
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, data.subType, updateNodeInternals])

  // 图片/视频节点：加载后按原始比例调整节点高度（每个 url 仅同步一次）
  // 视频节点额外: 检测竖横档, 把节点 width 切到正确档位 (横档 620 / 竖档 348),
  // 详见 docs/archive/20260501-folded-ability-node.md §3.2.1 + spacing.js NODE_SIZE_PRESETS
  const { getNode } = useReactFlow()
  const facade = useCanvasFacade()
  const syncedUrlRef = useRef(null)
  const assetUrl = aspectLock ? data.content?.url : null
  const isVideo = data.subType === 'video'
  useEffect(() => {
    if (!assetUrl) return
    if (syncedUrlRef.current === assetUrl) return

    const applyRatio = (w, h) => {
      if (!w || !h) return
      const node = getNode(id)
      if (!node) return
      // 视频: 按宽高比挑档 (横/竖), 把宽度切到对应档位; 其他类型沿用现有 width 不动
      let targetWidth
      if (isVideo) {
        const portrait = h > w
        targetWidth = portrait
          ? NODE_SIZE_PRESETS['video-portrait'].lockedWidth
          : NODE_SIZE_PRESETS['video-landscape'].lockedWidth
      } else {
        const rawW = node.style?.width
        targetWidth = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 348
      }
      // 不取整: Chrome 支持亚像素布局, 浮点高度让节点比例严格 = 图片比例,
      // object-fit:contain 才能 0 白边贴边 (Math.round 会引入 0.2px 比例偏差 → 1.8px 白边).
      const nextHeight = targetWidth * (h / w)
      syncedUrlRef.current = assetUrl
      facade.batchUpdateNodes((nodes) => nodes.map((n) =>
        n.id === id ? { ...n, style: { ...n.style, width: targetWidth, height: nextHeight } } : n
      ))
    }

    if (isVideo) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => applyRatio(v.videoWidth, v.videoHeight)
      v.src = assetUrl
    } else {
      const img = new Image()
      img.onload = () => applyRatio(img.naturalWidth, img.naturalHeight)
      img.src = assetUrl
    }
  }, [assetUrl, id, getNode, facade, isVideo])

  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        keepAspectRatio={aspectLock}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      {/* NodeMetaRow: #序号 + 节点名 + 文件元数据 (info), 统一外挂在节点上方.
          name 兜底为空字符串而非 undefined: NodeMetaName 内部对空字符串显示"未命名"
          italic 占位 (编辑模式可点编辑, 只读模式自动隐藏); 而 undefined 会被 NodeMetaRow
          整段跳过 (note 那种"根本没 name 概念"的节点用法). */}
      <NodeMetaRow nodeId={id} name={data.name || ''} info={metaInfo} />

      <div
        ref={scrollPanThrough ? panThroughRef : undefined}
        className={[
          'input-node',
          selected && 'selected',
        ].filter(Boolean).join(' ')}
        style={{ '--type-color': typeColor }}
        data-subtype={data.subType}
        data-loaded={aspectLock && data._mediaWidth > 0 ? 'true' : undefined}
      >
        {/* 悬浮显示的类型标签 */}
        <div className="input-node-hover-label">{label}</div>

        {/* 内容区域 */}
        <div className="input-node-content">
          <ContentRenderer data={data} nodeId={id} />
        </div>
      </div>

      {/* 右侧输出端口 — id = subType(约定:source handle id 等于 type),圆心距顶 44px */}
      <Handle
        type="source"
        position={Position.Right}
        id={data.subType}
        className="node-handle node-handle-output"
        style={{ '--port-color': typeColor, top: '44px' }}
      />
    </>
  )
}

/**
 * 文件元数据 → meta 行 info 文本
 * - 图片/视频: `1920×1080 · 12.4 M`
 * - 音频: `00:06 · 421 K` (有大小时附加)
 * - 文件: `1.2 M`
 * - 文本: `N 字` (非空白字符数; 空文本不展示)
 * - 其他 subType (json/llm-context): 不展示 (null)
 */
function formatMetaInfo(subType, data) {
  if (subType === 'text') {
    const text = data?.content?.text || ''
    const count = text.replace(/\s/g, '').length
    return count > 0 ? `${count} 字` : null
  }
  return formatMediaMeta(subType, {
    width: data?._mediaWidth,
    height: data?._mediaHeight,
    fileSize: data?._mediaFileSize,
    duration: data?._mediaDuration,
  })
}

export default memo(InputNode)
