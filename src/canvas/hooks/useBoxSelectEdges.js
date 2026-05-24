import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 框选 edges — 拖动鼠标的选区框与 edge 路径有重叠时把 edge 选中.
 *
 * React Flow 12 默认: 框选只选 nodes; edge 仅当两端 node 都被选中时跟随选中.
 * 且 RF 12 的 store.userSelectionRect 在拖动期间不持续更新 (实测只在 mousedown 时
 * 同步一次 0×0 起点, mouseup 时清成 null), 因此不能靠 useStore 拿实时 rect.
 *
 * 改用直接在 document 上监听 pointer 事件 (capture phase), 自己跟踪鼠标 start/end:
 *   1. pointerdown 时若 e.target 在 .react-flow__pane 内, 且 pane 带 .selection class
 *      (即当前是 selectionOnDrag 模式) → 记录 start screen 坐标
 *   2. pointermove → 跟踪 end screen 坐标
 *   3. pointerup → 算 rect (screen) → screenToFlowPosition 转 flow logical →
 *      对每条 edge 的 SVG 路径采样 (8 logical px / 点, 限 10-50 个) 检测是否落入 rect →
 *      相交的 edges setEdges selected: true
 *
 * 跟 RF 12 自己的 node 框选并行, 互不干扰.
 */
export default function useBoxSelectEdges() {
  const { getEdges, screenToFlowPosition } = useReactFlow()
  const facade = useCanvasFacade()
  const startRef = useRef(null)
  const endRef = useRef(null)
  // 装在 ref 里, 避免每次 RF 内部更新触发 effect re-bind listener
  const apiRef = useRef({ getEdges, batchUpdateEdges: facade.batchUpdateEdges, screenToFlowPosition })
  apiRef.current = { getEdges, batchUpdateEdges: facade.batchUpdateEdges, screenToFlowPosition }

  useEffect(() => {
    const onDown = (e) => {
      const pane = e.target?.closest?.('.react-flow__pane')
      if (!pane) return
      if (!pane.classList.contains('selection')) return
      startRef.current = { x: e.clientX, y: e.clientY }
      endRef.current = null
    }

    const onMove = (e) => {
      if (!startRef.current) return
      endRef.current = { x: e.clientX, y: e.clientY }
    }

    const onUp = () => {
      const start = startRef.current
      const end = endRef.current
      startRef.current = null
      endRef.current = null
      if (!start || !end) return

      const sx = Math.min(start.x, end.x)
      const sy = Math.min(start.y, end.y)
      const ex = Math.max(start.x, end.x)
      const ey = Math.max(start.y, end.y)
      // <3px 视为点击, 不框选 (RF 12 自身 selection 同样区分)
      if (ex - sx < 3 && ey - sy < 3) return

      const { getEdges: gE, batchUpdateEdges: bUE, screenToFlowPosition: s2f } = apiRef.current
      const flowStart = s2f({ x: sx, y: sy })
      const flowEnd = s2f({ x: ex, y: ey })
      const rect = {
        x: flowStart.x,
        y: flowStart.y,
        width: flowEnd.x - flowStart.x,
        height: flowEnd.y - flowStart.y,
      }

      const edges = gE()
      if (edges.length === 0) return

      const matched = new Set()
      edges.forEach((edge) => {
        const pathEl = document.querySelector(
          `.react-flow__edge[data-id="${cssEscape(edge.id)}"] .react-flow__edge-path`
        )
        if (pathEl && isPathIntersectingRect(pathEl, rect)) matched.add(edge.id)
      })
      if (matched.size === 0) return

      bUE((eds) => eds.map((e) => (matched.has(e.id) && !e.selected ? { ...e, selected: true } : e)))
    }

    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', onUp, true)
    }
  }, [])
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

// 路径与矩形相交检测 — 沿路径采样若干点, 任一点落入矩形即视为相交
function isPathIntersectingRect(pathEl, rect) {
  let totalLength = 0
  try {
    totalLength = pathEl.getTotalLength()
  } catch {
    return false
  }
  if (totalLength <= 0) return false

  const samples = Math.min(50, Math.max(10, Math.ceil(totalLength / 8)))
  const x1 = Math.min(rect.x, rect.x + rect.width)
  const y1 = Math.min(rect.y, rect.y + rect.height)
  const x2 = Math.max(rect.x, rect.x + rect.width)
  const y2 = Math.max(rect.y, rect.y + rect.height)

  for (let i = 0; i <= samples; i++) {
    const pt = pathEl.getPointAtLength((i / samples) * totalLength)
    if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return true
  }
  return false
}
