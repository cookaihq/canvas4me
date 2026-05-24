import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { useUploader } from '@/platform/provider.jsx'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { getAudioDuration } from '@/canvas/utils/mediaMetadata'
import { fetchFileSize } from '@/canvas/utils/fileInfo'
import { formatMediaMeta } from '@/canvas/utils/mediaMeta'
import { deriveMediaItem } from './mediaItem.js'

const NEW_NODE_W = 348
const NODE_GAP = 60

/**
 * 媒体端口字段 adapter：端口连线 ↔ MediaInputField。
 * @param spawnDy 新建 input 节点相对能力节点的纵向偏移（多媒体并存时避让，避免叠放）
 */
export function useMediaPortInput({ node, edges, nodes, portId, subType, accept, spawnDy = 0 }) {
  const facade = useCanvasFacade()
  const uploader = useUploader()
  const inputRef = useRef(null)

  const core = useMemo(
    () => deriveMediaItem({ node, edges, nodes, portId, subType }),
    [node, edges, nodes, portId, subType],
  )

  // 音频时长本地探测兜底(上游音频节点不回写 _mediaDuration)
  const [audioDur, setAudioDur] = useState(null)
  useEffect(() => {
    if (subType !== 'audio' || !core?.url) { setAudioDur(null); return }
    let cancelled = false
    getAudioDuration(core.url).then((d) => { if (!cancelled) setAudioDur(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [subType, core?.url])

  // 文件大小本地探测兜底(上游缺 _mediaFileSize 时,如音频节点)
  const [probedSize, setProbedSize] = useState(null)
  const coreSize = core?.fileSize
  useEffect(() => {
    if (!core?.url || coreSize != null) { setProbedSize(null); return }
    let cancelled = false
    fetchFileSize(core.url).then((b) => { if (!cancelled) setProbedSize(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [core?.url, coreSize])

  const value = useMemo(() => {
    if (!core) return null
    // meta: 图=分辨率·大小, 音频=时长·大小(上游 _media* 优先,缺失时本地探测兜底)
    const meta = core.uploading
      ? ''
      : (formatMediaMeta(subType, {
        width: core.width,
        height: core.height,
        fileSize: core.fileSize ?? probedSize,
        duration: core.duration ?? audioDur,
      }) || '')
    return { ...core, meta }
  }, [core, subType, audioDur, probedSize])

  const onAdd = useCallback(() => { inputRef.current?.click() }, [])

  const onPick = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !node?.id) return
    if (core) { message.warning('该输入只接受 1 个素材，请先删除已有素材'); return }
    const capX = node.position?.x ?? 0
    const capY = node.position?.y ?? 0
    const preview = (subType === 'image' || subType === 'video') ? URL.createObjectURL(file) : null
    const content = preview ? { uploading: true, localPreviewUrl: preview } : { uploading: true }
    const newNode = createInputNode(subType, { x: capX - NEW_NODE_W - NODE_GAP, y: capY + spawnDy }, { content, name: file.name })
    const newEdgeId = `edge-${newNode.id}-${node.id}-${portId}`
    const newEdge = { id: newEdgeId, source: newNode.id, sourceHandle: portId, target: node.id, targetHandle: portId, type: 'custom' }
    facade.batchUpdateNodes((nds) => [
      // 单值端口：multiple=false → 替换语义（避免 portConnections 残留僵尸条目）
      ...nds.map((n) => (n.id === node.id ? { ...n, data: addConnection(n.data, portId, { source: newNode.id, sourceHandle: portId }, false) } : n)),
      newNode,
    ])
    facade.addEdges([newEdge])
    uploader.uploadFile(file)
      .then((result) => {
        facade.updateNodeData(newNode.id, { content: { url: result.url, fileName: file.name } })
        if (preview) URL.revokeObjectURL(preview)
      })
      .catch((err) => {
        message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
        facade.batchUpdateNodes((nds) => nds.filter((n) => n.id !== newNode.id)
          .map((n) => (n.id === node.id ? { ...n, data: removeConnection(n.data, portId, newNode.id, portId) } : n)))
        facade.removeEdges([newEdgeId])
        if (preview) URL.revokeObjectURL(preview)
      })
  }, [node, core, subType, portId, spawnDy, facade, uploader])

  const onRemove = useCallback(() => {
    if (!core?.edgeId) return
    facade.removeEdges([core.edgeId])
    if (core.uploading && core.sourceNodeId) facade.removeNodes([core.sourceNodeId])
  }, [core, facade])

  // 预览(已就绪):hover 出查看/播放图标 → 统一弹预览窗(图片缩放 / 视频·音频带控件播放)
  const [previewUrl, setPreviewUrl] = useState(null)
  const onView = useMemo(() => {
    if (!core?.url) return undefined
    return () => setPreviewUrl(core.url)
  }, [core?.url])
  const closePreview = useCallback(() => setPreviewUrl(null), [])
  // 预览窗 props:消费方 <MediaPreviewModal {...field.previewProps} /> 即可(mediaType 由 subType 决定)
  const previewProps = useMemo(
    () => ({ open: !!previewUrl, mediaType: subType, url: previewUrl, onClose: closePreview }),
    [previewUrl, subType, closePreview],
  )

  const fileInputProps = { ref: inputRef, type: 'file', accept, style: { display: 'none' }, onChange: onPick }

  return { value, onAdd, onRemove, onView, fileInputProps, previewUrl, closePreview, previewProps }
}
