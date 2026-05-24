import { useEffect } from 'react'
import { useStore } from '@xyflow/react'
import { OUTPUT_STACK_GAP } from '../constants/spacing'
import { isOutputNodeType } from '../registry/nodeTypes'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 自动堆叠重排 hook
 *
 * 触发场景:同一能力节点下多个输出节点纵向堆叠后,某个节点高度变化
 * (失败节点被长错误信息撑高、loading→结果切换),把它"之下"的兄弟同步下移避免重叠。
 *
 * 触发因子:autoPositioned 输出节点的 (id, measured.height) 指纹。用 useStore 窄订阅
 * 该指纹字符串(而非 useNodes() 全量数组),只在指纹变化时重算 —— 减少无谓重渲染。
 * 写回幂等收敛:|当前 y - 期望 y| > 阈值才写(值真变才动),不发散。
 */
const REFLOW_THRESHOLD_PX = 1

export default function useAutoStackReflow() {
  const facade = useCanvasFacade()

  // 仅订阅 autoPositioned 输出节点的 (id, measured.height) 指纹字符串(变了才触发)
  const reflowKey = useStore((s) => {
    const parts = []
    for (const n of s.nodeLookup.values()) {
      if (!isOutputNodeType(n.type)) continue
      if (!n.data?.autoPositioned) continue
      const h = n.measured?.height
      parts.push(`${n.id}:${typeof h === 'number' ? Math.round(h) : '_'}`)
    }
    return parts.sort().join('|')
  })

  useEffect(() => {
    const nodes = facade.getNodes()
    // 按 sourceCapabilityId 分组
    const groups = new Map()
    for (const n of nodes) {
      if (!isOutputNodeType(n.type)) continue
      if (!n.data?.autoPositioned) continue
      const src = n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId
      if (!src) continue
      if (!groups.has(src)) groups.set(src, [])
      groups.get(src).push(n)
    }

    const updates = new Map()
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a, b) => a.position.y - b.position.y)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const cur = sorted[i]
        const prevMeasuredH = typeof prev.measured?.height === 'number' ? prev.measured.height : null
        const prevExplicitH = typeof prev.height === 'number' ? prev.height : null
        const prevRawStyleH = prev.style?.height
        const prevStyleH = typeof prevRawStyleH === 'number' ? prevRawStyleH : parseFloat(prevRawStyleH) || null
        const prevH = prevMeasuredH ?? prevExplicitH ?? prevStyleH ?? 100
        const expectY = prev.position.y + prevH + OUTPUT_STACK_GAP
        if (Math.abs(cur.position.y - expectY) > REFLOW_THRESHOLD_PX) {
          updates.set(cur.id, expectY)
        }
      }
    }

    // 幂等:无需写则直接返回,不触发任何 store 更新
    if (updates.size === 0) return
    // 复用顶部快照:moveNode 只改 y、x 透传,快照里的 x 永远正确,无需重复全量拉取
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    for (const [id, y] of updates) {
      const cur = nodeById.get(id)
      if (cur) facade.moveNode(id, { x: cur.position.x, y })
    }
    // 依赖 reflowKey:仅在 autoPositioned 节点 id 集合或高度变化时重排
    // facade 引用稳定(useCanvasFacade 用 useMemo([rf]),rf 生命周期内不变),reflowKey 是唯一触发因子
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflowKey])
}
