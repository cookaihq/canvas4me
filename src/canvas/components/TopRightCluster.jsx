import { useState } from 'react'
import { Tooltip } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { FolderOpen, Loader2, HelpCircle, ExternalLink } from '@/canvas/icons'

const HELP_URL = import.meta.env.VITE_CANVAS_HELP_URL || ''

/**
 * 右上角浮动区 — 帮助胶囊(可选) + 项目入口胶囊(项目入口按钮 + 头像/设置槽)。
 *
 * 保存状态:仅在保存中时显示旋转动画图标,空闲时不渲染。
 *
 * 帮助图标:配置 VITE_CANVAS_HELP_URL 后,在项目入口胶囊左侧渲染独立胶囊,
 *   点击弹出模态框 iframe 嵌入帮助页;模态框 title 右侧的外链图标可在新页签打开。
 *   未配置 HELP_URL 时不渲染。
 *
 * @param {{
 *   canvasName: string,
 *   isSaving: boolean,
 *   onOpenManager: () => void,
 *   rightSlot?: React.ReactNode,
 * }} props
 */
export default function TopRightCluster({ canvasName, isSaving, onOpenManager, rightSlot }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="ai-canvas-topright-bar">
      {HELP_URL && (
        <Tooltip title="帮助" placement="bottom">
          <button
            type="button"
            className="ai-canvas-topright-help"
            onClick={() => setHelpOpen(true)}
            aria-label="帮助"
          >
            <HelpCircle size={16} />
          </button>
        </Tooltip>
      )}
      <div className="ai-canvas-topright-cluster">
        <button
          type="button"
          className="ai-canvas-project-entry"
          onClick={onOpenManager}
        >
          <FolderOpen size={16} className="ai-canvas-project-entry-folder" />
          <span className="ai-canvas-project-entry-name">
            {canvasName || '未命名画布'}
          </span>
          {isSaving && (
            <span className="ai-canvas-project-entry-save">
              <Loader2 size={14} className="capability-card-spinner" style={{ color: 'var(--ac-accent)' }} />
            </span>
          )}
        </button>
        {rightSlot && <div className="ai-canvas-topright-slot">{rightSlot}</div>}
      </div>
      {HELP_URL && (
        <Modal
          open={helpOpen}
          onCancel={() => setHelpOpen(false)}
          footer={null}
          width={960}
          centered
          destroyOnClose
          title={
            <div className="ai-canvas-help-modal-title">
              <span>帮助</span>
              <Tooltip title="在新页签打开" placement="bottom">
                <button
                  type="button"
                  className="ai-canvas-help-modal-external"
                  onClick={() => window.open(HELP_URL, '_blank', 'noopener,noreferrer')}
                  aria-label="在新页签打开"
                >
                  <ExternalLink size={16} />
                </button>
              </Tooltip>
            </div>
          }
        >
          <iframe
            className="ai-canvas-help-modal-iframe"
            src={HELP_URL}
            title="帮助"
          />
        </Modal>
      )}
    </div>
  )
}
