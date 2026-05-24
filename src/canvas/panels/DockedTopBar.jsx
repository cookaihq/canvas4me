/**
 * DockedTopBar —— DockedPanel 顶栏(渐进显示三段)
 *
 * 三段渐进显示规则:
 *   - 左·能力切换 chip:同 nodeType 多 capability 才显示
 *   - 中·mode tab:capability 有多 mode 才显示
 *   - 右·↗ 模态框切换:默认显示;showExpand=false 时整段隐藏
 *     (适用 capability 没有"放大输入"需求的场景,如剪映草稿:无 prompt 长文本,
 *      modal 跟 default 视觉无差,渲染 ↗ 会误导用户)
 *
 * 跨能力切换在能力为单一时不渲染左段;mode 单一时不渲染中段;视觉上保持稳态。
 */
import { useMemo } from 'react'
import { Tooltip, Dropdown } from 'antd'
import { Sparkles, ChevronDown, Maximize2, Minimize2 } from '@/canvas/icons'
import { CAPABILITIES } from '../registry/nodeTypes'
import { groupCapabilitiesByCategory } from '../registry/groupCapabilities'

export default function DockedTopBar({
  capability,
  mode,
  variant = 'default',
  showExpand = true,
  onCapabilityChange,
  onModeChange,
  onRequestVariant,
}) {
  const isModal = variant === 'modal'
  const currentCap = CAPABILITIES[capability]
  const nodeType = currentCap?.nodeType
  const currentCapLabel = currentCap?.label || capability

  // 同 nodeType 下其他 capability 按 category 分组(包含自己)
  // 占位 capability(未实现)不进下拉
  const groups = useMemo(() => {
    if (!nodeType) return []
    return groupCapabilitiesByCategory(nodeType)
      .map(g => ({ ...g, capabilities: g.capabilities.filter(c => !c.placeholder) }))
      .filter(g => g.capabilities.length > 0)
  }, [nodeType])
  const peerCount = useMemo(
    () => groups.reduce((n, g) => n + g.capabilities.length, 0),
    [groups]
  )

  const modeOptions = useMemo(() => (
    Object.entries(currentCap?.modes || {})
      .map(([id, m]) => ({ value: id, label: m.label || id }))
  ), [currentCap])

  const showCapabilityChip = peerCount >= 1
  const showModeTabs = modeOptions.length > 1

  const dropdownItems = useMemo(() => {
    const items = []
    groups.forEach((g, gi) => {
      if (gi > 0) items.push({ type: 'divider', key: `div-${gi}` })
      if (g.label) {
        items.push({
          type: 'group',
          key: `grp-${g.categoryId ?? '__other__'}`,
          label: (
            <span className="docked-topbar-menu-group">
              {g.icon && <g.icon size={13} />}<span>{g.label}</span>
            </span>
          ),
          children: g.capabilities.map(c => menuItem(c)),
        })
      } else {
        for (const c of g.capabilities) items.push(menuItem(c))
      }
    })
    return items

    function menuItem(c) {
      const Icon = c.displayIcon || null
      return {
        key: c.id,
        label: (
          <span className="docked-topbar-menu-item">
            {Icon && <Icon size={15} />}<span>{c.label || c.id}</span>
          </span>
        ),
        onClick: () => onCapabilityChange?.(c.id),
      }
    }
  }, [groups, onCapabilityChange])

  return (
    <div className="docked-topbar">
      {showCapabilityChip ? (
        <Dropdown menu={{ items: dropdownItems, selectedKeys: [capability] }} trigger={['click']}>
          <button type="button" className="docked-topbar-cap-btn nodrag">
            <Sparkles size={14} className="docked-topbar-cap-icon" />
            <span className="docked-topbar-cap-text">{currentCapLabel}</span>
            <ChevronDown size={12} className="docked-topbar-cap-caret" />
          </button>
        </Dropdown>
      ) : (
        <div className="docked-topbar-cap-spacer" />
      )}

      {showModeTabs ? (
        <div className="docked-topbar-modes" role="tablist">
          {modeOptions.map(opt => {
            const selected = opt.value === mode
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`docked-topbar-mode-tab${selected ? ' selected' : ''}`}
                onClick={() => onModeChange?.(opt.value)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="docked-topbar-modes-spacer" />
      )}

      {showExpand && (
        <div className="docked-topbar-icons">
          {isModal ? (
            <Tooltip title="缩小输入">
              <button
                type="button"
                className="docked-icon-btn"
                onClick={() => onRequestVariant?.('default')}
                aria-label="缩小输入"
              >
                <Minimize2 size={16} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip title="放大输入">
              <button
                type="button"
                className="docked-icon-btn"
                onClick={() => onRequestVariant?.('modal')}
                aria-label="放大输入"
              >
                <Maximize2 size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}
