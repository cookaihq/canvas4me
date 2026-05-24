import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { MediaInputField, SegmentControl } from '@/canvas/components/fields'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import { useMediaPortInput } from '@/capabilities/video/_shared/useMediaPortInput'

/**
 * fabric · generate-video DockedPanel
 *   主体: 人物图 + 音频(并排标准媒体卡) + 分辨率(标准 segment)
 *   底栏: model chip + 高级 + 积分 + Run + ×N
 *   素材上传走 A 类(建输入节点 + 连线)，由 useMediaPortInput 接通。
 */
export default function GenerateVideoDockedPanel({
  node, capability, mode, params, edges, nodes, isDone,
  paramsUnchanged = false, variant = 'default',
  onCapabilityChange, onModeChange, onParamsChange, onRun, onRequestVariant,
}) {
  const allParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])
  const resolutionSpec = useMemo(() => allParams.find((p) => p.key === 'resolution'), [allParams])
  const bottomParams = useMemo(() => allParams.filter((p) => p.key === 'model'), [allParams])

  const imageField = useMediaPortInput({ node, edges, nodes, portId: 'image', subType: 'image', accept: 'image/*', spawnDy: 0 })
  const audioField = useMediaPortInput({ node, edges, nodes, portId: 'audio', subType: 'audio', accept: 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/m4a,audio/aac,audio/ogg', spawnDy: 540 })

  const anyUploading = !!(imageField.value?.uploading || audioField.value?.uploading)

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (anyUploading) { message.warning('素材还在上传中，请稍候'); return }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, anyUploading])

  return (
    <div className="docked-panel-body th-dp">
      <DockedTopBar
        capability={capability} mode={mode} variant={variant}
        onCapabilityChange={onCapabilityChange} onModeChange={onModeChange} onRequestVariant={onRequestVariant}
      />

      <div className="ac-field-grid">
        <MediaInputField
          type="image" maxCount={1} label="人物图" required
          value={imageField.value} uploadText="上传人物图"
          onAdd={imageField.onAdd} onRemove={imageField.onRemove} onView={imageField.onView}
        />
        <MediaInputField
          type="audio" maxCount={1} label="音频"
          value={audioField.value} uploadText="上传音频"
          onAdd={audioField.onAdd} onRemove={audioField.onRemove} onView={audioField.onView}
        />
      </div>
      <input {...imageField.fileInputProps} />
      <input {...audioField.fileInputProps} />
      <MediaPreviewModal {...imageField.previewProps} />
      <MediaPreviewModal {...audioField.previewProps} />

      {resolutionSpec && (
        <SegmentControl
          label={resolutionSpec.label || '分辨率'}
          value={params.resolution ?? resolutionSpec.defaultValue}
          onChange={(v) => onParamsChange?.({ resolution: v })}
          options={resolutionSpec.options.map((o) => ({ label: o.shortLabel || o.label, value: o.value }))}
        />
      )}

      <DockedBottomBar
        capability={capability} mode={mode} commonParams={bottomParams}
        params={params} onParamsChange={onParamsChange} variant={variant}
        isDone={isDone} paramsUnchanged={paramsUnchanged} runDisabled={anyUploading}
        runCount={runCount} onRunCountChange={setRunCount} onRun={handleRunClick} onRequestVariant={onRequestVariant}
      />
    </div>
  )
}
