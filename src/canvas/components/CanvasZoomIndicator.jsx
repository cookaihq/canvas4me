import { useStore } from '@xyflow/react'

const zoomSelector = (s) => s.transform[2]

/**
 * 画布缩放百分比指示器 — 纯展示
 */
export default function CanvasZoomIndicator() {
  const zoom = useStore(zoomSelector)
  return (
    <div className="canvas-zoom-indicator">{Math.round(zoom * 100)}%</div>
  )
}
