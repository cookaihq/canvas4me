import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { MediaInputField, SegmentControl } from '@/canvas/components/fields'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import { useMediaPortInput } from '@/capabilities/video/_shared/useMediaPortInput'

const SYNC_MODE_HELP = {
  loop:    'Loop:视频循环播放以匹配音频长度;输出时长 = 音频时长。',
  bounce:  'Bounce:视频来回播放以匹配音频长度;输出时长 = 音频时长。',
  cut_off: 'Cut off:视频/音频较短者截断;输出时长 = min(视频, 音频)。',
  silence: 'Silence:不足处用静音填充;输出时长 = 视频时长。',
  remap:   'Remap:重映射时间轴对齐音频;输出时长 = 音频时长。',
}

/**
 * sync · sync-video DockedPanel
 *   主体: 源视频 + 音频(标准媒体卡) + 同步模式(等宽 segment + 动态 help)
 *   底栏: model chip + 高级 + 积分 + Run + ×N
 *   素材上传走 A 类(建输入节点 + 连线)，由 useMediaPortInput 接通。
 */
export default function SyncVideoDockedPanel({
  node, capability, mode, params, edges, nodes, isDone,
  paramsUnchanged = false, variant = 'default',
  onCapabilityChange, onModeChange, onParamsChange, onRun, onRequestVariant,
}) {
  const allParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])
  const syncModeSpec = useMemo(() => allParams.find((p) => p.key === 'sync_mode'), [allParams])
  const bottomParams = useMemo(() => allParams.filter((p) => p.key === 'model'), [allParams])

  const videoField = useMediaPortInput({ node, edges, nodes, portId: 'video', subType: 'video', accept: 'video/mp4,video/quicktime,video/x-m4v', spawnDy: 0 })
  const audioField = useMediaPortInput({ node, edges, nodes, portId: 'audio', subType: 'audio', accept: 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/m4a,audio/aac,audio/ogg', spawnDy: 540 })

  const anyUploading = !!(videoField.value?.uploading || audioField.value?.uploading)
  const currentSyncMode = params.sync_mode ?? syncModeSpec?.defaultValue ?? 'loop'

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
          type="video" maxCount={1} label="源视频" required
          value={videoField.value} uploadText="上传视频"
          onAdd={videoField.onAdd} onRemove={videoField.onRemove} onView={videoField.onView}
        />
        <MediaInputField
          type="audio" maxCount={1} label="音频" required
          value={audioField.value} uploadText="上传音频"
          onAdd={audioField.onAdd} onRemove={audioField.onRemove} onView={audioField.onView}
        />
      </div>
      <input {...videoField.fileInputProps} />
      <input {...audioField.fileInputProps} />
      <MediaPreviewModal {...videoField.previewProps} />
      <MediaPreviewModal {...audioField.previewProps} />

      {syncModeSpec && (
        <SegmentControl
          fill
          label={syncModeSpec.label || '同步模式'}
          value={currentSyncMode}
          onChange={(v) => onParamsChange?.({ sync_mode: v })}
          options={syncModeSpec.options.map((o) => ({ label: o.shortLabel || o.label, value: o.value }))}
          help={SYNC_MODE_HELP[currentSyncMode] || ''}
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
