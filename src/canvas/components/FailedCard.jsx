import { useState } from 'react'
import { Button } from 'antd'
import { AlertCircle, RotateCw, RefreshCw } from '@/canvas/icons'
import ErrorLogModal from './ErrorLogModal'

/**
 * Failed 状态四必含元素卡片 — 按 docs/reference/ux-spec.md §6.1
 *
 *   ① 红圈白叹号图标(32px)
 *   ② 错误摘要(≤80 字红字, 由 getCapabilityErrorSummary 提供)
 *   ③ 查看完整日志(灰链接,点击弹 ErrorLogModal)
 *   ④ 重连/重试按钮:
 *      - 单 onRetry: 主按钮"重试"(从头跑整个能力)
 *      - 同时传 onReconnect+onRetry: 主按钮"重连"(查任务状态恢复, 不消耗配额)
 *        + 次按钮"重试"(任务真失败时的兜底)
 *
 * Props:
 *   - summary     : 已截断到 80 字的中文摘要(必填)
 *   - rawError    : 原始错误对象/字符串(传给 ErrorLogModal)
 *   - onRetry     : () => void  点击重试按钮触发(可缺省, 缺省时按钮禁用)
 *   - onReconnect : () => void  可选; 传了就额外显示"重连"主按钮, "重试"降为次按钮
 */
export default function FailedCard({ summary, rawError, onRetry, onReconnect }) {
  const [logOpen, setLogOpen] = useState(false)
  const hasReconnect = typeof onReconnect === 'function'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        width: '100%',
        height: '100%',
        background: 'rgba(239, 68, 68, 0.04)',
        boxSizing: 'border-box',
      }}
    >
      <AlertCircle size={32} style={{ color: '#EF4444' }} />

      <div
        style={{
          color: '#B91C1C',
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: 'center',
          maxWidth: '100%',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {summary || '生成失败'}
      </div>

      <Button
        type="link"
        size="small"
        className="nodrag"
        style={{ color: '#6B7280', fontSize: 12, padding: 0, height: 'auto' }}
        onClick={() => setLogOpen(true)}
      >
        查看完整日志
      </Button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {hasReconnect && (
          <Button
            type="primary"
            size="small"
            icon={<RefreshCw size={14} />}
            className="nodrag ac-btn-accent"
            onClick={onReconnect}
          >
            重连
          </Button>
        )}
        <Button
          type={hasReconnect ? 'default' : 'primary'}
          size="small"
          icon={<RotateCw size={14} />}
          className={hasReconnect ? 'nodrag' : 'nodrag ac-btn-accent'}
          onClick={onRetry}
          disabled={typeof onRetry !== 'function'}
        >
          重试
        </Button>
      </div>

      <ErrorLogModal
        open={logOpen}
        rawError={rawError}
        onClose={() => setLogOpen(false)}
      />
    </div>
  )
}
