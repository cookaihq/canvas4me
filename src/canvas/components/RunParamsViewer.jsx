import { ChevronLeft } from '@/canvas/icons'

function renderValue(v) {
  if (v == null) return <em className="run-params-viewer-empty">—</em>
  if (typeof v === 'string') {
    if (/^https?:\/\//.test(v)) {
      const display = v.length > 50 ? `${v.slice(0, 50)}…` : v
      return (
        <a href={v} target="_blank" rel="noreferrer" className="run-params-viewer-link">
          {display}
        </a>
      )
    }
    return v.length > 80 ? `${v.slice(0, 80)}…` : v
  }
  if (Array.isArray(v)) return `[${v.length} 项]`
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 80 ? `${s.slice(0, 80)}…` : s
  }
  return String(v)
}

export default function RunParamsViewer({ snapshot, onEditStart, onExit }) {
  if (!snapshot) return null

  const entries = Object.entries(snapshot)

  return (
    <div className="run-params-viewer">
      <div className="run-params-viewer-header">
        <button
          type="button"
          className="run-params-viewer-back"
          onClick={onExit}
        >
          <ChevronLeft size={13} />
          返回当前草稿
        </button>
        <span className="run-params-viewer-label">上次运行参数</span>
      </div>

      {entries.length === 0 ? (
        <div className="run-params-viewer-empty-state">（无参数记录）</div>
      ) : (
        <div className="run-params-viewer-fields">
          {entries.map(([key, value]) => (
            <div key={key} className="run-params-viewer-field">
              <span className="run-params-viewer-field-name">{key}</span>
              <span className="run-params-viewer-field-value">{renderValue(value)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="run-params-viewer-actions">
        <button
          type="button"
          className="run-params-viewer-edit-btn"
          onClick={onEditStart}
        >
          基于这些参数继续编辑
        </button>
      </div>
    </div>
  )
}
