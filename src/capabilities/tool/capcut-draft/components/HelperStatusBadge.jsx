// src/capabilities/tool/capcut-draft/components/HelperStatusBadge.jsx
// 纯展示组件：根据 4-type state 渲染对应的 Pill-Fade Badge。
// 不做时序逻辑（trust_url 唤起的 1.5s + 800ms 兜底由父组件 TimelineModal 实现）。
//
// 设计依据：docs/superpowers/specs/2026-05-17-capcut-helper-status-badge-redesign-design.md §4

import { Tooltip } from 'antd'
import './HelperStatusBadge.css'

/**
 * @param {object} props
 * @param {object} props.state                     4-type union from useCapcutHelperStatus
 * @param {() => void} props.onRecheck             offline / failed-task Badge 点击触发
 * @param {(trustUrl: string|undefined) => void} props.onTrust   need-auth Badge 点击触发；
 *                                                                 trustUrl 可能 undefined（老 helper 不返回 trust_url），
 *                                                                 父组件应在 undefined 时直接弹 AuthHintModal、跳过唤起步骤
 * @param {(url: string) => void} props.onOpenRelease       has-update Badge 点击触发
 */
export default function HelperStatusBadge({ state, onRecheck, onTrust, onOpenRelease }) {
  const view = computeBadgeView(state)
  const className = [
    'helper-badge',
    `helper-badge--${view.color}`,
    view.clickable ? 'helper-badge--clickable' : '',
  ].filter(Boolean).join(' ')

  const node = (
    <span
      className={className}
      onClick={view.clickable ? () => view.onClick({ onRecheck, onTrust, onOpenRelease }) : undefined}
    >
      <span className="helper-badge__dot" />
      {view.text}
      {view.showRedDot && <span className="helper-badge__red-dot" />}
    </span>
  )

  return view.tooltip ? <Tooltip title={view.tooltip}>{node}</Tooltip> : node
}

// 把 state 转成渲染描述。分支表见设计文档 §4.1。
function computeBadgeView(state) {
  if (state.type === 'scan') {
    return { color: 'indigo', text: '探测中', clickable: false }
  }
  if (state.type === 'offline') {
    return {
      color: 'red',
      text: '剪映助手未运行',
      clickable: true,
      onClick: ({ onRecheck }) => onRecheck?.(),
    }
  }
  if (state.type === 'task') {
    return computeTaskView(state.task)
  }
  // state.type === 'health'
  return computeHealthView(state.health)
}

function computeTaskView(task) {
  if (task.status === 'done') {
    const name = task.draft_name || '草稿'
    return { color: 'emerald', text: `✓ ${name} 已完成`, clickable: false }
  }
  if (task.status === 'failed') {
    const name = task.draft_name || '草稿'
    return {
      color: 'red',
      text: `✗ ${name} 失败`,
      clickable: true,
      onClick: ({ onRecheck }) => onRecheck?.(),
      tooltip: task.error || '未知错误',
    }
  }
  // pending / building / downloading
  const total = task.subtasks?.length || 0
  const done = task.subtasks?.filter(s => s.status === 'done').length ?? 0
  const progress = task.progress
  let text = '草稿生成中'
  if (total > 0 && progress != null) text = `草稿生成中 ${done}/${total} · ${progress}%`
  else if (total > 0) text = `草稿生成中 ${done}/${total}`
  else if (progress != null) text = `草稿生成中 · ${progress}%`
  return { color: 'indigo', text, clickable: false }
}

function computeHealthView(health) {
  // 需要授权：cors_allowed === false（注意 null/undefined 视同允许）
  if (health?.cors_allowed === false) {
    const trustUrl = health.trust_url
    return {
      color: 'amber',
      text: '点击授权剪映助手',
      clickable: true,
      onClick: ({ onTrust }) => onTrust?.(trustUrl),
    }
  }
  const version = health?.version
  const text = version ? `已连接 v${version}` : '已连接'
  // 有新版本 + 有 release_url → 可点开 release
  if (health?.has_update === true && health.release_url) {
    return {
      color: 'emerald',
      text,
      clickable: true,
      onClick: ({ onOpenRelease }) => onOpenRelease?.(health.release_url),
      showRedDot: true,
      tooltip: health.latest_version ? `有新版 v${health.latest_version}，点击查看` : '有新版，点击查看',
    }
  }
  // 有新版本但缺 release_url → 仅显红点，tooltip
  if (health?.has_update === true) {
    return {
      color: 'emerald',
      text,
      clickable: false,
      showRedDot: true,
      tooltip: health.latest_version ? `有新版 v${health.latest_version}` : '有新版',
    }
  }
  // 正常已连接 → tooltip 显示端口
  return {
    color: 'emerald',
    text,
    clickable: false,
    tooltip: health?.port ? `端口 ${health.port}` : undefined,
  }
}
