import { useCallback } from 'react'
import { message } from 'antd'
import { useCanvasStore } from '@/platform/provider.jsx'

/**
 * 画布数据导入/导出 —— 仅取 canvas={nodes, edges, viewport} 三段核心结构,
 * 其它运行时字段(锁、协作元信息等)在导入/导出时自动忽略。
 *
 * 用法(在 SimpleSettings 里):
 *   const { exportCurrentCanvas, importCanvasFromJson } = useCanvasIO()
 *   <Button onClick={() => exportCurrentCanvas(canvasId)}>导出 JSON</Button>
 *   <Upload beforeUpload={(file) => importCanvasFromJson(canvasId, file)}>
 *     导入 JSON
 *   </Upload>
 */
export function useCanvasIO() {
  const canvasStore = useCanvasStore()

  const exportCurrentCanvas = useCallback(async (canvasId) => {
    if (!canvasId) {
      message.warning('当前未打开画布,无法导出')
      return
    }
    try {
      const detail = await canvasStore.get(canvasId)
      const data = detail?.canvas || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        canvasId,
        canvasName: detail?.name || '',
        nodes: data.nodes || [],
        edges: data.edges || [],
        viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (detail?.name || canvasId).replace(/[^\w一-龥-]/g, '_')
      a.download = `canvas-${safeName}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      message.success('画布已导出')
    } catch (err) {
      console.error('[canvasIO] 导出失败', err)
      message.error('导出失败:' + (err?.message || '未知错误'))
    }
  }, [canvasStore])

  const importCanvasFromJson = useCallback(async (canvasId, file) => {
    if (!canvasId) {
      message.warning('请先选中要导入的画布')
      return false
    }
    if (!file) return false
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
        throw new Error('JSON 格式错误:缺少 nodes 或 edges 数组')
      }
      await canvasStore.saveCanvas(canvasId, {
        nodes: data.nodes,
        edges: data.edges,
        viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
      })
      message.success('导入成功,刷新页面后生效')
    } catch (err) {
      console.error('[canvasIO] 导入失败', err)
      message.error('导入失败:' + (err?.message || '未知错误'))
    }
    // 阻止 Upload 组件实际上传(我们只需要读 file)
    return false
  }, [canvasStore])

  return { exportCurrentCanvas, importCanvasFromJson }
}
