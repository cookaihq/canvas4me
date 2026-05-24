import { memo, useCallback, useMemo } from 'react'
import { message } from 'antd'
import { useCanvasFacade } from '../../state/canvasFacade'
import {
  CAPABILITIES,
  getNodeType,
  isPlaceholderCapability,
  getPlaceholderHint,
} from '../../registry/nodeTypes'
import { groupCapabilitiesByCategory } from '../../registry/groupCapabilities'
import { NodeTypeIcons } from '@/canvas/icons'
import { resolveInitialParams } from '../../utils/capabilityDefaults'
import { computeCapabilityCardHeight } from '../../utils/nodeFactory'
import { getInitialSize, pickSizePresetKey } from '../../constants/spacing'
import { usePanelContext } from '../../contexts/PanelContext'

/**
 * 能力节点卡片初始态(原型 Frame 2T97S)
 *
 * 用户新建能力节点时(尚未选择子能力),卡片直接展示该能力类型下
 * 所有子能力的 chip 列表;点击 chip 即选中子能力(自动设 defaultMode)并打开右侧面板。
 *
 * 选中后 data.capability 不再为空,本组件被 CapabilityNode.jsx 跳过,切换到具体子能力卡片。
 * 回退方式:运行后锁定不可回退;未运行时在右侧面板 Header 下拉切换子能力(§5.5)。
 *
 * 占位 capability:registry spec.placeholder = true 的 capability 仍在 chip 列表显示,
 * 加"即将上线"角标,点击只 toast 提示,不创建/选中节点。
 */
function CapabilityCardInitialPicker({ nodeId, nodeType }) {
  const facade = useCanvasFacade()
  const { openPanel } = usePanelContext()

  const typeInfo = useMemo(() => getNodeType(nodeType), [nodeType])
  const groups = useMemo(
    () => groupCapabilitiesByCategory(nodeType),
    [nodeType]
  )

  const handlePick = useCallback(
    (capabilityId) => {
      if (isPlaceholderCapability(capabilityId)) {
        message.info(getPlaceholderHint())
        return
      }
      const cap = CAPABILITIES[capabilityId]
      const defaultMode = cap?.defaultMode ?? null
      // 折叠形态(form: 'folded')+ 声明 productType 的 capability:
      // 选中后切到内容档位尺寸(图 348×465 / 视频横 620×348 等),与 §3.2.1 一致
      // 紧凑形态(form: 'separated' 或未声明 productType): 沿用按输入端口数估算的紧凑高度
      const isFolded = cap?.form === 'folded' && !!cap?.productType
      let nextSize
      if (isFolded) {
        const presetKey = pickSizePresetKey(cap.productType)
        nextSize = getInitialSize(presetKey)
      } else {
        nextSize = { height: computeCapabilityCardHeight(capabilityId, defaultMode) }
      }
      facade.batchUpdateNodes(nds =>
        nds.map(n =>
          n.id === nodeId
            ? {
              ...n,
              data: {
                ...n.data,
                capability: capabilityId,
                mode: defaultMode,
                // 当前 mode 桶: commonParams.defaultValue + 上次该 (cap, mode) 用过的参数缓存
                modeParams: defaultMode
                  ? { [defaultMode]: resolveInitialParams(capabilityId, defaultMode) }
                  : {},
                portConnections: {},
              },
              style: isFolded
                ? { ...n.style, width: nextSize.width, height: nextSize.height }
                : { ...n.style, height: nextSize.height },
            }
            : n
        )
      )
      openPanel(nodeId)
    },
    [nodeId, facade, openPanel]
  )

  const TypeIcon = typeInfo?.icon || NodeTypeIcons.llm

  return (
    <div className="capability-card-initial">
      <div className="capability-card-initial-header">
        <span className="capability-card-initial-icon"><TypeIcon size={18} /></span>
        <span className="capability-card-initial-type">
          {typeInfo?.label || '能力'}
        </span>
      </div>
      {/* nowheel 允许滚动列表不触发画布缩放;nodrag 只扣在 chip 上 */}
      <div className="capability-card-initial-chips nowheel">
        {groups.map(group => (
          <div key={group.categoryId ?? '__default__'} className="capability-card-group">
            {group.label && (
              <div className="capability-card-group-label">
                {group.icon && <group.icon size={13} />}
                <span>{group.label}</span>
              </div>
            )}
            <div className="capability-card-group-chips">
              {group.capabilities.map(cap => {
                const placeholder = cap.placeholder === true
                const CapIcon = cap.displayIcon || null
                return (
                  <button
                    key={cap.id}
                    type="button"
                    className={`capability-card-chip nodrag${placeholder ? ' is-placeholder' : ''}`}
                    onClick={() => handlePick(cap.id)}
                    title={placeholder ? getPlaceholderHint() : undefined}
                  >
                    {CapIcon && <CapIcon size={14} className="capability-card-chip-icon" />}
                    {cap.label}
                    {placeholder && (
                      <span className="capability-card-chip-badge">{getPlaceholderHint()}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(CapabilityCardInitialPicker)
