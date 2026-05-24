import { useEffect, useRef } from 'react'
import { useStore } from '@xyflow/react'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 同步: 文本端口的 incoming edges ↔ prompt 字符串里的 edge placeholder
 *
 * 双向同步:
 * - edges 变化(用户在画布上连/删线) → 在 prompt 末尾追加 / 移除 {{ai-canvas:edge:<sid>}}
 * - prompt 变化(用户粘贴 / 编辑后多了 placeholder) → 在画布上补 edge(节点存在的)
 *
 * 通过 valueRef 跟踪当前 prompt,避免 useEffect 依赖循环。
 *
 * @param {object} args
 * @param {string} args.value
 * @param {(next: string) => void} args.onChange
 * @param {string} args.nodeId      — 当前能力节点 id (target)
 * @param {string} args.portId      — 文本端口 id (例 'prompt' / 'system-prompt')
 * @param {Array}  args.edges       — React Flow edges
 */
const PLACEHOLDER_GLOBAL_RE = /\{\{ai-canvas:edge:([^}]+)\}\}/g

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 推断源节点的输出 handle id (用于 setEdges 时正确建 edge)
// - input/content 节点: handle id = subType (text/image/audio/...)
// - capability 节点: handle id = '{type}-out' (text-out / image-out)
// 文本端口的源通常是 text input 节点或 LLM 输出, 这两种 fallback 已覆盖
function inferTextSourceHandle(sourceNode) {
  if (!sourceNode) return 'text-out'
  const nt = sourceNode.type
  if (nt === 'content' || nt === 'input') {
    return sourceNode.data?.subType || 'text'
  }
  // capability 节点(LLM) 默认 'text-out'
  return 'text-out'
}

export default function useEdgePlaceholderSync({ value, onChange, nodeId, portId, edges }) {
  const facade = useCanvasFacade()
  const nodes = useStore(s => s.nodes)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  // 此 (nodeId, portId) 上所有连入的 source ids
  const connectedIds = edges
    .filter(e => e.target === nodeId && e.targetHandle === portId)
    .map(e => e.source)
  const connectedKey = connectedIds.join(',')

  // ── 正向: edges 变化 → 同步 placeholder 集合 ──
  useEffect(() => {
    const current = valueRef.current || ''
    const existing = []
    current.replace(PLACEHOLDER_GLOBAL_RE, (_m, sid) => { existing.push(sid); return _m })

    const toAdd = connectedIds.filter(id => !existing.includes(id))
    const toRemove = existing.filter(id => !connectedIds.includes(id))
    if (toAdd.length === 0 && toRemove.length === 0) return

    let next = current
    for (const id of toRemove) {
      const re = new RegExp(`\\{\\{ai-canvas:edge:${escapeRegExp(id)}\\}\\}`, 'g')
      next = next.replace(re, '')
    }
    for (const id of toAdd) {
      next += `{{ai-canvas:edge:${id}}}`
    }

    if (next !== current) {
      onChange?.(next)
    }
    // 故意只依赖 connectedKey, 不依赖 value: edges 变化时同步一次,
    // 用户后续手动编辑文本不应触发本逻辑 (不然会无限循环)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey, nodeId, portId])

  // ── 反向: value 变化(粘贴 / 编辑) → 检测新 placeholder 在 prompt 里
  //    但 edges 里没有 → 补 edge (节点存在的)
  useEffect(() => {
    const v = value || ''
    if (!v.includes('{{ai-canvas:edge:')) return

    const placeholders = []
    v.replace(PLACEHOLDER_GLOBAL_RE, (_m, sid) => {
      if (!placeholders.includes(sid)) placeholders.push(sid)
      return _m
    })

    const toAddSourceIds = placeholders.filter(sid => {
      if (connectedIds.includes(sid)) return false  // 已有 edge,跳过
      // 节点必须存在画布上才补 edge;不存在的 placeholder 留字面字符串
      return nodes.some(n => n.id === sid)
    })

    if (toAddSourceIds.length === 0) return

    facade.batchUpdateEdges(eds => {
      // 再次校验(并发安全):此刻已经有 edge 的不再补
      const already = new Set(
        eds
          .filter(e => e.target === nodeId && e.targetHandle === portId)
          .map(e => e.source)
      )
      const newEdges = toAddSourceIds
        .filter(sid => !already.has(sid))
        .map(sid => {
          const sourceNode = nodes.find(n => n.id === sid)
          const sourceHandle = inferTextSourceHandle(sourceNode)
          return {
            id: `edge-${sid}-${nodeId}-${portId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            source: sid,
            sourceHandle,
            target: nodeId,
            targetHandle: portId,
            type: 'custom',
          }
        })
      if (newEdges.length === 0) return eds
      return [...eds, ...newEdges]
    })
    // 故意不依赖 connectedKey, 避免和正向 useEffect 互相触发循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, nodes, nodeId, portId, facade])
}
