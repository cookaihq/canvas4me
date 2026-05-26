import { useCallback } from 'react'
import { message } from 'antd'
import { createInputNode } from '../utils/nodeFactory'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 剪贴板图片粘贴 hook
 *
 * 用户按 Cmd/Ctrl+V 粘贴图片时,在画布中央创建 input 节点(blob URL 占位)
 * 并后台上传,完成后用真实 URL 替换 blob URL。
 *
 * 调用方负责把返回的 handlePasteImage 同步到 useCanvasActions 用的 ref
 * (useCanvasActions 在 useCanvasViewport 之前调用,需 ref 解循环依赖)。
 *
 * @param {object} opts
 * @param {boolean} opts.isEditing
 * @param {object}  opts.viewport            useCanvasViewport() 返回值
 * @param {Function} opts.setNodes
 * @param {object}  opts.uploader            useUploader() 返回值
 * @param {object}  opts.nodeZCounterRef     画布 z-index 单调计数器 ref(bring-to-front)
 * @returns {{ handlePasteImage: (file: File) => Promise<void> }}
 */
export default function useCanvasClipboardImage({ isEditing, viewport, setNodes, uploader, nodeZCounterRef }) {
  const facade = useCanvasFacade()

  const handlePasteImage = useCallback(async (file) => {
    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }
    const center = viewport.findFreeSpot(viewport.getViewportCenter())
    const blobUrl = URL.createObjectURL(file)
    const node = viewport.centerNodeAt(createInputNode('image', center, {
      content: { url: blobUrl, fileName: file.name },
      name: file.name,
      uploading: true,
    }), center)
    facade.addNodes({ ...node, zIndex: nodeZCounterRef.current++ })
    viewport.panCanvasTo(center)

    try {
      const result = await uploader.uploadFile(file)
      facade.updateNodeData(node.id, { content: { url: result.url, fileName: file.name }, uploading: false })
    } catch (err) {
      facade.removeNodes([node.id])
      message.error('上传失败: ' + err.message)
    } finally {
      // 延迟释放 blob,给 React 一次重渲染的时间切换到 OSS URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
    }
  }, [isEditing, viewport, setNodes, uploader, facade, nodeZCounterRef])

  return { handlePasteImage }
}
