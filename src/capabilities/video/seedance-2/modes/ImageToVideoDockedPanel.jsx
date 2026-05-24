import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import SingleImageUploader from '../_shared/SingleImageUploader'
import '../_shared/prompt-chip-editor.css'

/**
 * Seedance 2.0 · image-to-video DockedPanel — 见 docs/capabilities/video/seedance-2.md §2.5
 *
 * 主区:
 *   - 图片上传卡 (端口 / 上传互斥, 端口已连线时只读)
 *   - prompt textarea (端口 / 输入互斥, 同上)
 *
 * 数据来源:
 *   - 图片: 端口 start_image (优先) → modeParams.image_url
 *   - 文本: 端口 prompt (优先)      → modeParams.prompt
 */
export default function ImageToVideoDockedPanel({
  node,
  capability,
  mode,
  params,
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
  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // start_image 端口连接 (单选)
  const imageEdge = useMemo(() => (
    edges.find(e => e.target === node.id && e.targetHandle === 'start_image')
  ), [edges, node.id])
  const imageEdgeUrl = useMemo(() => {
    if (!imageEdge) return null
    const src = nodes.find(n => n.id === imageEdge.source)
    return src?.data?.content?.url || null
  }, [imageEdge, nodes])

  const facade = useCanvasFacade()

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params?.prompt || '',
    onChange: (val) => onParamsChange?.({ prompt: val }),
    nodeId: node.id,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id &&
      e.targetHandle === 'prompt' &&
      e.source === sourceNodeId
    )))
  }, [facade, node.id])

  const handleImageChange = useCallback((url) => {
    onParamsChange?.({ image_url: url })
  }, [onParamsChange])

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (!imageEdgeUrl && !params?.image_url) {
      message.warning('请先上传图片或连接 start_image 端口')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, imageEdgeUrl, params?.image_url])

  return (
    <div className="docked-panel-body sd2-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="docked-panel-scroll">
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SingleImageUploader
            value={params?.image_url || null}
            onChange={handleImageChange}
            label="上传图片"
            portConnected={!!imageEdge}
            portThumbUrl={imageEdgeUrl}
          />
          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="为视频补充提示词…"
            variant="inline"
          />
        </div>
      </div>

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
      />
    </div>
  )
}
