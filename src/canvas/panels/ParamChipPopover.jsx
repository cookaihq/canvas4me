/**
 * ParamChipPopover —— 参数 chip 点击后弹出的 340px 面板内容
 *
 * 详见 docs/reference/ux-spec.md §9.5。每个 commonParams 项渲染一组 [标题]+控件,
 * 组间 16px gap;改动立即触发 onParamsChange,无确认按钮。
 *
 * 不直接渲染浮层(由 ParamChip 包到 Ant Popover 里),只负责内容。
 */
import ParamControlRenderer from './ParamControlRenderer'

export default function ParamChipPopover({
  commonParams = [],
  params = {},
  onParamsChange,
  extraOptions = {},
}) {
  if (!commonParams.length) {
    return (
      <div className="param-popover-empty">
        当前 mode 未配置常用参数
      </div>
    )
  }

  const handleChange = (key) => (value) => {
    if (typeof onParamsChange !== 'function') return
    onParamsChange({ [key]: value })
  }

  return (
    <div className="param-popover-content">
      {commonParams.map(spec => {
        // 允许 capability 在运行时注入选项(如 model 列表来自后端)
        const dynamic = extraOptions[spec.key] || null
        const merged = dynamic ? { ...spec, ...dynamic } : spec
        const value = params[merged.key] ?? merged.defaultValue
        return (
          <div key={merged.key} className="param-popover-group">
            <div className="param-popover-label">
              {merged.icon && <span className="param-popover-icon">{merged.icon}</span>}
              <span>{merged.label}</span>
            </div>
            <ParamControlRenderer
              spec={merged}
              value={value}
              onChange={handleChange(merged.key)}
              params={params}
            />
          </div>
        )
      })}
    </div>
  )
}
