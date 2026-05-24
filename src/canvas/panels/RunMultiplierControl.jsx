import { Dropdown } from 'antd'
import { ChevronDown } from '@/canvas/icons'

/**
 * 运行倍数控件 (×1 / ×2 / ×4) — Runner 层通用组件
 *
 * 样式参考原型 frame `eas3Z` (docs/prototype/ai-canvas.pen):
 *   - 50×36, 透明底, 1px image-accent 边框, 圆角 8
 *   - 文本 "×N" image-accent 色 + chevron-down 图标
 *
 * 使用方: 由各 capability 在自己的 DockedPanel 实现 (`modes/{ModeName}DockedPanel.jsx`)
 * 中 import 并嵌入到 Run 按钮右侧. 通用层不直接 import 本组件 —— 折叠形态参数面板
 * 完全由 capability 自定义 layout, 运行倍数控件作为 Runner 提供的标准积木.
 *
 * 行为: 选择倍数后, 调用 onChange(n). 实际运行由 DockedPanel 的 Run 按钮触发,
 * 把当前 value 透传给 onRun(nodeId, runCount).
 *
 * @param {object} props
 * @param {number} props.value          当前倍数 (默认 1)
 * @param {Function} props.onChange     选择新倍数时回调
 * @param {boolean} [props.disabled]    禁用 (locked / 缺必填等)
 * @param {number[]} [props.options]    可选倍数 (默认 [1, 2, 4])
 */
export default function RunMultiplierControl({
  value = 1,
  onChange,
  disabled = false,
  options = [1, 2, 4],
}) {
  const items = options.map((n) => ({
    key: String(n),
    label: `×${n}`,
  }))

  return (
    <Dropdown
      disabled={disabled}
      menu={{
        items,
        selectedKeys: [String(value)],
        onClick: ({ key }) => onChange?.(Number(key)),
      }}
      trigger={['click']}
    >
      <button
        type="button"
        className="docked-run-mul-btn"
        disabled={disabled}
        aria-label={`运行倍数: ×${value}`}
      >
        <span className="docked-run-mul-text">×{value}</span>
        <ChevronDown size={12} className="docked-run-mul-chevron" />
      </button>
    </Dropdown>
  )
}
