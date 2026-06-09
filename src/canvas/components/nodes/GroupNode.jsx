import { memo } from 'react'
import { NodeResizer, useStore } from '@xyflow/react'
import NodeMetaRow from '../NodeMetaRow'
import { GROUP_DEFAULT_COLOR, GROUP_DEFAULT_SIZE, GROUP_PADDING } from '../../constants/group'
import { getNodeRect } from '../../utils/groupGeometry'

function GroupNode({ id, data, selected }) {
  const color = data.color || GROUP_DEFAULT_COLOR

  // 最小尺寸 = 包住所有成员 + padding（单向只读派生, 绝不回写成员; spec §6 铁律 2）。空组回落默认尺寸。
  // 注: 此处用子节点相对坐标 r.x+r.width 当相对右/下边界 —— 仅在成员相对坐标非负时等价于内容边界。
  // 成员被拖到负相对坐标(往父左/上溢出)的场景在 Plan C(recompute-on-dragStop)处理, Plan A 不触发。
  const minSize = useStore((s) => {
    let maxRight = 0, maxBottom = 0, hasChild = false
    for (const n of s.nodeLookup.values()) {
      if (n.parentId !== id) continue
      hasChild = true
      const r = getNodeRect(n)
      maxRight = Math.max(maxRight, r.x + r.width)
      maxBottom = Math.max(maxBottom, r.y + r.height)
    }
    if (!hasChild) return GROUP_DEFAULT_SIZE
    return { width: maxRight + GROUP_PADDING, height: maxBottom + GROUP_PADDING }
  }, (a, b) => a.width === b.width && a.height === b.height)

  return (
    <>
      <NodeResizer
        minWidth={minSize.width}
        minHeight={minSize.height}
        isVisible={selected}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />
      <NodeMetaRow nodeId={id} name={data.name ?? ''} />
      <div
        className={`group-node ${selected ? 'selected' : ''} ${data._dropTarget ? 'drop-target' : ''}`}
        style={{ background: hexToRgba(color, 0.12), borderColor: color }}
      />
    </>
  )
}

// 背景半透明、边框实色(spec §5.2 颜色作用于边框+半透明背景)。不用 opacity(会连边框一起透明)。
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export default memo(GroupNode)
