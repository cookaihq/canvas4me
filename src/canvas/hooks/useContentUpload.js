import { useCallback, useRef, useState } from 'react'
import { message } from 'antd'
import { useReactFlow } from '@xyflow/react'
import { useUploader } from '@/platform/provider.jsx'
import { useCanvasFacade } from '../state/canvasFacade'
import { isPreviewableFile } from '../utils/fileInfo'
import { PREVIEWABLE_FILE_HEIGHT } from '../utils/nodeFactory'

// 文件子类型默认高度（与 nodeFactory 中保持一致）；用作"用户未手动 resize"判定阈值
const DEFAULT_FILE_HEIGHT = 130

/**
 * 节点内容上传 Hook
 *
 * 交互：
 * 1. 选择文件后立即生成 blob URL 写入 node.data.content，用户可立刻预览/播放
 * 2. 后台调用 uploadFile 上传到 OSS，显示进度
 * 3. 上传成功后将 content.url 替换为 OSS URL，并释放 blob URL
 * 4. 上传失败时保留 blob URL（本地仍可预览），并提示错误
 *
 * 竞态：以 uploadIdRef 跟踪最新一次上传，旧任务完成后若已被新任务覆盖则不再写入。
 */
export default function useContentUpload(nodeId) {
  const { getNode } = useReactFlow()
  const facade = useCanvasFacade()
  const uploader = useUploader()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const blobUrlRef = useRef(null)
  const uploadIdRef = useRef(0)

  const revokePrevBlob = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }

  const writeContent = useCallback((patch) => {
    facade.batchUpdateNodes((nds) => nds.map((n) => (
      n.id === nodeId
        ? {
          ...n,
          data: {
            ...n.data,
            content: {
              ...(n.data?.content || {}),
              ...patch,
            },
          },
        }
        : n
    )))
  }, [nodeId, facade])

  // 首次上传时如果节点还没取名,用文件名做默认名(已手动改过的不覆盖)
  const initNameIfEmpty = useCallback((fileName) => {
    if (!fileName) return
    facade.batchUpdateNodes((nds) => nds.map((n) => (
      n.id === nodeId && !n.data?.name
        ? { ...n, data: { ...n.data, name: fileName } }
        : n
    )))
  }, [nodeId, facade])

  const handleFile = useCallback(async (file) => {
    if (!file) return

    const myUploadId = ++uploadIdRef.current
    revokePrevBlob()

    const previewUrl = URL.createObjectURL(file)
    blobUrlRef.current = previewUrl

    // blob URL 只写 localPreviewUrl(临时预览), 不写 url——避免上传完成前自动保存把 blob 持久化,
    // 刷新后变 <video> resource load error。同时清空旧 url, 避免渲染旧远端文件。
    writeContent({
      url: null,
      localPreviewUrl: previewUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    })
    initNameIfEmpty(file.name)

    // 'file' 子类型节点：拿到可预览文件时，把仍是默认高度的节点拉高到 450
    // 已被用户手动 resize 过的节点不动
    const node = getNode(nodeId)
    if (node?.data?.subType === 'file' && isPreviewableFile({ fileName: file.name, mimeType: file.type })) {
      const rawH = node.style?.height
      const numH = typeof rawH === 'number' ? rawH : parseFloat(rawH)
      if (numH === DEFAULT_FILE_HEIGHT) {
        facade.batchUpdateNodes((nds) => nds.map((n) => (
          n.id === nodeId
            ? { ...n, style: { ...n.style, height: PREVIEWABLE_FILE_HEIGHT } }
            : n
        )))
      }
    }

    setUploading(true)
    setProgress(0)
    setUploadError(null)

    try {
      const result = await uploader.uploadFile(file, {
        onProgress: (percent) => {
          if (uploadIdRef.current === myUploadId) setProgress(percent)
        },
      })

      if (uploadIdRef.current !== myUploadId) return

      // 上传成功:写远端 url, 清掉临时 localPreviewUrl, 释放 blob 资源
      writeContent({ url: result.url, localPreviewUrl: null })
      if (blobUrlRef.current === previewUrl) {
        URL.revokeObjectURL(previewUrl)
        blobUrlRef.current = null
      }
      setUploading(false)
      setProgress(100)
    } catch (err) {
      if (uploadIdRef.current !== myUploadId) return
      const msg = err?.message || '上传失败'
      setUploadError(msg)
      setUploading(false)
      message.error(`上传失败：${msg}`)
    }
  }, [writeContent, initNameIfEmpty, nodeId, getNode, facade])

  return { handleFile, uploading, progress, uploadError }
}
