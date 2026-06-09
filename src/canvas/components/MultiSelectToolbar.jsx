import { memo } from 'react'
import { NodeToolbar, Position, useStore } from '@xyflow/react'
import { Group, Copy, Trash2, Download } from '@/canvas/icons'
import { collectDownloadables } from '../utils/groupDownload'
import { isOutputNodeType } from '../registry/nodeTypes'

function MultiSelectToolbar({ onGroup, onCopy, onDelete, onDownload }) {
  const selectedIds = useStore(
    (s) => [...s.nodeLookup.values()].filter(n => n.selected).map(n => n.id),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
  )
  const canDownload = useStore((s) => {
    const all = [...s.nodeLookup.values()]
    const selected = new Set(all.filter(n => n.selected).map(n => n.id))
    return collectDownloadables(all, selected, { isOutputNodeType }).length > 0
  })
  if (selectedIds.length < 2) return null
  return (
    <NodeToolbar nodeId={selectedIds} position={Position.Top} align="center" offset={26} isVisible>
      <div className="node-toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="node-toolbar-group">
          <button className="node-toolbar-btn" onClick={onGroup} title="成组 (⌘G)"><Group size={16} /></button>
          <button className="node-toolbar-btn" onClick={onCopy} title="复制"><Copy size={16} /></button>
          <button
            className="node-toolbar-btn node-toolbar-btn-danger"
            onClick={onDelete}
            title="删除"
          ><Trash2 size={16} /></button>
          <button className="node-toolbar-btn" onClick={onDownload} disabled={!canDownload}
            title={canDownload ? '批量下载' : '无可下载产物'}><Download size={16} /></button>
        </div>
      </div>
    </NodeToolbar>
  )
}
export default memo(MultiSelectToolbar)
