import { useCallback, useMemo, useState } from 'react'
import { message, Image } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { MediaInputField, PromptTextarea } from '@/canvas/components/fields'
import { useMediaPortInput } from '@/capabilities/video/_shared/useMediaPortInput'

/**
 * 可灵 V3 · image-to-video DockedPanel
 *
 * 主区:
 *   - 起始图 MediaInputField (端口 start_image, 单张, 上传即建输入节点)
 *   - prompt textarea (端口优先)
 *   - 高级区: negative_prompt (variant = 'advanced' | 'modal' 时展示)
 *
 * commonParams (来自 register.js): 清晰度 / 时长 / 音频 (无比例)
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
  const facade = useCanvasFacade()
  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // start_image 端口 — 走标准 useMediaPortInput adapter
  const startImageField = useMediaPortInput({
    node, edges, nodes,
    portId: 'start_image',
    subType: 'image',
    accept: 'image/*',
    spawnDy: 0,
  })

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

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (startImageField.value?.uploading) {
      message.warning('图片还在上传中，请稍候')
      return
    }
    if (!startImageField.value) {
      message.warning('请先上传起始图或连接 start_image 端口')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, startImageField.value])

  return (
    <div className="docked-panel-body kv3-dp">
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
          <MediaInputField
            type="image"
            maxCount={1}
            label="起始图"
            required
            uploadText="上传起始图"
            value={startImageField.value}
            onAdd={startImageField.onAdd}
            onRemove={startImageField.onRemove}
            onView={startImageField.onView}
          />
          <input {...startImageField.fileInputProps} />

          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="为视频补充提示词…"
            variant="inline"
          />

          {showAdvanced && (
            <PromptTextarea
              label="负面提示词"
              value={params?.negative_prompt || ''}
              onChange={(val) => onParamsChange?.({ negative_prompt: val })}
              placeholder="描述不希望出现在画面中的内容…"
              maxLength={500}
            />
          )}
        </div>
      </div>

      {startImageField.previewUrl && (
        <Image
          style={{ display: 'none' }}
          src={startImageField.previewUrl}
          preview={{
            visible: true,
            src: startImageField.previewUrl,
            onVisibleChange: (v) => { if (!v) startImageField.closePreview() },
          }}
        />
      )}

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
