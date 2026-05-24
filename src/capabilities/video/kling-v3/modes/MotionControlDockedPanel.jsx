import { useCallback, useMemo, useState } from 'react'
import { message, Image } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { FieldGrid, MediaInputField } from '@/canvas/components/fields'
import { useMediaPortInput } from '@/capabilities/video/_shared/useMediaPortInput'

/**
 * 可灵 V3 · motion-control DockedPanel
 *
 * 主区:
 *   - 人物图 + 动作参考视频 并排 (FieldGrid)
 *   - 补充描述 prompt textarea (端口优先)
 *   无高级区 (motion-control 不支持 negative_prompt)
 *
 * commonParams (来自 register.js): 模式 / 朝向 / 保留原声
 */
export default function MotionControlDockedPanel({
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

  // character_image 端口 — 人物图, 单张图片
  const characterImageField = useMediaPortInput({
    node, edges, nodes,
    portId: 'character_image',
    subType: 'image',
    accept: 'image/*',
    spawnDy: 0,
  })

  // motion_video 端口 — 动作参考视频, 单段视频
  const motionVideoField = useMediaPortInput({
    node, edges, nodes,
    portId: 'motion_video',
    subType: 'video',
    accept: 'video/mp4,video/quicktime,video/webm',
    spawnDy: 220,
  })

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步 (补充描述)
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

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (characterImageField.value?.uploading || motionVideoField.value?.uploading) {
      message.warning('素材还在上传中，请稍候')
      return
    }
    if (!characterImageField.value) {
      message.warning('请先上传人物图或连接 character_image 端口')
      return
    }
    if (!motionVideoField.value) {
      message.warning('请先上传动作参考视频或连接 motion_video 端口')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, characterImageField.value, motionVideoField.value])

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
          <FieldGrid>
            <MediaInputField
              type="image"
              maxCount={1}
              label="人物图"
              required
              uploadText="上传人物图"
              value={characterImageField.value}
              onAdd={characterImageField.onAdd}
              onRemove={characterImageField.onRemove}
              onView={characterImageField.onView}
            />
            <MediaInputField
              type="video"
              maxCount={1}
              label="动作参考视频"
              required
              uploadText="上传参考视频"
              value={motionVideoField.value}
              onAdd={motionVideoField.onAdd}
              onRemove={motionVideoField.onRemove}
            />
          </FieldGrid>
          <input {...characterImageField.fileInputProps} />
          <input {...motionVideoField.fileInputProps} />

          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="补充描述（可选）…"
            variant="inline"
          />
        </div>
      </div>

      {characterImageField.previewUrl && (
        <Image
          style={{ display: 'none' }}
          src={characterImageField.previewUrl}
          preview={{
            visible: true,
            src: characterImageField.previewUrl,
            onVisibleChange: (v) => { if (!v) characterImageField.closePreview() },
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
