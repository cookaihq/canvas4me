// src/capabilities/tool/capcut-draft/components/DraftSettingsBar.jsx
// 模态框顶部：草稿名 / 尺寸 / fps / 覆盖 / 助手状态 Badge / 生成草稿按钮。
import { Input, Select, Checkbox, Button, Tooltip } from 'antd'
import { RotateCw } from '@/canvas/icons'
import { randomDraftName } from '../utils'
import HelperStatusBadge from './HelperStatusBadge'

const SIZE_PRESETS = [
  { value: '1920x1080', label: '1920×1080 横屏', w: 1920, h: 1080 },
  { value: '1080x1920', label: '1080×1920 竖屏', w: 1080, h: 1920 },
  { value: '1280x720',  label: '1280×720',     w: 1280, h: 720 },
]
const FPS_OPTIONS = [{ value: 30, label: 30 }, { value: 60, label: 60 }, { value: 24, label: 24 }]

export default function DraftSettingsBar({
  timeline, onChange, onSubmit, submitting, submitDisabled,
  helperState, onRecheck, onTrust, onOpenRelease,
}) {
  const { draftName, canvas, allowReplace } = timeline
  const sizeKey = `${canvas.width}x${canvas.height}`
  const helperBlocking = computeHelperBlocking(helperState)
  return (
    <div className="capcut-settings-bar">
      <span>草稿名</span>
      <Input
        size="small" style={{ width: 200 }} value={draftName}
        onChange={e => onChange({ ...timeline, draftName: e.target.value })}
      />
      <Tooltip title="生成随机草稿名">
        <Button
          size="small"
          type="text"
          icon={<RotateCw size={14} />}
          onClick={() => onChange({ ...timeline, draftName: randomDraftName() })}
        />
      </Tooltip>
      <span>尺寸</span>
      <Select
        size="small" style={{ width: 160 }} value={sizeKey}
        options={SIZE_PRESETS.map(p => ({ value: p.value, label: p.label }))}
        onChange={(v) => {
          const p = SIZE_PRESETS.find(x => x.value === v)
          onChange({ ...timeline, canvas: { ...canvas, width: p.w, height: p.h } })
        }}
      />
      <span>fps</span>
      <Select
        size="small" style={{ width: 80 }} value={canvas.fps}
        options={FPS_OPTIONS}
        onChange={(v) => onChange({ ...timeline, canvas: { ...canvas, fps: v } })}
      />
      <Checkbox
        checked={!!allowReplace}
        onChange={e => onChange({ ...timeline, allowReplace: e.target.checked })}
      >
        覆盖同名草稿
      </Checkbox>
      <span style={{ flex: 1 }} />
      <HelperStatusBadge
        state={helperState}
        onRecheck={onRecheck}
        onTrust={onTrust}
        onOpenRelease={onOpenRelease}
      />
      <Button
        type="primary"
        onClick={onSubmit}
        loading={submitting}
        disabled={submitDisabled || helperBlocking}
      >
        生成草稿
      </Button>
    </div>
  )
}

// helper 不可用时 disable 主按钮：
//   - scan（首帧未到）/ offline（找不到 helper）→ block
//   - health 但 cors_allowed === false → block（业务接口会被浏览器拦）
//   - task 进行中 → 不在这里 block（按钮自身已是 loading 状态）
//   - health 正常（含 has_update）→ 允许
function computeHelperBlocking(state) {
  if (!state) return true
  if (state.type === 'scan' || state.type === 'offline') return true
  if (state.type === 'health' && state.health?.cors_allowed === false) return true
  return false
}
