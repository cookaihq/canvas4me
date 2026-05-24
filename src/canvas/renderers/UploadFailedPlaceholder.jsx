import { AlertCircle, RotateCw } from '@/canvas/icons'

/**
 * 上传失败占位 — 拖入上传链路出错时的内联占位
 * 区别于 LoadFailedPlaceholder：
 *   - 错误文案直接来自上传 SDK，不走 REASON_MESSAGES 映射
 *   - 重试只针对本节点，不广播给画布上其他节点
 *
 * @param {string} message  上传失败的具体原因（来自 catch 的 err.message）
 * @param {() => void} onRetry  可选，点击重试按钮
 */
export default function UploadFailedPlaceholder({ message, onRetry }) {
  return (
    <div className="renderer-load-failed">
      <AlertCircle className="renderer-load-failed-icon" />
      <div className="renderer-load-failed-text" title={message}>
        上传失败{message ? `：${message}` : ''}
      </div>
      {onRetry && (
        <button
          type="button"
          className="renderer-load-failed-btn"
          onClick={(e) => { e.stopPropagation(); onRetry() }}
          aria-label="重新上传"
        >
          <RotateCw size={14} /> 重试
        </button>
      )}
    </div>
  )
}
