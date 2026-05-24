import { memo, useState, useRef, useEffect } from 'react'
import { Tooltip } from 'antd'
import { NodeTypeIcons, InputTypeIcons, Plus } from '@/canvas/icons'

/**
 * 左侧浮动工具栏 — 抓手切换 + 添加节点 / 能力节点。
 *
 * 项目入口已移到右上角胶囊(TopRightCluster);设置入口由右上角槽承担(由父级注入头像或设置 icon)。
 */

const INPUT_NODE_OPTIONS = [
  { key: 'text',  label: '文本', icon: <InputTypeIcons.text  size={18} /> },
  { key: 'image', label: '图片', icon: <InputTypeIcons.image size={18} /> },
  { key: 'video', label: '视频', icon: <InputTypeIcons.video size={18} /> },
  { key: 'audio', label: '音效', icon: <InputTypeIcons.audio size={18} /> },
  { key: 'file',  label: '文件', icon: <InputTypeIcons.file  size={18} /> },
  { key: 'note',  label: '备注', icon: <InputTypeIcons.note  size={18} /> },
]

const ABILITY_BUTTONS = [
  { id: 'llm',   label: '大模型', icon: <NodeTypeIcons.llm   size={18} /> },
  { id: 'image', label: '图片',   icon: <NodeTypeIcons.image size={18} /> },
  { id: 'video', label: '视频',   icon: <NodeTypeIcons.video size={18} /> },
  { id: 'sound', label: '声音',   icon: <NodeTypeIcons.sound size={18} /> },
  { id: 'tool',  label: '工具',   icon: <NodeTypeIcons.tool  size={18} /> },
]

const CursorIcon = () => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M3 1.8v11.3l2.9-2.7 1.9 3.9 1.7-0.8-1.9-3.9 4-0.3L3 1.8z" />
  </svg>
)

const HandIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 11V6.5a1.5 1.5 0 013 0V11" />
    <path d="M11 11V4.5a1.5 1.5 0 013 0V11" />
    <path d="M14 11V5.5a1.5 1.5 0 013 0V13" />
    <path d="M17 12.5V8.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6 7h-2c-3 0-4.5-1.8-5.5-3.5L4.5 13c-0.5-0.9 0-1.9 1-2.2 0.9-0.3 1.8 0.2 2 1l1 2" />
  </svg>
)

function Toolbar({
  onInsertNode,
  onInsertAbility,
  isEditing,
  isPanActive,
  onToggleHandTool,
  extras,
}) {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef(null)
  const hideTimerRef = useRef(null)

  // 点击外部关闭添加菜单
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  const openMenu = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (isEditing) setShowAddMenu(true)
  }

  const scheduleCloseMenu = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowAddMenu(false), 150)
  }

  const handleMenuItemClick = (option) => {
    onInsertNode(option.key)
    setShowAddMenu(false)
  }

  return (
    <div className="ai-canvas-toolbar">
      {/* 抓手切换（位于 + 上方，间隔一段距离） */}
      <ToolbarButton
        icon={isPanActive ? <HandIcon /> : <CursorIcon />}
        label={isPanActive ? '抓手' : '移动'}
        active={isPanActive}
        onClick={onToggleHandTool}
      />

      <div className="toolbar-divider" />

      {/* + 按钮（hover / click 均可弹出 5 个输入节点） */}
      <div
        className="toolbar-add-wrapper"
        ref={addMenuRef}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleCloseMenu}
      >
        <button
          className="toolbar-circle-btn"
          onClick={openMenu}
          disabled={!isEditing}
        >
          <Plus size={18} />
        </button>

        {showAddMenu && (
          <div
            className="toolbar-add-menu"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleCloseMenu}
          >
            <div className="toolbar-add-menu-header">添加</div>
            {INPUT_NODE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                className="toolbar-add-menu-item"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMenuItemClick(opt)
                }}
              >
                <span className="toolbar-add-menu-icon">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 能力节点：大模型 / 图片 / 视频 / 声音 */}
      {ABILITY_BUTTONS.map(ab => (
        <ToolbarButton
          key={ab.id}
          icon={ab.icon}
          label={ab.label}
          disabled={!isEditing}
          onClick={() => onInsertAbility(ab.id)}
        />
      ))}

      {/* 装饰层注入的额外按钮（如素材库），可选 */}
      {extras && extras.length > 0 && (
        <>
          <div className="toolbar-divider" />
          {extras.map((node, i) => (
            <span key={i}>{node}</span>
          ))}
        </>
      )}
    </div>
  )
}

// 用 memo 包一层. 上游 (Toolbar 自己也 memo'd) 的 prop 稳定时这里 bail, 避免高频
// 父级重渲染让 antd Tooltip 的 rc-trigger 内部 useEffect 累积 setState
// (历史 bug: 触发 React "Maximum update depth exceeded")
const ToolbarButton = memo(function ToolbarButton({ icon, label, onClick, disabled = false, active = false }) {
  return (
    <Tooltip title={label} placement="right">
      <button
        className={`toolbar-btn${active ? ' active' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <span className="toolbar-btn-icon">{icon}</span>
        <span className="toolbar-btn-label">{label}</span>
      </button>
    </Tooltip>
  )
})

export default memo(Toolbar)
