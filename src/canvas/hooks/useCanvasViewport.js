import { useCallback, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'

// 平移补偿: 把目标点放到"可见区中心"而非"容器几何中心"
// 可见区 = 容器减掉底部 DockedPanel(docked 形态) + 左侧 Toolbar
// modal 形态的 docked-panel 是覆盖式对话框,无法躲避,不补偿
function getVisibleCenterOffset(zoom) {
  if (typeof document === 'undefined') return { dx: 0, dy: 0 }
  const panel = document.querySelector('.docked-panel:not(.docked-panel-modal-shell)')
  const toolbar = document.querySelector('.ai-canvas-toolbar')
  const panelH = panel ? panel.getBoundingClientRect().height : 0
  const toolbarW = toolbar ? toolbar.getBoundingClientRect().width : 0
  return {
    dx: toolbarW / 2 / zoom,
    dy: -panelH / 2 / zoom,
  }
}

export default function useCanvasViewport({ nodes }) {
  const { screenToFlowPosition, getViewport, setCenter, getNode } = useReactFlow()

  const getViewportCenter = useCallback(() => {
    const pane = document.querySelector('.ai-canvas-main')
    if (pane) {
      const rect = pane.getBoundingClientRect()
      return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
  }, [screenToFlowPosition])

  const centerNodeAt = useCallback((node, target) => {
    const rawW = node.style?.width
    const rawH = node.style?.height
    const w = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 0
    const h = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 0
    return {
      ...node,
      position: { x: target.x - w / 2, y: target.y - h / 2 },
    }
  }, [])

  const findFreeSpot = useCallback((target) => {
    const STACK_OFFSET = 60
    const OVERLAP_THRESHOLD = 30
    const centers = nodes.map((n) => {
      const rawW = n.style?.width ?? n.width
      const rawH = n.style?.height ?? n.height
      const w = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 0
      const h = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 0
      return {
        x: (n.position?.x ?? 0) + w / 2,
        y: (n.position?.y ?? 0) + h / 2,
      }
    })
    let spot = { x: target.x, y: target.y }
    for (let i = 0; i < 50; i++) {
      const hit = centers.some(c =>
        Math.abs(c.x - spot.x) < OVERLAP_THRESHOLD &&
        Math.abs(c.y - spot.y) < OVERLAP_THRESHOLD
      )
      if (!hit) return spot
      spot = { x: spot.x + STACK_OFFSET, y: spot.y + STACK_OFFSET }
    }
    return spot
  }, [nodes])

  const panCanvasTo = useCallback((target) => {
    const { zoom } = getViewport()
    const { dx, dy } = getVisibleCenterOffset(zoom)
    setCenter(target.x - dx, target.y - dy, { zoom, duration: 300 })
  }, [getViewport, setCenter])

  // 把传入的节点集合(取 union bbox)平移到可见区中心
  // 等一帧让 React Flow 完成 DOM 测量,再读 measured.width/height 算视觉真实尺寸,
  // 否则刚创建的派生节点 style.height 是初始值(被 FoldedVideoPreviewCard 等撑大后视觉高度更高)
  const panToNodesBounds = useCallback((nodeIds) => {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return
    requestAnimationFrame(() => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let hit = false
      for (const id of nodeIds) {
        const n = getNode(id)
        if (!n) continue
        const x = n.position?.x ?? 0
        const y = n.position?.y ?? 0
        const measuredW = typeof n.measured?.width === 'number' ? n.measured.width : null
        const measuredH = typeof n.measured?.height === 'number' ? n.measured.height : null
        const rawW = n.style?.width ?? n.width
        const rawH = n.style?.height ?? n.height
        const styleW = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 0
        const styleH = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 0
        const w = measuredW ?? styleW
        const h = measuredH ?? styleH
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + w)
        maxY = Math.max(maxY, y + h)
        hit = true
      }
      if (!hit) return
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const { zoom } = getViewport()
      const { dx, dy } = getVisibleCenterOffset(zoom)
      setCenter(cx - dx, cy - dy, { zoom, duration: 300 })
    })
  }, [getNode, getViewport, setCenter])

  // 把返回对象 memo 住, 避免每次 hook 调用都给消费者一个新引用 — 消费者(如 useCanvasContextMenu)
  // 会把 viewport 放进 useCallback deps, 不稳引用会让所有派生 handler 跟着每渲染都换一个 ref.
  return useMemo(
    () => ({ getViewportCenter, centerNodeAt, findFreeSpot, panCanvasTo, panToNodesBounds }),
    [getViewportCenter, centerNodeAt, findFreeSpot, panCanvasTo, panToNodesBounds]
  )
}
