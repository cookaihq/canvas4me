/**
 * 节点选中态统一工具栏分发器 — 见 docs/ui-standards/components-canvas.html#node-overlays
 *
 * 选中节点上方居中浮一个统一 NodeToolbar, 内部按职责分 3 组, 竖线分隔:
 *   1. debug 组   — selected + debugMode + !browseMode → Code2 "查看节点数据"
 *   2. actions 组 — selected (任何节点)               → 装饰层 extras / NoteNode 颜色 / Copy / Delete
 *   3. media 组   — selected + 节点承载 image/video 产物 → Maximize2 / Download / debug "输出"
 *
 * 任意一组无可见按钮 → 该组不渲染. 3 组都无 → 整个工具栏不渲染.
 *
 * 替换了三个旧文件 (NodeActionBar.jsx / MediaToolbarPortal.jsx / NodeSelectionToolbarPortal.jsx),
 * 也把 InputNode / CapabilityNode / NoteNode / 各 OutputNode 内自挂的
 * <NodeActionBar> 收口到本组件统一渲染.
 */
import { memo, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { NodeToolbar, Position, useReactFlow } from '@xyflow/react'
import { useCanvasFacade } from '../state/canvasFacade'
import { useStoreNodes, useStoreEdges } from '../state/canvasDerived'
import { Tooltip, message } from 'antd'
import { Code2, Copy, ClipboardType, Trash2, Upload, Loader2 } from '@/canvas/icons'
import { NodeActionExtrasContext } from '../contexts/NodeActionExtrasContext'
import useBrowseMode from '../hooks/useBrowseMode'
import useDebugMode from '../hooks/useDebugMode'
import useContentUpload from '../hooks/useContentUpload'
import { CAPABILITY_STACK_GAP } from '../constants/spacing'
import NodeDataModal from './debug/NodeDataModal'
import MediaPreviewToolbar from './nodes/MediaPreviewToolbar'
import { resolveMediaContext } from './nodes/resolveMediaContext'
import { resolveCopyableText } from './nodes/resolveTextContext'

const NOTE_COLOR_PRESETS = ['#fffbe6', '#f6ffed', '#e6f7ff', '#fff0f6', '#f9f0ff', '#fff7e6']
const DEFAULT_NOTE_COLOR = '#fffbe6'

// 媒体输入节点的"上传/替换"配置: 文件选择器 accept + 文案名词
// (file 子类型不限类型, accept 留空)
const MEDIA_UPLOAD_CONFIG = {
  image: { accept: 'image/*', noun: '图片' },
  video: { accept: 'video/*', noun: '视频' },
  audio: { accept: 'audio/*', noun: '音频' },
  file: { accept: '', noun: '文件' },
}

// NodeMetaRow / FoldedNodeMeta 直接挂在节点 DOM 内 (top:-24, 反向缩放到 1× 视觉大小),
// meta 顶边离节点顶边恒 24px (zoom>=0.5). 本选中态工具栏 (NodeToolbar, 1× 平面) 底边
// 再上抬 2px (--ac-space-1) 浮在 meta 之上:
//   offset = meta 顶边离节点(24) + 呼吸(2) = 26.
// 详见 docs/ui-standards/components-canvas.html#node-overlays.
const TOOLBAR_OFFSET = 26

function NodeToolbarPortal({ nodeZCounterRef }) {
  // 全量 nodes/edges 从 store 响应式读取 — 媒体识别 (resolveMediaContext) 需要
  // 沿能力节点 → 下游 outputNode 拿产物 url(折叠态 outputNode 也在其中)
  const nodes = useStoreNodes()
  const edges = useStoreEdges()
  const browseMode = useBrowseMode()
  const debugMode = useDebugMode()

  // 弹出 Modal 的目标节点 id (debug 段"查看节点数据"按钮触发)
  const [modalNodeId, setModalNodeId] = useState(null)
  // 备注节点颜色面板当前打开的 nodeId (同时只允许打开一个 — 点新的自动关旧的)
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)

  const closeModal = useCallback(() => setModalNodeId(null), [])

  const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes])
  const modalNode = useMemo(
    () => (modalNodeId ? nodes.find(n => n.id === modalNodeId) : null),
    [modalNodeId, nodes],
  )

  // 给媒体识别用的节点索引 — 在 selectedNodes 里 hoist 出来一次, 不每个节点重建
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  return (
    <>
      {selectedNodes.map(node => (
        <NodeToolbarRow
          key={node.id}
          node={node}
          nodeById={nodeById}
          edges={edges}
          browseMode={browseMode}
          debugMode={debugMode}
          colorPickerOpenId={colorPickerOpenId}
          setColorPickerOpenId={setColorPickerOpenId}
          onOpenDataModal={setModalNodeId}
          nodeZCounterRef={nodeZCounterRef}
        />
      ))}

      <NodeDataModal
        open={!!modalNode}
        onClose={closeModal}
        node={modalNode}
        allNodes={nodes}
        allEdges={edges}
      />
    </>
  )
}

