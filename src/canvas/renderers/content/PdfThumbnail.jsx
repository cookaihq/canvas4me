import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { probeUrl } from '../../utils/urlCheck'
import { onRetryAll } from '../../utils/retryBus'
import LoadFailedPlaceholder from '../LoadFailedPlaceholder'
import LoadingPlaceholder from '../LoadingPlaceholder'

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href
}

/**
 * PDF 首页缩略图（pdfjs-dist 渲染到 canvas）
 * - 成功：展示第一页缩略图
 * - 失败：probe URL 拿到具体原因（404 / 403 / timeout / ...），展示 LoadFailedPlaceholder（含重试）
 *   不再伪装成"不可预览文件"
 */
export default function PdfThumbnail({ url }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const resizeObserverRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [errorReason, setErrorReason] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const handleRetry = useCallback(() => {
    setErrorReason(null)
    setReady(false)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!errorReason) return
    return onRetryAll(handleRetry)
  }, [errorReason, handleRetry])

  useEffect(() => {
    if (!url) return
    let cancelled = false
    let pdfDoc = null
    let page = null
    let renderTask = null
    let lastRenderedWidth = 0
    let resizeTimer = null
    setReady(false)

    // 按当前容器宽度重新光栅化首页（节点 resize 后调用，避免 CSS 缩放导致模糊）
    const renderAtCurrentWidth = async () => {
      if (cancelled || !page) return
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const containerWidth = container.clientWidth || 255
      // 宽度变化不到 4px 不重画，避免 ResizeObserver 抖动触发重复渲染
      if (Math.abs(containerWidth - lastRenderedWidth) < 4) return

      try { renderTask?.cancel?.() } catch (_e) {}

      const baseViewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / baseViewport.width
      const viewport = page.getViewport({ scale })

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      try {
        renderTask = page.render({ canvasContext: ctx, viewport })
        await renderTask.promise
        if (cancelled) return
        lastRenderedWidth = containerWidth
        setReady(true)
      } catch (err) {
        // 取消导致的拒绝是正常路径，忽略
        if (err?.name === 'RenderingCancelledException') return
        if (cancelled) return
        throw err
      }
    }

    ;(async () => {
      try {
        pdfDoc = await pdfjsLib.getDocument(url).promise
        if (cancelled) return
        page = await pdfDoc.getPage(1)
        if (cancelled) return

        await renderAtCurrentWidth()

        // 节点 resize 后按新宽度重画；debounce 防止拖动过程中频繁触发
        const container = containerRef.current
        if (container && !cancelled) {
          // eslint-disable-next-line no-restricted-syntax -- PDF 重绘观察器:debounce 150ms 后只重画 canvas,不写 React state / 节点 store,不形成 setState 环
          const observer = new ResizeObserver(() => {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(() => {
              if (!cancelled) renderAtCurrentWidth()
            }, 150)
          })
          observer.observe(container)
          // 把 observer 暴露给清理函数
          resizeObserverRef.current = observer
        }
      } catch (err) {
        if (cancelled) return
        console.warn('[PdfThumbnail] 渲染失败:', err)
        const probe = await probeUrl(url)
        if (cancelled) return
        setErrorReason(probe.ok ? 'media-error' : (probe.reason || 'unknown'))
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(resizeTimer)
      try { resizeObserverRef.current?.disconnect?.() } catch (_e) {}
      resizeObserverRef.current = null
      try { renderTask?.cancel?.() } catch (_e) {}
      try { pdfDoc?.destroy?.() } catch (_e) {}
    }
  }, [url, reloadKey])

  return (
    <div ref={containerRef} className="renderer-file-preview-pdf-wrap">
      <canvas
        ref={canvasRef}
        className="renderer-file-preview-pdf-canvas"
        style={{ opacity: ready ? 1 : 0 }}
      />
      {!ready && !errorReason && <LoadingPlaceholder />}
      {errorReason && (
        <LoadFailedPlaceholder reason={errorReason} onRetry={handleRetry} />
      )}
    </div>
  )
}
