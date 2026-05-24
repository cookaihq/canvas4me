import { useCallback, useMemo, useRef } from 'react'
import { Info } from '@/canvas/icons'
import usePortMutex from '@/canvas/hooks/usePortMutex'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { resolveInputs } from '@/canvas/registry/resolveInputs'
import { patchModeParams } from '@/canvas/utils/capabilityNodeData'
import ReferenceImageUploader from '../_shared/ReferenceImageUploader'
import TagSelect from '../_shared/TagSelect'
import LimitPromptEditor from '../_shared/LimitPromptEditor'
import { MAX_REFERENCE_IMAGES } from '../builder'

/**
 * GPT Image 2 精简版表单 —— 见 docs/capabilities/image/gpt-image-2.md §2.2
 *
 * 只有 prompt / image_urls / resolution（3 档预设）。
 */

const RESOLUTION_OPTIONS = [
  { value: '1024x1024', label: '1024×1024' },
  { value: '1024x1536', label: '1024×1536' },
  { value: '1536x1024', label: '1536×1024' },
]

export default function GptImage2LimitMode({ capability, mode, params, nodeId, edges, nodes, locked }) {
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
      promptEditorRef.current?.insertText(`第${globalIndex}张图片<图片描述>`)
    },
    []
  )

  return (
    <>
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
          insertTooltip={i => `插入「第${i}张图片<图片描述>」`}
          disabled={locked}
        />
      </div>

      <div className="view-field">
        <LimitPromptEditor
          ref={promptEditorRef}
          prompt={params.prompt || ''}
          onPromptChange={val => updateParams('prompt', val)}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          disabled={locked}
        />
      </div>

      <div className="view-field">
        <label className="view-field-label">Resolution</label>
        <TagSelect
          value={params.resolution || '1024x1024'}
          onChange={v => updateParams('resolution', v)}
          options={RESOLUTION_OPTIONS}
          disabled={locked}
        />
      </div>

      <div className="gi2-notice">
        <Info className="gi2-notice-icon" size={16} />
        <span>精简版不支持 Quality / Mask / Output Format / Background 等高级参数，如需请切换至 <b>gpt-image-2</b> 完整版。</span>
      </div>
    </>
  )
}
