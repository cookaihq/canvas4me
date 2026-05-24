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
 * Seedance 2.0 · first-last-frame DockedPanel — 见 docs/capabilities/video/seedance-2.md §2.6
 *
 * 主区:
 *   - 首帧上传卡 (端口 start_image / 上传 image_url)
 *   - 尾帧上传卡 (端口 end_image   / 上传 end_image_url)
 *   - prompt textarea (端口 / 输入互斥)
 *
 * 上游 model 复用 I2V (builder 拼 model 时, FLF 与 I2V 都映射 seedance-2.0-image-to-video),
 * 区别只在 builder 是否传 end_image_url.
 */
export default function FirstLastFrameDockedPanel({
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

  const startEdge = useMemo(() => (
    edges.find(e => e.target === node.id && e.targetHandle === 'start_image')
  ), [edges, node.id])
  const startEdgeUrl = useMemo(() => {
    if (!startEdge) return null
    const src = nodes.find(n => n.id === startEdge.source)
    return src?.data?.content?.url || null
  }, [startEdge, nodes])

  const endEdge = useMemo(() => (
    edges.find(e => e.target === node.id && e.targetHandle === 'end_image')
  ), [edges, node.id])
  const endEdgeUrl = useMemo(() => {
    if (!endEdge) return null
    const src = nodes.find(n => n.id === endEdge.source)
    return src?.data?.content?.url || null
  }, [endEdge, nodes])

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

  const handleStartChange = useCallback((url) => {
    onParamsChange?.({ image_url: url })
  }, [onParamsChange])

  const handleEndChange = useCallback((url) => {
    onParamsChange?.({ end_image_url: url })
  }, [onParamsChange])

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (!startEdgeUrl && !params?.image_url) {
      message.warning('请先提供首帧图片')
      return
    }
    if (!endEdgeUrl && !params?.end_image_url) {
      message.warning('请先提供尾帧图片')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, startEdgeUrl, endEdgeUrl, params?.image_url, params?.end_image_url])

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
            onChange={handleStartChange}
            label="上传首帧"
            portConnected={!!startEdge}
            portThumbUrl={startEdgeUrl}
          />
          <SingleImageUploader
            value={params?.end_image_url || null}
            onChange={handleEndChange}
            label="上传尾帧"
            portConnected={!!endEdge}
            portThumbUrl={endEdgeUrl}
          />
          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="镜头如何过渡到尾帧…"
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
