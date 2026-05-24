import { useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'

/**
 * useCanvasPanThrough —— 画布滚轮穿透 hook
 *
 * 让任何"挡在画布之上的可滚动子区域"(吸附面板 / 浮窗 / 节点本体内的 overflow 容器)
 * 遵循统一的滚轮契约,详见 UX_SPEC.md §9.9。
 *
 * 行为:
 *  - 鼠标在面板空白处 / 容器自身: 直接驱动画布 pan
 *  - 鼠标在容器内可滚动子元素上、子元素未触底: 浏览器默认行为滚子元素, 画布不动
 *  - 子元素触底后连续 wheel: BUFFER 阻尼(N=2 次)吸收, 第 N+1 次起转给画布 pan
 *  - 静默 > 200ms 视为新手势, buffer 重置
 *  - Ctrl/Cmd + wheel: 直接 zoom, 跳过 buffer 逻辑
 *
 * 同时给挂载点元素加 `.nowheel` class, 让 react-flow 内置 wheel filter 让出事件
 * (否则 react-flow 的 d3-zoom 会抢走 wheel 用于 pan, 浏览器默认滚子元素行为被
 *  preventDefault 阻止)。
 *
 * 用法:
 *   const ref = useCanvasPanThrough()
 *   return <div ref={ref} className="my-scrollable">{...}</div>
 *
 *   传入额外 className 时, hook 会在挂载时自动追加 `nowheel`:
 *   <div ref={ref} className="my-scrollable nowheel">{...}</div>
 *   两种写法都可以——hook 内部会确保 nowheel 存在。
 *
 * 注意: 必须在 ReactFlowProvider 内部使用(依赖 useReactFlow)。
 */

const WHEEL_BUFFER_COUNT = 2
const WHEEL_BUFFER_TIMEOUT_MS = 200
const PAN_SPEED = 0.5

export default function useCanvasPanThrough() {
  const { getViewport, setViewport, getZoom, zoomTo } = useReactFlow()
  const teardownRef = useRef(null)
  const bufferRef = useRef({ remaining: 0, lastTs: 0 })

  return useCallback((el) => {
    if (teardownRef.current) {
      teardownRef.current()
      teardownRef.current = null
    }
    if (!el) return

    // 只在挂载点没有 .nowheel 时才补加, 并记下"是本 hook 加的", 卸载时还原——
    // 否则节点取消选中、ref 解绑后会残留 .nowheel, 让 react-flow 继续让出滚轮。
    const addedNoWheel = !el.classList.contains('nowheel')
    if (addedNoWheel) {
      el.classList.add('nowheel')
    }

    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const currentZoom = getZoom()
        const factor = Math.pow(2, -e.deltaY * 0.002)
        zoomTo(currentZoom * factor, { duration: 0 })
        return
      }

      let scrollContainer = null
      let node = e.target
      while (node && node !== el) {
        if (node.nodeType === 1) {
          const cs = getComputedStyle(node)
          const canScrollY =
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
          const canScrollX =
            (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
            node.scrollWidth > node.clientWidth
          if (canScrollY || canScrollX) {
            scrollContainer = node
            break
          }
        }
        node = node.parentNode
      }
      // 挂载点自身也可能是滚动容器
      if (!scrollContainer) {
        const cs = getComputedStyle(el)
        const canScrollY =
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        const canScrollX =
          (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
          el.scrollWidth > el.clientWidth
        if (canScrollY || canScrollX) scrollContainer = el
      }

      const now = e.timeStamp || performance.now()
      const buf = bufferRef.current
      if (now - buf.lastTs > WHEEL_BUFFER_TIMEOUT_MS) {
        buf.remaining = 0
      }
      buf.lastTs = now

      if (scrollContainer) {
        const {
          scrollTop, scrollLeft,
          scrollHeight, scrollWidth,
          clientHeight, clientWidth,
        } = scrollContainer
        const dx = e.deltaX
        const dy = e.deltaY
        const tolerance = 1
        const useY = Math.abs(dy) >= Math.abs(dx)
        const stillScrollable = useY
          ? (dy > 0 && scrollTop + clientHeight < scrollHeight - tolerance) ||
            (dy < 0 && scrollTop > tolerance) ||
            dy === 0
          : (dx > 0 && scrollLeft + clientWidth < scrollWidth - tolerance) ||
            (dx < 0 && scrollLeft > tolerance) ||
            dx === 0

        if (stillScrollable) {
          buf.remaining = WHEEL_BUFFER_COUNT
          return
        }
        if (buf.remaining > 0) {
          buf.remaining -= 1
          e.preventDefault()
          return
        }
      } else {
        buf.remaining = 0
      }

      e.preventDefault()
      const vp = getViewport()
      const deltaNormalize = e.deltaMode === 1 ? 20 : 1
      setViewport({
        x: vp.x - e.deltaX * deltaNormalize * PAN_SPEED,
        y: vp.y - e.deltaY * deltaNormalize * PAN_SPEED,
        zoom: vp.zoom,
      })
    }

    el.addEventListener('wheel', handler, { passive: false })
    teardownRef.current = () => {
      el.removeEventListener('wheel', handler)
      if (addedNoWheel) el.classList.remove('nowheel')
    }
  }, [getViewport, setViewport, getZoom, zoomTo])
}
