import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message, Slider } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { useUploader } from '@/platform/provider.jsx'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { getAudioDuration } from '@/canvas/utils/mediaMetadata'
import { fetchFileSize, formatBytes } from '@/canvas/utils/fileInfo'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import { FieldGrid, MediaInputField, SegmentControl, PromptTextarea } from '@/canvas/components/fields'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'

const RESOLUTION_OPTIONS = [{ label: '480p', value: '480p' }, { label: '720p', value: '720p' }]
const PROMPT_MAX = 500
const DEFAULT_GUIDANCE = 1
const DEFAULT_AUDIO_GUIDANCE = 2
const AUDIO_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/m4a,audio/aac,audio/ogg'

/**
 * creatify-aurora · image-audio-to-video DockedPanel
 *   内容: 人物图 + 驱动音频(标准 MediaInputField) / 分辨率(SegmentControl) / 风格引导词(PromptTextarea)
 *   底栏: 高级齿轮 + 计费 + Run + ×N(无左侧 chip)
 *   高级: guidance_scale / audio_guidance_scale 两个 antd Slider(0-5 step 0.1)
 */
export default function ImageAudioToVideoDockedPanel({
  node, capability, mode, params = {}, edges, nodes, isDone,
  paramsUnchanged = false, variant = 'default',
  onCapabilityChange, onModeChange, onParamsChange, onRun, onRequestVariant,
}) {
  const facade = useCanvasFacade()
  const uploader = useUploader()
  const imageInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const [runCount, setRunCount] = useState(1)

  // ---- 人物图(image 端口连入,单张) ----
  const imageEdge = useMemo(
    () => edges.find(e => e.target === node.id && e.targetHandle === 'image') || null,
    [edges, node.id],
  )
  const imageSourceNode = useMemo(
    () => (imageEdge ? nodes.find(n => n.id === imageEdge.source) : null),
    [imageEdge, nodes],
  )
  const imageUrl = imageSourceNode?.data?.content?.url || null
  const imageUploading = !!imageSourceNode?.data?.content?.uploading
  const { displayUrl: imageThumb } = useMediaSource(imageUrl, { kind: 'image' })
  // 人物图分辨率 / 大小:优先用源节点渲染时回写的 _media* 字段,分辨率缺失时本地异步读一次
  const imgW = imageSourceNode?.data?._mediaWidth ?? null
  const imgH = imageSourceNode?.data?._mediaHeight ?? null
  const imgSize = imageSourceNode?.data?._mediaFileSize ?? null
  const [imgDimsDraft, setImgDimsDraft] = useState(null)
  useEffect(() => {
    if (!imageUrl || (imgW && imgH)) { setImgDimsDraft(null); return }
    const src = imageThumb || imageUrl
    if (!src) return
    let cancelled = false
    const im = new window.Image()
    im.onload = () => { if (!cancelled) setImgDimsDraft({ w: im.naturalWidth, h: im.naturalHeight }) }
    im.src = src
    return () => { cancelled = true }
  }, [imageUrl, imageThumb, imgW, imgH])
  // 文件大小:源节点已回写则用,否则本地 HEAD 读一次
  const [imgSizeDraft, setImgSizeDraft] = useState(null)
  useEffect(() => {
    if (!imageUrl || imgSize != null) { setImgSizeDraft(null); return }
    let cancelled = false
    fetchFileSize(imageUrl).then(b => { if (!cancelled && b != null) setImgSizeDraft(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [imageUrl, imgSize])
  const imageValue = useMemo(() => {
    if (!imageEdge) return []
    const w = imgW ?? imgDimsDraft?.w
    const h = imgH ?? imgDimsDraft?.h
    const reso = (w > 0 && h > 0) ? `${w}×${h}` : null
    const size = formatBytes(imgSize ?? imgSizeDraft) || null
    const meta = [reso, size].filter(Boolean).join(' · ') || '人物图'
    return [{
      id: imageEdge.id,
      thumb: imageThumb,
      name: imageSourceNode?.data?.name || '人物图',
      uploading: imageUploading,
      meta,
    }]
  }, [imageEdge, imageThumb, imageSourceNode, imageUploading, imgW, imgH, imgSize, imgDimsDraft, imgSizeDraft])

  const handlePickImage = useCallback(() => { imageInputRef.current?.click() }, [])
  const handleImageFile = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !node?.id) return
    if (imageEdge) { message.warning('当前只接受 1 张人物图，请先删除已有图片'); return }
    const NEW_W = 348
    const GAP = 60
    const newNode = createInputNode(
      'image',
      { x: (node.position?.x ?? 0) - NEW_W - GAP, y: node.position?.y ?? 0 },
      { content: { uploading: true }, name: file.name },
    )
    const edgeId = `edge-${newNode.id}-${node.id}-image`
    const newEdge = { id: edgeId, source: newNode.id, sourceHandle: 'image', target: node.id, targetHandle: 'image', type: 'custom' }
    facade.batchUpdateNodes(nds => [
      ...nds.map(n => (n.id === node.id ? { ...n, data: addConnection(n.data, 'image', { source: newNode.id, sourceHandle: 'image' }, false) } : n)),
      newNode,
    ])
    facade.addEdges([newEdge])
    uploader.uploadFile(file)
      .then(r => { if (!r?.url) throw new Error('上传未返回 URL'); facade.updateNodeData(newNode.id, { content: { url: r.url, fileName: file.name } }) })
      .catch(err => {
        message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
        facade.batchUpdateNodes(nds => nds.filter(n => n.id !== newNode.id).map(n => (n.id === node.id ? { ...n, data: removeConnection(n.data, 'image', newNode.id, 'image') } : n)))
        facade.removeEdges([edgeId])
      })
  }, [node, imageEdge, facade, uploader])

  const handleRemoveImage = useCallback(() => {
    if (!imageEdge) return
    facade.removeEdges([imageEdge.id])
    if (imageUploading && imageSourceNode) facade.removeNodes([imageSourceNode.id])
    facade.batchUpdateNodes(nds => nds.map(n => (n.id === node.id ? { ...n, data: removeConnection(n.data, 'image', imageEdge.source, 'image') } : n)))
  }, [imageEdge, imageUploading, imageSourceNode, facade, node.id])

  // ---- 驱动音频(端口优先,面板直传兜底) ----
  const audioEdge = useMemo(
    () => edges.find(e => e.target === node.id && e.targetHandle === 'audio') || null,
    [edges, node.id],
  )
  const audioEdgeNode = useMemo(
    () => (audioEdge ? nodes.find(n => n.id === audioEdge.source) : null),
    [audioEdge, nodes],
  )
  const audioEdgeUrl = audioEdgeNode?.data?.content?.url || null
  const audioUrl = audioEdgeUrl || params.audio_url || null
  const audioFromEdge = !!audioEdgeUrl
  // 连线音频时长:优先用源节点已存的 content.duration,否则异步读一次(读不到不阻塞)
  const audioEdgeStoredDuration = audioEdgeNode?.data?.content?.duration ?? null
  const [audioEdgeDurationDraft, setAudioEdgeDurationDraft] = useState(null)
  useEffect(() => {
    if (!audioFromEdge || !audioEdgeUrl) { setAudioEdgeDurationDraft(null); return }
    if (audioEdgeStoredDuration != null) { setAudioEdgeDurationDraft(audioEdgeStoredDuration); return }
    let cancelled = false
    getAudioDuration(audioEdgeUrl).then(d => { if (!cancelled) setAudioEdgeDurationDraft(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [audioFromEdge, audioEdgeUrl, audioEdgeStoredDuration])
  // 音频文件大小:源节点已存则用,否则 HEAD 读一次(连线 / 面板上传都适用)
  const audioStoredSize = audioEdgeNode?.data?.content?.fileSize ?? audioEdgeNode?.data?._mediaFileSize ?? null
  const [audioSizeDraft, setAudioSizeDraft] = useState(null)
  useEffect(() => {
    if (!audioUrl || audioStoredSize != null) { setAudioSizeDraft(null); return }
    let cancelled = false
    fetchFileSize(audioUrl).then(b => { if (!cancelled && b != null) setAudioSizeDraft(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [audioUrl, audioStoredSize])
  const audioSize = audioStoredSize ?? audioSizeDraft
  const audioValue = useMemo(() => {
    if (!audioUrl) return []
    const size = formatBytes(audioSize) || null
    if (audioFromEdge) {
      const dur = audioEdgeStoredDuration ?? audioEdgeDurationDraft
      const name = audioEdgeNode?.data?.name || '音频来自连线'
      const meta = [dur != null ? formatDuration(dur) : '连线', size].filter(Boolean).join(' · ')
      return [{ id: 'audio', name, meta }]
    }
    const dur = params.audio_duration
    const ext = (params.audio_filename || '').split('.').pop()?.toUpperCase() || 'AUDIO'
    const name = params.audio_filename || '已上传音频'
    const meta = [dur != null ? formatDuration(dur) : null, size, ext].filter(Boolean).join(' · ')
    return [{ id: 'audio', name, meta }]
  }, [audioUrl, audioFromEdge, audioEdgeNode, audioEdgeStoredDuration, audioEdgeDurationDraft, audioSize, params.audio_filename, params.audio_duration])

  const handlePickAudio = useCallback(() => {
    if (audioFromEdge) { message.info('音频来自连线，请先断开连线再上传'); return }
    audioInputRef.current?.click()
  }, [audioFromEdge])
  const handleAudioFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const r = await uploader.uploadFile(file)
      if (!r?.url) throw new Error('上传未返回 URL')
      let duration = null
      try { duration = await getAudioDuration(r.url) } catch { /* 时长读不到不阻塞 */ }
      onParamsChange?.({ audio_url: r.url, audio_filename: file.name, audio_duration: duration })
    } catch (err) {
      message.error(`音频上传失败: ${err?.message || '未知错误'}`)
    }
  }, [uploader, onParamsChange])
  const handleRemoveAudio = useCallback(() => {
    if (audioFromEdge) { if (audioEdge) facade.removeEdges([audioEdge.id]); return }
    onParamsChange?.({ audio_url: null, audio_filename: null, audio_duration: null })
  }, [audioFromEdge, audioEdge, facade, onParamsChange])

  // ---- 分辨率 / prompt / 高级 ----
  const resolution = params.resolution ?? '720p'
  const showAdvanced = variant === 'advanced' || variant === 'modal'
  const guidance = params.guidance_scale ?? DEFAULT_GUIDANCE
  const audioGuidance = params.audio_guidance_scale ?? DEFAULT_AUDIO_GUIDANCE

  // ---- Run ----
  const canRun = !!imageUrl && !!audioUrl && !imageUploading
  const handleRun = useCallback(() => {
    if (!node?.id) return
    if (imageUploading) { message.warning('人物图还在上传中，请稍候'); return }
    if (!imageUrl || !audioUrl) { message.warning('请先连接或上传人物图和驱动音频'); return }
    onRun?.(node.id, runCount)
  }, [node?.id, imageUploading, imageUrl, audioUrl, onRun, runCount])

  // ---- 全屏预览(hover 缩略图出预览图标,点击打开) ----
  const [preview, setPreview] = useState(null) // { type, url } | null
  const handleViewImage = useCallback(() => {
    const url = imageThumb || imageUrl
    if (url) setPreview({ type: 'image', url })
  }, [imageThumb, imageUrl])
  const handleViewAudio = useCallback(() => {
    if (audioUrl) setPreview({ type: 'audio', url: audioUrl })
  }, [audioUrl])

  return (
    <div className="docked-panel-body">
      <DockedTopBar
        capability={capability} mode={mode} variant={variant}
        onCapabilityChange={onCapabilityChange} onModeChange={onModeChange} onRequestVariant={onRequestVariant}
      />

      <FieldGrid>
        <MediaInputField
          type="image" label="人物图" required maxCount={1} uploadText="上传人物图"
          value={imageValue} onAdd={handlePickImage} onRemove={handleRemoveImage}
          onView={imageUrl ? handleViewImage : undefined}
        />
        <MediaInputField
          type="audio" label="驱动音频" required maxCount={1} uploadText="上传音频" badge="最长 60 秒"
          value={audioValue} onAdd={handlePickAudio} onRemove={handleRemoveAudio}
          onView={audioUrl ? handleViewAudio : undefined}
        />
      </FieldGrid>

      <SegmentControl
        label="分辨率" options={RESOLUTION_OPTIONS} value={resolution}
        onChange={v => onParamsChange?.({ resolution: v })}
      />

      <PromptTextarea
        label="风格引导词" value={params.prompt ?? ''} maxLength={PROMPT_MAX}
        placeholder="棚拍光线，专业广告口播，稳定看镜头，表情自然，清晰半身构图。"
        help="可选；不填时使用模型默认风格。"
        onChange={v => onParamsChange?.({ prompt: v })}
      />

      <DockedBottomBar
        capability={capability} mode={mode} commonParams={[]}
        params={params} onParamsChange={onParamsChange} variant={variant}
        isDone={isDone} canRun={canRun} paramsUnchanged={paramsUnchanged}
        runCount={runCount} onRunCountChange={setRunCount} onRun={handleRun} onRequestVariant={onRequestVariant}
      />

      {showAdvanced && (
        <div style={{ display: 'grid', gap: 16, margin: '12px 16px 0', padding: 12, border: '1px solid var(--ac-border-subtle)', borderRadius: 'var(--ac-radius-lg)', background: 'var(--ac-bg-panel)' }}>
          <GuidanceSlider label="文本遵循强度" hint="对应 guidance_scale，默认 1；越高越严格按风格引导词生成。" value={guidance} onChange={v => onParamsChange?.({ guidance_scale: round1(v) })} />
          <GuidanceSlider label="音频遵循强度" hint="对应 audio_guidance_scale，默认 2；越高口型与音频对齐越严格。" value={audioGuidance} onChange={v => onParamsChange?.({ audio_guidance_scale: round1(v) })} />
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
      <input ref={audioInputRef} type="file" accept={AUDIO_ACCEPT} style={{ display: 'none' }} onChange={handleAudioFile} />

      <MediaPreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        mediaType={preview?.type}
        url={preview?.url}
      />
    </div>
  )
}

function GuidanceSlider({ label, hint, value, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--ac-font-sm)', fontWeight: 'var(--ac-fw-semibold)' }}>
        <span>{label}</span><span>{Number(value).toFixed(1)} / 5</span>
      </div>
      <Slider min={0} max={5} step={0.1} value={value} onChange={onChange} />
      <div className="ac-field__help">{hint}</div>
    </div>
  )
}

function round1(v) { return Math.round(v * 10) / 10 }

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
