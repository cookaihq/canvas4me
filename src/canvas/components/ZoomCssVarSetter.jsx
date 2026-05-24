import { useEffect } from 'react'
import { useStore } from '@xyflow/react'

/**
 * 把 React Flow 当前 zoom 写到 .react-flow 容器的 CSS 变量 --rf-zoom 上
 *
 * 用途: 让某些元素 (端口标签 / 端口圆点 等) 用 transform: scale(calc(1 / var(--rf-zoom)))
 *      实现"画布缩放时视觉大小不变".
 *
 * 必须挂在 ReactFlow 内部 (它依赖 useStore).
 */
export default function ZoomCssVarSetter() {
  const zoom = useStore((s) => s.transform[2])
  useEffect(() => {
    const el = document.querySelector('.react-flow')
    if (el) el.style.setProperty('--rf-zoom', String(zoom || 1))
  }, [zoom])
  return null
}
