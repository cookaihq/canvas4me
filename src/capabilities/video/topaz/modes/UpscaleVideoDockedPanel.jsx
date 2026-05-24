import { useCallback, useMemo, useRef, useState } from 'react'
import { InputNumber, Slider, Switch, Tooltip, message } from 'antd'
import { Eye, Film, Loader2, Plus, X as XIcon } from '@/canvas/icons'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { useUploader } from '@/platform/provider.jsx'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { getVideoDuration } from '@/canvas/utils/mediaMetadata'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import {
  DEFAULT_ENHANCEMENT_MODEL,
  DEFAULT_UPSCALE_FACTOR,
  TOPAZ_MODEL_FAMILIES,
} from '../constants'
import {
  applyTopazVideoUploadSuccess,
  createTopazVideoInputAttachment,
  insertTopazVideoInputAttachment,
  removeTopazVideoInputConnection,
  removeTopazVideoInputAttachment,
  replaceTopazVideoInputEdge,
} from '../inputAttachment'

const ADVANCED_FIELDS = [
  { key: 'compression', label: '压缩修复' },
  { key: 'noise', label: '降噪' },
  { key: 'halo', label: '光晕抑制' },
  { key: 'grain', label: '胶片颗粒' },
  { key: 'recover_detail', label: '细节恢复' },
]

