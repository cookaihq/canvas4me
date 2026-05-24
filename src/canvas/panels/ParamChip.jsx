/**
 * ParamChip —— DockedPanel 底栏左侧的"参数概要 chip"
 *
 * 文本拼接规则:
 *   按 commonParams 数组顺序,取每个 param 的 "短形式":
 *     - 优先 spec.shortFormat(value)  / spec.shortFormat(value, params)
 *     - 否则从 options 里找 value === value 的 shortLabel 或 label
 *     - 否则直接 String(value)
 *   分隔符 " · " 拼接;icon 放在每段开头(可选)
 *   总宽不超 280px,超出中间省略号(CSS 实现)
 *
 * 末尾 ▼/▲ 表示 Popover 开关态。
 */
import { useEffect, useRef, useState } from 'react'
import { Popover } from 'antd'
import { useStore } from '@xyflow/react'

import { ChevronDown, ChevronUp, RectangleHorizontal } from '@/canvas/icons'
import ParamChipPopover from './ParamChipPopover'

function pickShort(spec, value, params) {
  if (typeof spec.shortFormat === 'function') {
    try {
      const v = spec.shortFormat(value, params)
      if (v != null && v !== '') return String(v)
    } catch { /* fall through */ }
  }
  if (Array.isArray(spec.options)) {
    const found = spec.options.find(o => (typeof o === 'object' ? o.value : o) === value)
    if (found && typeof found === 'object') {
      return String(found.shortLabel ?? found.label ?? found.value)
    }
    if (found != null) return String(found)
  }
  if (value == null || value === '') return ''
  return String(value)
}

function renderChipText(commonParams, params, extraOptions) {
  if (!commonParams?.length) return null
  const segments = commonParams
    .map(specRaw => {
      const dynamic = extraOptions?.[specRaw.key]
      const spec = dynamic ? { ...specRaw, ...dynamic } : specRaw
      const value = params?.[spec.key] ?? spec.defaultValue
      const short = pickShort(spec, value, params)
      if (!short && !spec.showWhenEmpty) return null
      return short || '—'
    })
    .filter(Boolean)
  // 各段之间用灰色 · 分隔 (在 CSS 里给 .param-chip-sep 上色)
  return segments
}

export default function ParamChip({
  commonParams = [],
  params = {},
  onParamsChange,
  extraOptions = {},
  disabled = false,
  showIcon = true,
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef(null)
  // 画布 pan/zoom 时 chip 跟着 DockedPanel 重新定位, 但 antd Popover 默认只在 open / window resize 时算位置
  // → 订阅 transform, 变化时强制 popover 重对齐, 让浮层始终吸附 chip
  // open=false 时返回固定 null, useStore shallow 比较稳定, 不会引起重渲染
  const transform = useStore(s => (open ? s.transform : null))
  useEffect(() => {
    if (!open) return
    const ref = popoverRef.current
    if (typeof ref?.forceAlign === 'function') ref.forceAlign()
    else if (typeof ref?.forcePopupAlign === 'function') ref.forcePopupAlign()
  }, [transform, open])

  const segments = renderChipText(commonParams, params, extraOptions)

  if (!commonParams.length) return null

  const popoverContent = (
    <ParamChipPopover
      commonParams={commonParams}
      params={params}
      onParamsChange={onParamsChange}
      extraOptions={extraOptions}
    />
  )

  // 注:button 上不要自己加 onClick → setOpen,会跟 Ant Popover 的 trigger="click"
  // 双重触发,React 18 batched updates 下两个 toggle 互相抵消,state 永远不会变。
  // 受控模式下统一由 Ant Popover 的 onOpenChange 回调驱动 open 状态。
  return (
    <Popover
      ref={popoverRef}
      open={open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      trigger="click"
      placement="topLeft"
      arrow
      autoAdjustOverflow={false}
      align={{ offset: [0, 0] }}
      overlayClassName="param-chip-popover"
      content={popoverContent}
      destroyOnHidden
    >
      <button
        type="button"
        className={`param-chip nodrag${open ? ' open' : ''}`}
        disabled={disabled}
      >
        {showIcon && (
          <span className="param-chip-icon">
            <RectangleHorizontal size={12} strokeWidth={2} />
          </span>
        )}
        <span className="param-chip-text">
          {segments?.length ? (
            segments.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className="param-chip-sep"> · </span>}
                <span className="param-chip-seg">{seg}</span>
              </span>
            ))
          ) : (
            <span className="param-chip-seg">配置参数</span>
          )}
        </span>
        <span className="param-chip-caret">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
    </Popover>
  )
}
