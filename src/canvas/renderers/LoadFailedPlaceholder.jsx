import { AlertCircle, RotateCw } from '@/canvas/icons'
import { REASON_MESSAGES } from '../utils/urlCheck'
import { retryAllFailed } from '../utils/retryBus'

/**
 * 加载失败占位 — 各 Renderer 共用
 * 点击"重试"按钮会广播给画布里所有处于错误态的节点，一键同时重试
 *
 * @param {string} reason  urlCheck.LOAD_ERROR_REASONS 中的值
 * @param {() => void} onRetry  可选，点击时也会触发当前节点自己的重试（作为兜底，确保自身立即响应）
 * @param {string} className  挂到外层的可选类名
 */
export default function LoadFailedPlaceholder({ reason, onRetry, className = '' }) {
  const text = REASON_MESSAGES[reason] || REASON_MESSAGES.unknown
  const handleRetry = (e) => {
    e.stopPropagation()
    onRetry?.()
    // 广播给画布中其他处于错误态的节点一起重试
    retryAllFailed()
  }
  return (
    <div className={`renderer-load-failed ${className}`.trim()}>
      <AlertCircle className="renderer-load-failed-icon" />
      <div className="renderer-load-failed-text">{text}</div>
      <button
        type="button"
        className="renderer-load-failed-btn"
        onClick={handleRetry}
        title="同时重试画布中所有加载失败的节点"
        aria-label="重试"
      >
        <RotateCw size={14} /> 重试
      </button>
    </div>
  )
}
