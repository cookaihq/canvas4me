// src/capabilities/tool/capcut-draft/DockedPanel.jsx
// 折叠态能力节点选中时下方吸附的面板.
//
// 结构 (对齐 UI 标准三段式):
//   - DockedTopBar (showExpand=false: capcut-draft 没有 prompt 长文本, 不需要 modal 形态)
//   - 摘要区: 素材类型计数 chip + helper 状态 badge + 「编辑时间线」按钮
//   - 不渲染 DockedBottomBar (没有参数 chip / Run / 倍数 / 积分需求)
//
// 「编辑时间线」按钮打开 TimelineModal, 真正的「生成草稿」提交动作在 modal 内进行.
// DockedPanel 上的 HelperStatusBadge 只关注 helper 在线状态 (health/offline/scan/cors_allowed),
// 不订阅 activeTask -- 任务进度由节点本身的 runStatus + meta-row 表达.
import { useState, useRef, useEffect, useMemo, lazy, Suspense, Fragment } from 'react'
import { Button } from 'antd'
import { Pencil, Film, Image as ImageIcon, Volume2, Type } from '@/canvas/icons'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import HelperStatusBadge from './components/HelperStatusBadge'
import AuthHintModal from './components/AuthHintModal'
import { useCapcutHelperStatus } from './hooks/useCapcutHelperStatus'
import { collectMaterials } from './utils/collectMaterials'
import './dockedPanel.css'

const TimelineModal = lazy(() => import('./TimelineModal'))

export default function CapcutDraftDockedPanel({
  node,
  capability,
  mode,
  edges,
  nodes,
  variant = 'default',
  onCapabilityChange,
  onModeChange,
  onRequestVariant,
}) {
  const [open, setOpen] = useState(false)
  const [showAuthHintModal, setShowAuthHintModal] = useState(false)
  const [pendingHint, setPendingHint] = useState(null)

  // 与 TimelineModal handleTrust 共用:setShowAuthHintModal 是异步触发的,
  // 组件卸载后不能再调 setState. 用 ref 守卫.
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

  const helperStatus = useCapcutHelperStatus({ enabled: true, activeTask: null })

  const { counts } = useMemo(
    () => collectMaterials({ nodeId: node.id, edges, nodes }),
    [node.id, edges, nodes]
  )

  // 按渲染顺序收集非零的素材类型行 (空类型不进列表 — chip 间分隔点跟列表索引算, 跨实例不污染).
  const visibleStats = useMemo(() => ([
    { type: 'video', icon: <Film />,      count: counts.video, label: '段视频' },
    { type: 'image', icon: <ImageIcon />, count: counts.image, label: '张图片' },
    { type: 'audio', icon: <Volume2 />,   count: counts.audio, label: '段音频' },
    { type: 'text',  icon: <Type />,      count: counts.text,  label: '段文字' },
  ].filter(s => s.count > 0)), [counts.video, counts.image, counts.audio, counts.text])

  const runStatus = node?.data?.runStatus
  const isRunning = runStatus === 'polling' || runStatus === 'running'
  const hasMaterials = counts.total > 0

  // trust_url 唤起 + 兜底 (与 TimelineModal handleTrust 同款时序, 设计 §4.3)
  const handleTrust = (trustUrl) => {
    const currentHint = helperStatus.state.type === 'health'
      ? helperStatus.state.health?.hint
      : null
    setPendingHint(currentHint)
    if (trustUrl) window.location.href = trustUrl
    setTimeout(() => {
      if (!isMountedRef.current) return
      helperStatus.recheck()
      setTimeout(() => {
        if (!isMountedRef.current) return
        setShowAuthHintModal(true)
      }, 800)
    }, 1500)
  }

  const handleOpenRelease = (url) => {
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="docked-panel-body capcut-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        showExpand={false}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="capcut-dp-summary">
        {hasMaterials ? (
          <div className="capcut-dp-stats">
            {visibleStats.map((s, i) => (
              <Fragment key={s.type}>
                {i > 0 && <span className="capcut-dp-stat-sep">·</span>}
                <span className="capcut-dp-stat">
                  {s.icon}
                  <strong>{s.count}</strong> {s.label}
                </span>
              </Fragment>
            ))}
          </div>
        ) : (
          <span className="capcut-dp-empty">尚未连接任何素材 — 把图片 / 视频 / 音频 / 文字节点连到本节点</span>
        )}

        <div className="capcut-dp-right">
          <HelperStatusBadge
            state={helperStatus.state}
            onRecheck={helperStatus.recheck}
            onTrust={handleTrust}
            onOpenRelease={handleOpenRelease}
          />
          <Button
            type="primary"
            icon={<Pencil size={14} />}
            onClick={() => setOpen(true)}
            disabled={isRunning || !hasMaterials}
          >
            编辑时间线
          </Button>
        </div>
      </div>

      {open && (
        <Suspense fallback={null}>
          <TimelineModal
            open={open}
            onClose={() => setOpen(false)}
            node={node}
            edges={edges}
            nodes={nodes}
          />
        </Suspense>
      )}

      <AuthHintModal
        open={showAuthHintModal}
        hint={pendingHint}
        onRetry={() => {
          helperStatus.recheck()
          setShowAuthHintModal(false)
        }}
        onClose={() => setShowAuthHintModal(false)}
      />
    </div>
  )
}

