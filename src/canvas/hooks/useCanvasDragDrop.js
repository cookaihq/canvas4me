import { useCallback, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { message } from 'antd'
import { createInputNode } from '../utils/nodeFactory'
import { buildMaterialNode } from '../utils/buildMaterialNode'
import { registerFile, clearFile } from '../state/dragUploadStore'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 文件拖放 hook
 *
 * 监听画布上的 dragover / dragleave / drop 事件,把文件按 mime 类型转成
 * input 节点(image / audio / video / file)。
 *
 * 流程（新版，立即创建占位 + 异步上传）：
 *   1. drop 落地立即 createInputNode，data.content 标记 uploading + 进度 0 + 本地预览
 *   2. 异步调 uploader.uploadFile，onProgress 增量回写进度
 *   3. 成功 → data.content 替换为 { url, fileName, fileSize }，revoke 本地 blob，clearFile(nodeId)
 *   4. 失败 → data.content 标记 uploadError，保留 localPreviewUrl + dragUploadStore 中的 File 供重试
 *
 * @param {object}   opts
 * @param {boolean}  opts.isEditing
 * @param {Function} opts.setNodes
 * @param {object}   opts.uploader  useUploader() 返回值
 * @returns {{ isDragOver, onDragOver, onDragLeave, onDrop }}
 */
export default function useCanvasDragDrop({ isEditing, setNodes, uploader }) {
  const { screenToFlowPosition } = useReactFlow()
  const facade = useCanvasFacade()
  const [isDragOver, setIsDragOver] = useState(false)

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  // 给单个节点更新 data.content 字段（不动其它字段）
  const patchContent = useCallback((nodeId, patch) => {
    facade.batchUpdateNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n
      return {
        ...n,
        data: {
          ...n.data,
          content: { ...(n.data?.content || {}), ...patch },
        },
      }
    }))
  }, [setNodes, facade])

  // 上传一个 file 到给定节点（首次或重试都走这里）
  const uploadToNode = useCallback(async (nodeId, file) => {
    patchContent(nodeId, { uploading: true, progress: 0, uploadError: null })
    try {
      const result = await uploader.uploadFile(file, {
        onProgress: (p) => patchContent(nodeId, { progress: Math.max(0, Math.min(100, Math.floor(p))) }),
      })
      // 成功：替换为真正的 url，清掉占位字段，释放本地 blob
      facade.batchUpdateNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n
        const localPreviewUrl = n.data?.content?.localPreviewUrl
        if (localPreviewUrl) {
          try { URL.revokeObjectURL(localPreviewUrl) } catch { /* ignore */ }
        }
        return {
          ...n,
          data: {
            ...n.data,
            content: {
              url: result.url,
              fileName: result.fileName || file.name,
              fileSize: result.size || file.size,
            },
          },
        }
      }))
      clearFile(nodeId)
    } catch (err) {
      const msg = err?.message || String(err)
      patchContent(nodeId, { uploading: false, progress: 0, uploadError: msg })
      message.error(`上传 ${file.name} 失败: ${msg}`)
      // File 保留在 dragUploadStore 中，等用户重试
    }
  }, [patchContent, setNodes, uploader, facade])

  const onDrop = useCallback(async (event) => {
    event.preventDefault()
    setIsDragOver(false)

    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }

    const dropPos = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    // 优先识别"从库内拖出"的中性 payload：装饰层（如素材库抽屉）会在 dragstart 写入。
    // 命中则直接用预填 url 创建节点，跳过上传链路。
    const materialPayload = event.dataTransfer.getData('application/x-canvas-material')
    if (materialPayload) {
      try {
        const payload = JSON.parse(materialPayload)
        const node = buildMaterialNode(payload, dropPos)
        if (!node) return
        facade.addNodes(node)
        return
      } catch (err) {
        console.warn('[material drop] payload 解析失败', err)
        // 解析失败 → 继续走文件 drop 分支兜底
      }
    }

    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return

    files.forEach((file, i) => {
      const mime = file.type || ''
      let subType = 'file'
      if (mime.startsWith('image/')) subType = 'image'
      else if (mime.startsWith('audio/')) subType = 'audio'
      else if (mime.startsWith('video/')) subType = 'video'

      const pos = { x: dropPos.x + i * 30, y: dropPos.y + i * 30 }

      // image / video 用本地 blob URL 作占位预览；audio / file 没有缩略图视觉
      let localPreviewUrl = null
      if (subType === 'image' || subType === 'video') {
        try { localPreviewUrl = URL.createObjectURL(file) } catch { /* ignore */ }
      }

      const node = createInputNode(subType, pos, {
        name: file.name,
        content: {
          fileName: file.name,
          uploading: true,
          progress: 0,
          ...(localPreviewUrl ? { localPreviewUrl } : {}),
        },
      })

      // 立即添加节点
      facade.addNodes(node)

      // 注册 File 引用（重试用），并启动上传
      registerFile(node.id, file, () => uploadToNode(node.id, file))
      void uploadToNode(node.id, file)
    })
  }, [isEditing, screenToFlowPosition, setNodes, uploadToNode, facade])

  return { isDragOver, onDragOver, onDragLeave, onDrop }
}