export default function UpscaleVideoDockedPanel({
  node,
  capability,
  mode,
  params = {},
  edges,
  nodes,
  isDone,
  paramsUnchanged = false,
  variant = 'default',
  onCapabilityChange,
  onModeChange,
  onParamsChange,
  onRun,
  onRequestVariant,
}) {
  const facade = useCanvasFacade()
  const uploader = useUploader()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [runCount, setRunCount] = useState(1)
  const [previewVideo, setPreviewVideo] = useState(null)

  const videoItems = useMemo(() => (
    expandPortInputs({
      targetNodeId: node.id,
      targetHandle: 'video',
      edges,
      nodes,
    })
  ), [edges, nodes, node.id])
  const hasVideoConnection = useMemo(() => (
    edges.some((edge) => edge.target === node.id && edge.targetHandle === 'video')
  ), [edges, node.id])
  const hasVideoInput = hasVideoConnection || videoItems.length > 0

  const selectedModel = params.enhancement_model || DEFAULT_ENHANCEMENT_MODEL
  const selectedFamily = useMemo(() => {
    return TOPAZ_MODEL_FAMILIES.find((family) =>
      family.models.some(([name]) => name === selectedModel)
    ) || TOPAZ_MODEL_FAMILIES[0]
  }, [selectedModel])

  const handleModelFamilyClick = useCallback((family) => {
    const nextModel = family.models[0]?.[0] || DEFAULT_ENHANCEMENT_MODEL
    onParamsChange?.({ enhancement_model: nextModel })
  }, [onParamsChange])

  const handlePickVideo = useCallback(() => {
    if (uploading || hasVideoInput) return
    inputRef.current?.click()
  }, [hasVideoInput, uploading])

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !node?.id) return

    const attachment = createTopazVideoInputAttachment({
      capabilityNode: node,
      fileName: file.name,
      createInputNode,
    })

    facade.batchUpdateNodes((currentNodes) => insertTopazVideoInputAttachment(currentNodes, attachment))
    facade.batchUpdateEdges((currentEdges) => replaceTopazVideoInputEdge(currentEdges, attachment))

    setUploading(true)
    try {
      const uploadResult = await uploader.uploadFile(file)
      if (!uploadResult?.url) throw new Error('上传未返回 URL')
      let duration = null
      try { duration = await getVideoDuration(uploadResult.url) } catch { /* 时长读取失败不阻塞 */ }
      facade.batchUpdateNodes((currentNodes) => applyTopazVideoUploadSuccess(currentNodes, {
        inputNodeId: attachment.inputNode.id,
        uploadResult,
        fileName: file.name,
        duration,
      }))
    } catch (error) {
      message.error(`${file.name} 上传失败: ${error?.message || '未知错误'}`)
      facade.batchUpdateNodes((currentNodes) => removeTopazVideoInputAttachment(currentNodes, attachment))
      facade.batchUpdateEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== attachment.edge.id))
    } finally {
      setUploading(false)
    }
  }, [facade, node, uploader])

  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (uploading || videoItems.some((item) => item.uploading)) {
      message.warning('输入视频还在上传中，请稍候')
      return
    }
    if (videoItems.length === 0) {
      message.warning('请先添加输入视频')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, uploading, videoItems])

  const handleDeleteVideo = useCallback((item) => {
    if (item.source !== 'edge' || !item.sourceNodeId) return
    facade.batchUpdateEdges((currentEdges) => currentEdges.filter((edge) => {
      if (item.edgeId) return edge.id !== item.edgeId
      return !(edge.target === node.id && edge.targetHandle === 'video' && edge.source === item.sourceNodeId)
    }))
    facade.batchUpdateNodes((currentNodes) => removeTopazVideoInputConnection(currentNodes, {
      targetNodeId: node.id,
      sourceNodeId: item.sourceNodeId,
      sourceHandle: item.sourceHandle || 'video',
      removeSourceNode: !!item.uploading,
    }))
  }, [facade, node.id])

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body topaz-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="topaz-dp-input-row">
        <span className="topaz-dp-input-label">
          <Film size={14} />
          输入视频
        </span>
        <div className="topaz-dp-thumbs" aria-label="输入视频缩略图">
          {videoItems.map((item) => (
            <TopazVideoThumb
              key={item.edgeId || item.sourceNodeId}
              item={item}
              onDelete={handleDeleteVideo}
              onPreview={setPreviewVideo}
            />
          ))}
          {!hasVideoInput && (
            <button
              className="topaz-dp-thumb-add"
              type="button"
              aria-label="添加输入视频"
              onClick={handlePickVideo}
              disabled={uploading}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-m4v"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div className="topaz-dp-fields">
        <section className="topaz-dp-stacked-field">
          <div className="topaz-dp-field-title">增强模型</div>
          <div className="topaz-dp-family-picker">
            <div className="topaz-dp-family-tabs" role="tablist" aria-label="增强模型系列">
              {TOPAZ_MODEL_FAMILIES.map((family) => {
                const active = family.id === selectedFamily.id
                return (
                  <button
                    key={family.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? 'active' : ''}
                    onClick={() => handleModelFamilyClick(family)}
                  >
                    {family.label}
                  </button>
                )
              })}
            </div>
            <div className="topaz-dp-family-note" aria-live="polite">
              {selectedFamily.summary}
            </div>
            <div className="topaz-dp-model-list" role="listbox" aria-label="增强模型选项">
              {selectedFamily.models.map(([name, description]) => {
                const active = name === selectedModel
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`topaz-dp-model-option${active ? ' active' : ''}`}
                    onClick={() => onParamsChange?.({ enhancement_model: name })}
                  >
                    <strong>{name}</strong>
                    <span>{description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="topaz-dp-stacked-field">
          <div className="topaz-dp-field-title">放大倍率</div>
          <div className="topaz-dp-scale-tabs" role="radiogroup" aria-label="放大倍率">
            {[1, 2, 3, 4].map((value) => {
              const active = (params.upscale_factor ?? DEFAULT_UPSCALE_FACTOR) === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? 'active' : ''}
                  onClick={() => onParamsChange?.({ upscale_factor: value })}
                >
                  {value}x
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={[]}
        params={params}
        onParamsChange={onParamsChange}
        variant={variant}
        isDone={isDone}
        canRun={videoItems.length > 0 && !uploading && !videoItems.some((item) => item.uploading)}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
      />

      {showAdvanced && (
        <div className="topaz-dp-advanced">
          <div className="topaz-dp-advanced-head">
            <div className="topaz-dp-advanced-title">高级参数</div>
            <div className="topaz-dp-advanced-note">低频 / 专业参数</div>
          </div>
          <div className="topaz-dp-advanced-row">
            <label className="topaz-dp-advanced-label" htmlFor={`${node.id}-target-fps`}>目标帧率</label>
            <InputNumber
              id={`${node.id}-target-fps`}
              min={16}
              max={60}
              step={1}
              value={params.target_fps ?? null}
              placeholder="不传"
              onChange={(value) => onParamsChange?.({ target_fps: value ?? null })}
              style={{ width: '100%' }}
            />
          </div>
          <div className="topaz-dp-advanced-row">
            <span className="topaz-dp-advanced-label">H.264 输出</span>
            <Switch
              checked={params.h264_output === true}
              onChange={(checked) => onParamsChange?.({ h264_output: checked ? true : null })}
            />
          </div>
          <div className="topaz-dp-range-box">
            <div className="topaz-dp-range-head">
              <span>高级修复强度</span>
              <span>取值范围 0-1</span>
            </div>
            {ADVANCED_FIELDS.map((field) => {
              const value = typeof params[field.key] === 'number' ? params[field.key] : 0
              return (
                <div className="topaz-dp-range-row" key={field.key}>
                  <span>{field.label}</span>
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={value}
                    onChange={(next) => onParamsChange?.({ [field.key]: next })}
                  />
                  <button
                    type="button"
                    className="topaz-dp-range-reset"
                    onClick={() => onParamsChange?.({ [field.key]: null })}
                  >
                    {value.toFixed(1)}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <MediaPreviewModal
        open={!!previewVideo?.url}
        onClose={() => setPreviewVideo(null)}
        mediaType="video"
        url={previewVideo?.url}
        title={previewVideo?.name || '预览视频'}
      />
    </div>
  )
}

function TopazVideoThumb({ item, onDelete, onPreview }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'video' })
  const canPreview = !item.uploading && !!item.url

  return (
    <div
      className={`topaz-dp-video-thumb${item.uploading ? ' uploading' : ''}`}
      title={item.name || '输入视频'}
    >
      {item.uploading ? (
        <div className="topaz-dp-thumb-empty">
          <Loader2 size={14} className="icon-spin" />
        </div>
      ) : displayUrl ? (
        <video
          src={displayUrl}
          muted
          playsInline
          preload="metadata"
          onError={markError}
        />
      ) : (
        <div className="topaz-dp-thumb-empty">
          <Film size={18} />
        </div>
      )}

      {item.uploading && (
        <span className="topaz-dp-thumb-status">上传中</span>
      )}
      <Tooltip title={item.uploading ? '取消上传' : '断开输入视频'}>
        <button
          type="button"
          className="topaz-dp-thumb-delete"
          onClick={() => onDelete?.(item)}
          aria-label={item.uploading ? '取消上传' : '断开输入视频'}
        >
          <XIcon size={10} />
        </button>
      </Tooltip>
      {canPreview && (
        <Tooltip title="预览视频">
          <button
            type="button"
            className="topaz-dp-thumb-preview"
            onClick={() => onPreview?.(item)}
            aria-label="预览视频"
          >
            <Eye size={13} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
