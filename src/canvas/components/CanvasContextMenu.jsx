import { useEffect, useRef } from 'react'
import { NODE_TYPES, isOutputNodeType } from '../registry/nodeTypes'
import { InputTypeIcons, StickyNote } from '@/canvas/icons'

const INPUT_TYPES = [
  { id: 'text',  label: '文本', icon: InputTypeIcons.text },
  { id: 'image', label: '图片', icon: InputTypeIcons.image },
  { id: 'audio', label: '音频', icon: InputTypeIcons.audio },
  { id: 'video', label: '视频', icon: InputTypeIcons.video },
  { id: 'file',  label: '文件', icon: InputTypeIcons.file },
]

/**
 * 右键菜单
 *
 * @param {{
 *   position: { x: number, y: number },
 *   target: { type: 'blank'|'node'|'multiSelect', nodeId?: string, nodeType?: string },
 *   onClose: () => void,
 *   onAction: (action: string, payload?: any) => void,
 * }} props
 */
export default function CanvasContextMenu({ position, target, onClose, onAction }) {
  const menuRef = useRef(null)

  // 点击外部关闭
  // 用 capture 阶段：React Flow 会在 pane 的 mousedown 上 stopPropagation，
  // bubble 阶段挂到 document 的监听收不到事件，菜单不会关闭
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAction = (action, payload) => {
    onAction(action, payload)
    onClose()
  }

  const renderBlankMenu = () => (
    <>
      <div className="ctx-menu-section-label">插入输入节点</div>
      {INPUT_TYPES.map(t => {
        const InputIcon = t.icon
        return (
          <div
            key={t.id}
            className="ctx-menu-item"
            onClick={() => handleAction('insertInput', { subType: t.id })}
          >
            <span className="ctx-menu-icon"><InputIcon size={14} /></span>
            {t.label}
          </div>
        )
      })}
      <div className="ctx-menu-divider" />
      <div className="ctx-menu-section-label">插入能力节点</div>
      {NODE_TYPES.map(t => {
        const NodeIcon = t.icon
        return (
          <div
            key={t.id}
            className="ctx-menu-item"
            onClick={() => handleAction('insertCapability', { nodeType: t.id })}
          >
            <span className="ctx-menu-icon"><NodeIcon size={14} /></span>
            {t.label}
          </div>
        )
      })}
      <div className="ctx-menu-divider" />
      <div
        className="ctx-menu-item"
        onClick={() => handleAction('insertNote')}
      >
        <span className="ctx-menu-icon"><StickyNote size={14} /></span>
        备注
      </div>
      <div className="ctx-menu-divider" />
      <div
        className="ctx-menu-item"
        onClick={() => handleAction('paste')}
      >
        粘贴
      </div>
      <div
        className="ctx-menu-item"
        onClick={() => handleAction('selectAll')}
      >
        全选
      </div>
    </>
  )

  // 输入(内容)/备注节点没有右侧面板,只有能力/输出节点保留"打开面板"入口
  const canOpenPanel = target.nodeType === 'capability' || isOutputNodeType(target.nodeType)

  const renderNodeMenu = () => (
    <>
      {canOpenPanel && (
        <div
          className="ctx-menu-item"
          onClick={() => handleAction('openPanel', { nodeId: target.nodeId })}
        >
          打开面板
        </div>
      )}
      <div
        className="ctx-menu-item"
        onClick={() => handleAction('copy')}
      >
        复制
      </div>
      {target.nodeType === 'capability' && (
        <div
          className="ctx-menu-item"
          onClick={() => handleAction('resetNode', { nodeId: target.nodeId })}
        >
          重置节点
        </div>
      )}
      <div
        className="ctx-menu-item ctx-menu-item-danger"
        onClick={() => handleAction('delete')}
      >
        删除
      </div>
    </>
  )

  const renderMultiSelectMenu = () => (
    <>
      <div
        className="ctx-menu-item"
        onClick={() => handleAction('copy')}
      >
        复制
      </div>
      <div
        className="ctx-menu-item ctx-menu-item-danger"
        onClick={() => handleAction('delete')}
      >
        删除
      </div>
    </>
  )

  let content
  switch (target.type) {
    case 'blank':
      content = renderBlankMenu()
      break
    case 'node':
      content = renderNodeMenu()
      break
    case 'multiSelect':
      content = renderMultiSelectMenu()
      break
    default:
      content = renderBlankMenu()
  }

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: position.x, top: position.y }}
    >
      {content}
    </div>
  )
}
