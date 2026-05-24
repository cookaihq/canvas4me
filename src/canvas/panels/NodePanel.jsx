import { useCallback } from 'react'
import { X, Zap } from '@/canvas/icons'
import { useReactFlow } from '@xyflow/react'
import { isOutputNodeType, CAPABILITIES } from '../registry/nodeTypes'
import { useCanvasFacade } from '../state/canvasFacade'
import { useNodeSeq, useStoreNodes, useStoreEdges } from '../state/canvasDerived'
import CapabilityPanel from './CapabilityPanel'
import OutputPanel from './OutputPanel'

const NODE_TYPE_LABELS = {
  input: '输入节点',
  capability: '能力节点',
  note: '备注',
  group: '分组',
}

const NODE_TYPE_RESPONSE_LABELS = {
  llm: 'LLM Response',
  image: 'Image Output',
  video: 'Video Output',
  sound: 'Sound Output',
}

const NODE_TYPE_PANEL_TITLES = {
  llm: 'LLM',
  image: 'Image',
  video: 'Video',
  sound: 'Sound',
}

const STATUS_BADGE = {
  idle: { text: 'Ready', tone: 'done' },
  running: { text: 'Running', tone: 'running' },
  polling: { text: 'Polling', tone: 'polling' },
  done: { text: 'Done', tone: 'done' },
  error: { text: 'Error', tone: 'error' },
}

/**
 * 右侧面板容器 — 根据节点类型分发到对应的面板组件
 *
 * @param {object} selectedNode - 当前选中的节点
 * @param {Function} onClose - 关闭面板
 * @param {Function} onRun - 运行能力节点 (nodeId, runCount) => void
 * @param {Function} onRerun - 重新运行能力节点 (capabilityNodeId) => void
 */
export default function NodePanel({ selectedNode, onClose, onRun, onRerun }) {
  const { setCenter, getViewport } = useReactFlow()
  const facade = useCanvasFacade()
  // 完整 nodes/edges 从 store 响应式读取(单一数据源),传给 CapabilityPanel 解析入边素材。
  const nodes = useStoreNodes()
  const edges = useStoreEdges()
  // 序号为派生属性, 即时取(选中节点身上不再带 canvasSeq 字段)
  const seq = useNodeSeq(selectedNode?.id)

  const handleSeqBadgeClick = useCallback(() => {
    if (!selectedNode) return
    // NodeResizer 只更新 measured + 顶层 width/height, 不写 style — 优先 measured 才能拿到 resize 后真实尺寸.
    const rawW = selectedNode.measured?.width ?? selectedNode.width ?? selectedNode.style?.width
    const rawH = selectedNode.measured?.height ?? selectedNode.height ?? selectedNode.style?.height
    const w = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 220
    const h = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 200
    const x = (selectedNode.position?.x ?? 0) + w / 2
    const y = (selectedNode.position?.y ?? 0) + h / 2
    const { zoom } = getViewport()
    setCenter(x, y, { zoom, duration: 300 })
    facade.batchUpdateNodes(nds => nds.map(n => {
      const shouldSelect = n.id === selectedNode.id
      if (!!n.selected === shouldSelect) return n
      return { ...n, selected: shouldSelect }
    }))
  }, [selectedNode, setCenter, getViewport, facade])

  if (!selectedNode) return null

  const { type, data } = selectedNode
  const isOutputNode = isOutputNodeType(type)

  // 推断能力类型（能力节点从 data.nodeType，输出节点从 sourceCapability 查表）
  let nodeType = null
  if (type === 'capability') {
    nodeType = data?.nodeType ?? data?.abilityType
  } else if (isOutputNode) {
    const capDef = data?.sourceCapability ? CAPABILITIES[data.sourceCapability] : null
    nodeType = capDef?.nodeType
  }

  let label
  if (isOutputNode) {
    label = NODE_TYPE_RESPONSE_LABELS[nodeType] || '输出节点'
  } else if (type === 'capability') {
    label = NODE_TYPE_PANEL_TITLES[nodeType] || data?.label || '能力节点'
  } else {
    label = data?.label || NODE_TYPE_LABELS[type] || '节点'
  }

  // 状态 badge（LLM 能力节点/输出节点才显示）
  const showStatusBadge = nodeType === 'llm'
  const runStatus = data?.runStatus || 'idle'
  const badge = showStatusBadge ? STATUS_BADGE[runStatus] : null

  // 能力节点：面板完全由 CapabilityPanel 承担（自带 Header + Body + Run），不走通用 Header
  if (type === 'capability') {
    return (
      <div className="ai-canvas-panel">
        <CapabilityPanel
          node={selectedNode}
          onClose={onClose}
          onRun={onRun}
          edges={edges}
          nodes={nodes}
        />
      </div>
    )
  }

  // 其他节点类型：通用 Header + Body
  let PanelContent
  let panelProps = { node: selectedNode }

  if (isOutputNode) {
    PanelContent = OutputPanel
    panelProps.onRerun = onRerun
  } else {
    PanelContent = null
  }

  return (
    <div className="ai-canvas-panel">
      <div className={`panel-header ${nodeType ? `panel-header-capability-${nodeType}` : ''}`}>
        <div className="panel-header-title-group">
          {typeof seq === 'number' && (
            <span
              className="panel-seq-badge panel-seq-badge-clickable"
              title="点击居中到该节点"
              role="button"
              tabIndex={0}
              onClick={handleSeqBadgeClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSeqBadgeClick()
                }
              }}
            >#{seq}</span>
          )}
          {nodeType === 'llm' && (
            <Zap className="panel-header-icon" />
          )}
          <span className="panel-header-title">{label}</span>
          {badge && (
            <span className={`panel-header-badge panel-header-badge-${badge.tone}`}>
              {badge.text}
            </span>
          )}
        </div>
        <button className="panel-header-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="panel-body">
        {PanelContent ? (
          <PanelContent {...panelProps} />
        ) : (
          <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 24 }}>
            不支持的节点类型
          </div>
        )}
      </div>
    </div>
  )
}
