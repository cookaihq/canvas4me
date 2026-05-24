import { Loader2 } from '@/canvas/icons'

/**
 * 加载中占位 — 各 Renderer 共用
 * @param {string} label  可选文案，默认"加载中..."
 * @param {string} className  挂到外层的可选类名
 * @param {number} [progress]  可选 0-100 整数；传入时在 label 下方显示进度条
 */
export default function LoadingPlaceholder({ label = '加载中...', className = '', progress }) {
  const hasProgress = typeof progress === 'number' && progress >= 0
  const clamped = hasProgress ? Math.max(0, Math.min(100, Math.floor(progress))) : 0
  return (
    <div className={`renderer-loading ${className}`.trim()}>
      <Loader2 className="renderer-loading-icon" />
      {label && <div className="renderer-loading-text">{label}</div>}
      {hasProgress && (
        <div className="renderer-loading-progress" aria-label="upload progress">
          <div className="renderer-loading-progress-fill" style={{ width: `${clamped}%` }} />
          <div className="renderer-loading-progress-text">{clamped}%</div>
        </div>
      )}
    </div>
  )
}
