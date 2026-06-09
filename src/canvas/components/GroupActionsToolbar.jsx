import { useMemo } from 'react'
import { Tooltip } from 'antd'
import { Download, Copy } from '@/canvas/icons'
import useBatchDownload from '../hooks/useBatchDownload'
import { collectDownloadables } from '../utils/groupDownload'
import { buildGroupDuplicate } from '../utils/groupClipboard'
import { isOutputNodeType } from '../registry/nodeTypes'
import { useStoreNodes, useStoreEdges } from '../state/canvasDerived'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 分组节点选中态的专属操作按钮: 批量下载组内产物 + 复制(连带成员)。
 *
 * 单独成组件 — 由 NodeToolbarPortal 在 isGroup 分支渲染。两个操作都自包含(不靠父传 props):
 * 批量下载走 useBatchDownload(选区单选 group 时 collectDownloadables 展开成员); 复制走
 * buildGroupDuplicate 克隆 group 连带成员后 addNodes/addEdges。
 */
export default function GroupActionsToolbar() {
  const nodes = useStoreNodes()
  const edges = useStoreEdges()
  const facade = useCanvasFacade()
  const { downloadSelected } = useBatchDownload()
  // 选区(单选 group 时)有无可下载产物 — collectDownloadables 把 group 展开成成员后判断
  const canDownload = useMemo(() => {
    const sel = new Set(nodes.filter(n => n.selected).map(n => n.id))
    return collectDownloadables(nodes, sel, { isOutputNodeType }).length > 0
  }, [nodes])

  const handleDuplicate = (e) => {
    e.stopPropagation()
    const group = nodes.find(n => n.selected && n.type === 'group')
    if (!group) return
    const { nodes: newNodes, edges: newEdges } = buildGroupDuplicate(group, nodes, edges)
    // 取消现有选中, 让新副本成为唯一选中
    facade.batchUpdateNodes(prev => prev.map(n => (n.selected ? { ...n, selected: false } : n)))
    facade.batchUpdateEdges(prev => prev.map(ed => (ed.selected ? { ...ed, selected: false } : ed)))
    facade.addNodes(newNodes)
    if (newEdges.length) facade.addEdges(newEdges)
  }

  return (
    <>
      <Tooltip title={canDownload ? '批量下载组内产物' : '无可下载产物'}>
        <button
          type="button"
          className="node-toolbar-btn"
          aria-label="批量下载"
          onClick={(e) => { e.stopPropagation(); downloadSelected() }}
          disabled={!canDownload}
        >
          <Download size={14} />
        </button>
      </Tooltip>
      <Tooltip title="复制">
        <button
          type="button"
          className="node-toolbar-btn"
          aria-label="复制"
          onClick={handleDuplicate}
        >
          <Copy size={14} />
        </button>
      </Tooltip>
    </>
  )
}
