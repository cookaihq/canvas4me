import { useCallback, useMemo, useRef } from 'react'
import { Select, InputNumber, Segmented } from 'antd'
import usePortMutex from '@/canvas/hooks/usePortMutex'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
// ConnectedPortDisplay 不再用于 prompt(文本端口) - TextInputWithEdges/RichPromptEditor
// 内嵌了 chip; 但 image/mask 端口仍在用,见下方 imageItems 处理
import { resolveInputs } from '@/canvas/registry/resolveInputs'
import { patchModeParams } from '@/canvas/utils/capabilityNodeData'
import ReferenceImageUploader from '../_shared/ReferenceImageUploader'
import TagSelect from '../_shared/TagSelect'
import RichPromptEditor from '../_shared/RichPromptEditor'
import CustomResolutionPopover from '../_shared/CustomResolutionPopover'
import { MAX_REFERENCE_IMAGES } from '../builder'

/**
 * GPT Image 2 完整版表单 —— 见 docs/capabilities/image/gpt-image-2.md §2.1
 *
 * 独有字段：num_outputs、quality、output_format、background、自定义分辨率对象。
 * mask_url 本期不做。
 */

const RESOLUTION_ALL_PRESETS = [
  { value: '1024x768', label: '1024×768' },
  { value: '768x1024', label: '768×1024' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '1536x1024', label: '1536×1024' },
  { value: '1024x1536', label: '1024×1536' },
  { value: '1920x1080', label: '1920×1080' },
  { value: '1080x1920', label: '1080×1920' },
  { value: '2560x1440', label: '2560×1440' },
  { value: '1440x2560', label: '1440×2560' },
  { value: '3840x2160', label: '3840×2160' },
  { value: '2160x3840', label: '2160×3840' },
]

const QUALITY_OPTIONS = [
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
]

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

const BACKGROUND_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'opaque', label: 'opaque' },
]

export default function GptImage2Mode({ capability, mode, params, nodeId, edges, nodes, locked }) {
  const facade = useCanvasFacade()
  const inputDefs = useMemo(() => resolveInputs(capability, mode), [capability, mode])
  const { isEdgeOccupied, getSourceNodes } = usePortMutex(nodeId, edges, nodes, inputDefs)

  const promptEditorRef = useRef(null)

  const updateParams = useCallback(
    (key, value) => {
      facade.batchUpdateNodes(nds =>
        nds.map(n =>
          n.id === nodeId
            ? { ...n, data: patchModeParams(n.data, mode, { [key]: value }) }
            : n
        )
      )
    },
    [nodeId, mode, facade]
  )

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
    onChange: (val) => updateParams('prompt', val),
    nodeId,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === nodeId &&
      e.targetHandle === 'prompt' &&
      e.source === sourceNodeId
    )))
  }, [facade, nodeId])

  const panelImages = Array.isArray(params.images) ? params.images : []
  const edgeImageSources = getSourceNodes('image')
  const totalImages = panelImages.length + edgeImageSources.length

  const imageItems = useMemo(() => {
    const imageEdges = edges.filter(e => e.target === nodeId && e.targetHandle === 'image')
    const edgeItems = edgeImageSources.map(n => {
      const edge = imageEdges.find(e => e.source === n.id)
      return {
        url: n?.data?.content?.url,
        name: n?.data?.content?.fileName || n?.data?.label || n?.id,
        source: 'edge',
        sourceLabel: n?.data?.label || n?.id,
        edgeId: edge?.id,
      }
    })
    const panelItems = panelImages.map((item, i) => ({
      url: item?.url,
      name: item?.name,
      source: 'panel',
      panelIndex: i,
    }))
    return [...edgeItems, ...panelItems]
  }, [edgeImageSources, panelImages, edges, nodeId])

  const handleImageUploaded = useCallback(
    (uploaded) => {
      const prev = Array.isArray(params.images) ? params.images : []
      updateParams('images', [...prev, uploaded])
    },
    [params.images, updateParams]
  )

  const handleDelete = useCallback(
    (item) => {
      if (item.source === 'edge' && item.edgeId) {
        facade.batchUpdateEdges(eds => eds.filter(e => e.id !== item.edgeId))
        return
      }
      if (item.source === 'panel' && typeof item.panelIndex === 'number') {
        const prev = Array.isArray(params.images) ? params.images : []
        updateParams('images', prev.filter((_, i) => i !== item.panelIndex))
      }
    },
    [params.images, updateParams, facade]
  )

  const handleInsertToken = useCallback(
    (globalIndex) => {
      promptEditorRef.current?.insertToken(globalIndex)
    },
    []
  )

  const resolutionValue = params.resolution ?? '1024x1024'
  const isCustomResolution = resolutionValue && typeof resolutionValue === 'object'
  const presetValue = isCustomResolution ? null : resolutionValue

  return (
    <>
      {/* 参考图 */}
      <div className="view-field">
        <label className="view-field-label">
          Reference Images
          <span className="view-field-value">{totalImages} / {MAX_REFERENCE_IMAGES}</span>
        </label>
        <ReferenceImageUploader
          items={imageItems}
          max={MAX_REFERENCE_IMAGES}
          onUploaded={handleImageUploaded}
          onDelete={handleDelete}
          onInsert={handleInsertToken}
          disabled={locked}
        />
      </div>

      {/* 提示词 — 文本端口连入以 .tp-chip 内嵌, 与参考图 @图像N token 共存 */}
      <div className="view-field">
        <RichPromptEditor
          ref={promptEditorRef}
          prompt={params.prompt || ''}
          onPromptChange={val => updateParams('prompt', val)}
          referenceImages={imageItems}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          disabled={locked}
        />
      </div>

      {/* Num Outputs */}
      <div className="view-field view-field-inline">
        <label className="view-field-label">
          Num Outputs <span className="view-field-value">1 - 10</span>
        </label>
        <InputNumber
          min={1}
          max={10}
          value={params.num_outputs ?? 1}
          onChange={v => updateParams('num_outputs', v ?? 1)}
          disabled={locked}
        />
      </div>

      {/* Resolution 预设 + 自定义 */}
      <div className="view-field">
        <label className="view-field-label">Resolution</label>
        <div className="gi2-res-row">
          <TagSelect
            value={presetValue}
            onChange={v => updateParams('resolution', v)}
            options={RESOLUTION_ALL_PRESETS}
            cols={4}
            disabled={locked}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <CustomResolutionPopover
            value={isCustomResolution ? resolutionValue : null}
            onChange={v => updateParams('resolution', v || '1024x1024')}
            disabled={locked}
          />
        </div>
      </div>

      {/* Quality */}
      <div className="view-field">
        <label className="view-field-label">Quality</label>
        <Segmented
          block
          value={params.quality || 'high'}
          onChange={v => updateParams('quality', v)}
          options={QUALITY_OPTIONS}
          disabled={locked}
        />
      </div>

      {/* Output Format */}
      <div className="view-field">
        <label className="view-field-label">Output Format</label>
        <Select
          value={params.output_format || 'png'}
          onChange={v => updateParams('output_format', v)}
          options={OUTPUT_FORMAT_OPTIONS}
          style={{ width: '100%' }}
          disabled={locked}
        />
      </div>

      {/* Background */}
      <div className="view-field">
        <label className="view-field-label">Background</label>
        <Segmented
          block
          value={params.background || 'auto'}
          onChange={v => updateParams('background', v)}
          options={BACKGROUND_OPTIONS}
          disabled={locked}
        />
      </div>
    </>
  )
}
