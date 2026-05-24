// src/capabilities/tool/capcut-draft/cards/CapcutDraftCard.jsx
// 折叠态节点本体: 节点头 + 4 列素材缩略图网格 + footer 素材统计 / 状态.
//
// 视觉对齐 docs/superpowers/specs/2026-05-19-capcut-draft-dockedpanel-mockup.html §5.
// 由 CapabilityNode 通过 cards.default 渲染 (form 'folded' 走 cards.{mode},
// 不走 view 字段——后者是 CapabilityPanel 的入口).
//
// 数据来源:
//   - node.data / nodeId        从 props 拿 (Card 标准签名)
//   - edges + nodes             订阅 React Flow store, 用 collectMaterials 解出素材列表
//
// 状态规则:
//   - Ready  : 缩略图网格 + footer "N 个素材 · 共 X:XX" + 「选中查看详情」
//   - Running: 缩略图保持 + footer "正在生成草稿 · X%" + 蓝边框
//   - Done   : 缩略图保持 + footer "打开剪映可查看" + 复制路径按钮 + 绿边框
//   - Failed : 缩略图保持 + footer 错误摘要 + 红边框
//
// 缩略图类型差异化:
//   - image: 直接 <img> 渲染 content.url
//   - video: <video preload=metadata muted> 抽首帧 + 中心 ▶ 浮层 + 右下时长 tag
//             经 useMediaSource 接入画布通用视频缓存 (Cache API: 上游视频节点已写入则秒命中,
//             未命中则边下边播显首帧, 同时挂 IntersectionObserver 在停留 3s 后后台 prefetch)
//   - audio: 绿色背景 + Volume2 icon + 时长 tag
//   - text:  米黄背景 + Type icon + 字符数 tag
//   - unknown: 占位灰格 + 类型 icon
//
// 折叠规则: ≤7 个全显示, 第 8 格起折叠为 "+N".
import { memo, useCallback, useMemo } from 'react'
import { useStore } from '@xyflow/react'
import { Film, Image as ImageIcon, Volume2, Type, Play, Wrench, CheckCircle, AlertCircle, Loader2 } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { collectMaterials, formatShortDuration } from '../utils/collectMaterials'
import './CapcutDraftCard.css'

const MAX_VISIBLE_THUMBS = 7

function CapcutDraftCard({ nodeId, data }) {
  // 订阅 store 里跟"本节点素材"相关的最小切片. 在选择器里直接算出 collectMaterials
  // 的结果, 配合 materialsEqual 精确比较: 仅当 items 数组的可见字段或 counts/总时长
  // 变化时才触发本组件重渲染 (拖拽 / 选中 / 不相关节点更新都不影响).
  const { items, counts, totalDurationSec } = useStore(
    useCallback(
      s => collectMaterials({
        nodeId,
        edges: s.edges || [],
        nodes: s.nodeLookup ? Array.from(s.nodeLookup.values()) : (s.nodes || []),
      }),
      [nodeId],
    ),
    materialsEqual,
  )

  const runStatus = data?.runStatus
  const content = data?.content || {}
  const progress = data?.capcutProgress

  const isRunning = runStatus === 'polling' || runStatus === 'running'
  const isDone = runStatus === 'done'
  const isFailed = runStatus === 'error' || runStatus === 'Failed'

  const visibleItems = useMemo(() => items.slice(0, MAX_VISIBLE_THUMBS), [items])
  const hiddenCount = Math.max(0, items.length - MAX_VISIBLE_THUMBS)

  // 状态色由 FoldedNodeMeta + footer 文字承担, Card 容器无状态 class
  return (
    <div className="capcut-card">
      <header className="capcut-card-head">
        <span className="capcut-card-head-icon">
          <Wrench size={14} />
        </span>
        <div className="capcut-card-head-text">
          <div className="capcut-card-head-title">剪映草稿</div>
          <div className="capcut-card-head-sub">导出到本机剪映</div>
        </div>
      </header>

      <div className="capcut-card-thumbs">
        {items.length === 0 ? (
          <div className="capcut-card-thumb-empty">
            把图片 / 视频 / 音频 / 文字节点连到本节点的「素材」端口
          </div>
        ) : (
          <>
            {visibleItems.map((item, i) => (
              <Thumb key={`${item.sourceNodeId || 'unknown'}-${i}`} item={item} />
            ))}
            {hiddenCount > 0 && (
              <div className="capcut-card-thumb capcut-card-thumb-more">+{hiddenCount}</div>
            )}
          </>
        )}
      </div>

      <Footer
        isRunning={isRunning}
        isDone={isDone}
        isFailed={isFailed}
        progress={progress}
        counts={counts}
        totalDurationSec={totalDurationSec}
        errorText={content.error}
      />
    </div>
  )
}