/**
 * 单个 selected 节点的工具栏行 — 装配 3 组按钮 + 控制空组隐藏.
 */
function NodeToolbarRow({
  node,
  nodeById,
  edges,
  browseMode,
  debugMode,
  colorPickerOpenId,
  setColorPickerOpenId,
  onOpenDataModal,
  nodeZCounterRef,
}) {
  const { deleteElements, getNode, getNodes, updateNodeData } = useReactFlow()
  const facade = useCanvasFacade()
  const renderExtras = useContext(NodeActionExtrasContext)

  const nodeId = node.id

  // ─── actions 段: 媒体输入节点的上传/替换 ───
  // 内容入口收口在工具栏: 选中媒体输入节点即可上传(空)/替换(已有内容)
  const { handleFile, uploading: contentUploading } = useContentUpload(nodeId)
  const fileInputRef = useRef(null)
  const uploadCfg = node.type === 'input' && !node.data?.locked
    ? MEDIA_UPLOAD_CONFIG[node.data?.subType]
    : null
  const hasContent = !!(node.data?.content?.url || node.data?.content?.localPreviewUrl)
  const uploadLabel = uploadCfg ? `${hasContent ? '替换' : '上传'}${uploadCfg.noun}` : ''

  const handleUploadBtnClick = useCallback((e) => {
    e.stopPropagation()
    if (contentUploading) return
    fileInputRef.current?.click()
  }, [contentUploading])

  const handleFileInputChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = '' // 允许再次选同一文件
  }, [handleFile])

  // ─── debug 段 ───
  const showDebug = !browseMode && debugMode

  // ─── media 段 ───
  const mediaCtx = useMemo(
    () => resolveMediaContext(node, nodeById, edges),
    [node, nodeById, edges],
  )

  // ─── actions 段: 装饰层注入的 extras (如 "加入素材库") ───
  // renderExtras 默认是 () => null (无装饰层) — pass 全节点 obj + 解析好的 mediaContext,
  // 装饰层按 type/mediaContext 决定显隐. mediaCtx 复用 media 段的解析结果, 避免重复计算.
  const decoratorExtra = renderExtras ? renderExtras(node, { mediaContext: mediaCtx }) : null

  // ─── actions 段: NoteNode 颜色选择器 ───
  const isNote = node.type === 'note'
  const noteColor = isNote ? (node.data?.color || DEFAULT_NOTE_COLOR) : null
  const colorPaletteOpen = isNote && colorPickerOpenId === nodeId

  const handleToggleColorPicker = useCallback((e) => {
    e.stopPropagation()
    setColorPickerOpenId(prev => (prev === nodeId ? null : nodeId))
  }, [nodeId, setColorPickerOpenId])

  const handleColorPick = useCallback((color) => (e) => {
    e.stopPropagation()
    updateNodeData(nodeId, { color })
    setColorPickerOpenId(null)
  }, [nodeId, updateNodeData, setColorPickerOpenId])

  // ─── actions 段: 复制文本 (文本输入节点 / 独立文本输出节点 / 折叠态文本能力节点) ───
  // 折叠态能力节点本体无正文, 沿边解析下游 outputNode.content.text — 详见 resolveCopyableText.
  const copyableText = useMemo(
    () => resolveCopyableText(node, nodeById, edges),
    [node, nodeById, edges],
  )

  const handleCopyText = useCallback((e) => {
    e.stopPropagation()
    if (!copyableText) return
    navigator.clipboard.writeText(copyableText).then(
      () => message.success('已复制'),
      () => message.error('复制失败'),
    )
  }, [copyableText])

  // ─── actions 段: Copy / Delete ───
  const handleCopy = useCallback((e) => {
    e.stopPropagation()
    const src = getNode(nodeId)
    if (!src) return
    // 新节点落在原节点正下方同列, 纵向间距 = 源节点实测高 + CAPABILITY_STACK_GAP,
    // 后者已为新节点上方 NodeMeta + 选中工具栏的总撑出预留位置 (见 constants/spacing.js).
    const rawH = src.measured?.height ?? src.height ?? src.style?.height
    const sourceH = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 200
    const newNode = {
      ...src,
      id: `${src.type}-${Date.now()}`,
      position: {
        x: src.position.x,
        y: src.position.y + sourceH + CAPABILITY_STACK_GAP,
      },
      selected: false,
      // 本路径不复制 edges, portConnections 必须清空, 否则切 mode 时会被 reconcileOnModeChange
      // 当历史记录重建成幽灵边. canvasSeq 由渲染层 computeNodeSeqMap 派生, 此处不写.
      data: {
        ...JSON.parse(JSON.stringify(src.data)),
        locked: false,
        portConnections: {},
        canvasSeq: undefined,
      },
    }
    facade.addNodes([{ ...newNode, zIndex: nodeZCounterRef.current++ }])
  }, [nodeId, getNode, facade, nodeZCounterRef])

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    deleteElements({ nodes: [{ id: nodeId }] })
  }, [nodeId, deleteElements])

  // ─── 3 组按钮渲染 (空组直接 return null, 不渲染容器) ───

  // actions 段始终有 Copy + Delete, 所以一定会渲染 — 整个 NodeToolbar 也一定会渲染.
  // 但我们仍按"按段渲染"组织, 方便将来 actions 段也变成条件渲染.

  return (
    <NodeToolbar
      nodeId={nodeId}
      position={Position.Top}
      align="center"
      offset={TOOLBAR_OFFSET}
    >
      <div
        className="node-toolbar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 第 1 组: debug */}
        {showDebug && (
          <div className="node-toolbar-group">
            <Tooltip title="查看节点数据">
              <button
                type="button"
                className="node-toolbar-btn"
                aria-label="查看节点数据"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenDataModal(nodeId)
                }}
              >
                <Code2 size={14} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* 第 2 组: actions (装饰层 extras + 媒体上传/替换 + NoteNode 颜色 + Copy + Delete) */}
        <div className="node-toolbar-group">
          {decoratorExtra}
          {uploadCfg && (
            <>
              <Tooltip title={uploadLabel}>
                <button
                  type="button"
                  className="node-toolbar-btn"
                  aria-label={uploadLabel}
                  onClick={handleUploadBtnClick}
                  disabled={contentUploading}
                >
                  {contentUploading
                    ? <Loader2 size={14} className="capability-card-spinner" />
                    : <Upload size={14} />}
                </button>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadCfg.accept || undefined}
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            </>
          )}
          {isNote && (
            <div className="note-color-picker-wrapper">
              <Tooltip title="备注颜色">
                <button
                  type="button"
                  className="node-toolbar-btn"
                  aria-label="备注颜色"
                  onClick={handleToggleColorPicker}
                >
                  <span
                    className="note-color-dot"
                    style={{ backgroundColor: noteColor }}
                  />
                </button>
              </Tooltip>
              {colorPaletteOpen && (
                <div className="note-color-palette">
                  {NOTE_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`note-color-swatch ${c === noteColor ? 'active' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={handleColorPick(c)}
                      aria-label={`选择颜色 ${c}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {copyableText && (
            <Tooltip title="复制文本">
              <button
                type="button"
                className="node-toolbar-btn"
                aria-label="复制文本"
                onClick={handleCopyText}
              >
                <ClipboardType size={14} />
              </button>
            </Tooltip>
          )}
          <Tooltip title="复制">
            <button
              type="button"
              className="node-toolbar-btn"
              aria-label="复制"
              onClick={handleCopy}
            >
              <Copy size={14} />
            </button>
          </Tooltip>
          <Tooltip title="删除">
            <button
              type="button"
              className="node-toolbar-btn node-toolbar-btn-danger"
              aria-label="删除"
              onClick={handleDelete}
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>

        {/* 第 3 组: media (image/video/audio 产物节点) — MediaPreviewToolbar 自身输出
            .node-toolbar-group 容器, 含 Maximize2 (image/video) / Download 按钮 + 弹窗 */}
        {mediaCtx && (
          <MediaPreviewToolbar
            url={mediaCtx.url}
            mediaType={mediaCtx.mediaType}
            nodeName={mediaCtx.nodeName}
            fileName={mediaCtx.fileName}
          />
        )}
      </div>
    </NodeToolbar>
  )
}

export default memo(NodeToolbarPortal)
