// src/capabilities/tool/capcut-draft/components/MaterialLibrary.jsx
// 左侧三列素材库。每个素材可拖到右侧轨道。
// label 区是常驻 Input,展示「不带后缀的 filename」(默认 = 连入节点 label,重名加 (2)/(3))。
// 用户编辑后写入 timeline.materialFilenames;重名时输入框红框且不写入 state。
// 卡片三态:
//   - 正常:可拖
//   - pending(probeState='pending'):半透明 + spinner,不可拖
//   - failed(probeState='failed'):红边 + ⚠️ + 重试按钮,不可拖
import { useState, useEffect } from 'react'
import { Input, Tooltip, Button } from 'antd'
import { Maximize2, Loader2, AlertCircle, RotateCw, Plus } from '@/canvas/icons'
import MaterialCover from './MaterialCover'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'

function EditableFilename({ material, displayNames, onCommit }) {
  const [value, setValue] = useState(material.displayName)
  const [error, setError] = useState(false)

  useEffect(() => {
    setValue(material.displayName)
    setError(false)
  }, [material.displayName])

  const commit = () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setValue(material.displayName)
      setError(false)
      return
    }
    if (trimmed === material.displayName) {
      setError(false)
      return
    }
    const conflict = displayNames.some(n => n.id !== material.id && n.name === trimmed)
    if (conflict) {
      setError(true)
      return
    }
    setError(false)
    onCommit(trimmed)
  }

  return (
    <Tooltip title="文件名重复" open={error} placement="top">
      <Input
        size="small"
        status={error ? 'error' : ''}
        value={value}
        onChange={e => { setValue(e.target.value); if (error) setError(false) }}
        onBlur={commit}
        onPressEnter={(e) => { e.target.blur() }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(material.displayName)
            setError(false)
            e.target.blur()
          }
        }}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => e.preventDefault()}
        draggable={false}
        title={material.label}
      />
    </Tooltip>
  )
}

export default function MaterialLibrary({ materials, onDragStart, onFilenameChange, probeState, onRetryProbe, onAddToTrack, onAddAll }) {
  const displayNames = materials.map(m => ({ id: m.id, name: m.displayName }))
  const [previewMaterial, setPreviewMaterial] = useState(null)
  // 只要有一个非 pending/failed 的素材就允许「全部加载」(buildInitialTimeline 内部会跳过缺时长项)
  const hasUsable = materials.some(m => {
    const s = probeState?.get(m.id)
    return s !== 'pending' && s !== 'failed'
  })
  return (
    <div className="capcut-library">
      <div className="capcut-library-header">
        <span className="capcut-library-title">素材库 · 来自连入的节点</span>
        <Button
          size="small"
          type="link"
          onClick={onAddAll}
          disabled={!hasUsable}
          style={{ padding: '0 4px', fontSize: 11, height: 'auto' }}
        >
          全部加载到轨道
        </Button>
      </div>
      <div className="capcut-library-grid">
        {materials.map(m => {
          const state = probeState?.get(m.id)   // 'pending' | 'failed' | undefined
          const isPending = state === 'pending'
          const isFailed = state === 'failed'
          const isLocked = isPending || isFailed
          const className = [
            'capcut-library-item',
            isPending && 'capcut-library-item--pending',
            isFailed && 'capcut-library-item--failed',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={m.id}
              className={className}
              draggable={!isLocked}
              onDragStart={isLocked ? undefined : (e) => {
                e.dataTransfer.setData('application/x-capcut-material', m.id)
                e.dataTransfer.effectAllowed = 'copy'
                onDragStart?.(m)
              }}
            >
              <div className="cover">
                <MaterialCover material={m} />
                {/* 正常态:加到轨道按钮(左下) */}
                {!isLocked && (
                  <button
                    type="button"
                    className="capcut-library-item__add-btn"
                    title="加到轨道末尾"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onAddToTrack?.(m) }}
                    draggable={false}
                  >
                    <Plus size={14} />
                  </button>
                )}
                {/* 正常态:全屏预览按钮(右下) */}
                {!isLocked && (
                  <button
                    type="button"
                    className="capcut-library-item__preview-btn"
                    title="全屏预览"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setPreviewMaterial(m) }}
                    draggable={false}
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                {/* pending 态:半透明遮罩 + spinner */}
                {isPending && (
                  <div className="capcut-library-item__overlay" title="读取时长中">
                    <Loader2 size={20} style={{ color: '#fff' }} className="icon-spin" />
                  </div>
                )}
                {/* failed 态:红色遮罩 + 警告图标 + 重试按钮 */}
                {isFailed && (
                  <div className="capcut-library-item__overlay" title="时长读取失败">
                    <AlertCircle size={20} style={{ color: '#ff4d4f' }} />
                    <Tooltip title="重试">
                      <Button
                        size="small"
                        type="primary"
                        shape="circle"
                        icon={<RotateCw size={12} />}
                        onClick={(e) => { e.stopPropagation(); onRetryProbe?.(m.id) }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        style={{ marginTop: 6 }}
                      />
                    </Tooltip>
                  </div>
                )}
              </div>
              <div className="capcut-library-item__name">
                <EditableFilename
                  material={m}
                  displayNames={displayNames}
                  onCommit={(name) => onFilenameChange?.(m.id, name)}
                />
              </div>
            </div>
          )
        })}
        {materials.length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: '#bbb', fontSize: 11, textAlign: 'center', padding: 20 }}>
            没有素材 — 请先把内容节点连进工具节点
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#bbb', marginTop: 10, lineHeight: 1.5 }}>
        拖到右侧轨道使用 · 同一素材可拖多次 · 片段可拖回此处移除
      </div>
      <MediaPreviewModal
        open={!!previewMaterial}
        onClose={() => setPreviewMaterial(null)}
        mediaType={previewMaterial?.type}
        url={previewMaterial?.url}
        text={previewMaterial?.textContent}
        title={previewMaterial?.displayName || previewMaterial?.label}
      />
    </div>
  )
}