// 视频格子单独成组件 — useMediaSource 必须在组件顶层调用, 每个视频实例持有
// 自己的 displayUrl / containerRef. 静止首帧不播放, 中心 ▶ 浮层提示这是视频.
function VideoThumb({ url, durationSec }) {
  const { displayUrl, containerRef, markError } = useMediaSource(url, { kind: 'video' })
  return (
    <div ref={containerRef} className="capcut-card-thumb capcut-card-thumb-real">
      {url
        ? (
          <video
            src={displayUrl || undefined}
            muted
            playsInline
            preload="metadata"
            onError={markError}
            draggable={false}
          />
        )
        : <span className="capcut-card-thumb-fallback"><Film /></span>}
      <span className="capcut-card-thumb-play"><Play size={11} fill="#fff" /></span>
      {durationSec != null && (
        <span className="capcut-card-thumb-tag">{formatShortDuration(durationSec)}</span>
      )}
    </div>
  )
}

// 图片缩略同样走 useMediaSource: 上游 OSS 的 Content-Disposition: attachment
// 会触发 ERR_BLOCKED_BY_RESPONSE, 必须经画布通用缓存层中转。
function ImageThumb({ url }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  return <img src={displayUrl} alt="" loading="lazy" onError={markError} />
}

function Thumb({ item }) {
  const { type, url, durationSec, textLength } = item

  if (type === 'video') {
    return <VideoThumb url={url} durationSec={durationSec} />
  }

  if (type === 'image') {
    return (
      <div className="capcut-card-thumb capcut-card-thumb-real">
        {url
          ? <ImageThumb url={url} />
          : <span className="capcut-card-thumb-fallback"><ImageIcon /></span>}
      </div>
    )
  }

  if (type === 'audio') {
    return (
      <div className="capcut-card-thumb capcut-card-thumb-audio">
        <Volume2 />
        {durationSec != null && (
          <span className="capcut-card-thumb-tag">{formatShortDuration(durationSec)}</span>
        )}
      </div>
    )
  }

  if (type === 'text') {
    return (
      <div className="capcut-card-thumb capcut-card-thumb-text">
        <Type />
        {textLength != null && (
          <span className="capcut-card-thumb-tag">{textLength}字</span>
        )}
      </div>
    )
  }

  return (
    <div className="capcut-card-thumb capcut-card-thumb-unknown">
      <Film />
    </div>
  )
}

function Footer({ isRunning, isDone, isFailed, progress, counts, totalDurationSec, errorText }) {
  if (isRunning) {
    return (
      <div className="capcut-card-footer is-running">
        <span className="capcut-card-footer-status">
          <Loader2 size={12} className="capcut-card-spin" />
          正在生成草稿{typeof progress === 'number' ? ` · ${progress}%` : '…'}
        </span>
      </div>
    )
  }

  if (isDone) {
    const total = counts.total
    return (
      <div className="capcut-card-footer is-done">
        <span className="capcut-card-footer-status">
          <CheckCircle size={12} />
          打开剪映可查看
        </span>
        {total > 0 && (
          <span className="capcut-card-footer-hint">
            <span className="capcut-card-footer-count">{total}</span> 个素材
          </span>
        )}
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="capcut-card-footer is-failed">
        <span className="capcut-card-footer-status">
          <AlertCircle size={12} />
          {errorText || '生成草稿失败'}
        </span>
      </div>
    )
  }

  const total = counts.total
  if (total === 0) return null
  const durTxt = formatShortDuration(totalDurationSec)
  return (
    <div className="capcut-card-footer">
      <span className="capcut-card-footer-status">
        <span className="capcut-card-footer-count">{total}</span> 个素材{durTxt ? <> · 共 <span className="capcut-card-footer-count">{durTxt}</span></> : null}
      </span>
      <span className="capcut-card-footer-hint">选中查看详情</span>
    </div>
  )
}

// useStore 选择器返回新对象, 必须显式比较, 否则任何 store 更新 (drag / zoom / 不相关
// 节点变化) 都会引起本卡重渲染. 仅当素材列表的关键字段变化时才返回 false.
function materialsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.counts.total !== b.counts.total) return false
  if (a.totalDurationSec !== b.totalDurationSec) return false
  if (a.items.length !== b.items.length) return false
  for (let i = 0; i < a.items.length; i++) {
    const x = a.items[i], y = b.items[i]
    if (
      x.url !== y.url ||
      x.type !== y.type ||
      x.durationSec !== y.durationSec ||
      x.textLength !== y.textLength ||
      x.uploading !== y.uploading ||
      x.sourceNodeId !== y.sourceNodeId
    ) return false
  }
  return true
}

export default memo(CapcutDraftCard)
