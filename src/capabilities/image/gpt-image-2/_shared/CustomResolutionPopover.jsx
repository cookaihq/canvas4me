import { useState, useEffect, useMemo } from 'react'
import { Popover, InputNumber, Button, Space } from 'antd'

/**
 * 自定义宽高输入（触发按钮 + Popover）。
 *
 * 约束（与上游 API 对齐，客户端仅 hint 不阻塞提交，后端权威校验）：
 *   - 整数，256 ≤ w/h ≤ 3840
 *   - 16 的倍数
 *   - 长短边比 ≤ 3:1
 *   - 总像素 655,360 ≤ w×h ≤ 8,294,400
 *
 * value = null 或字符串预设 → 按钮显示"自定义宽高"
 * value = { width, height } → 按钮显示"W×H（自定义）"，高亮
 */
const MIN_DIM = 256
const MAX_DIM = 3840
const MIN_PIXELS = 655360
const MAX_PIXELS = 8294400
const MAX_RATIO = 3

export default function CustomResolutionPopover({ value, onChange, disabled }) {
  const isCustom = value && typeof value === 'object' && value.width && value.height

  const [open, setOpen] = useState(false)
  const [draftW, setDraftW] = useState(isCustom ? value.width : 1024)
  const [draftH, setDraftH] = useState(isCustom ? value.height : 1024)

  useEffect(() => {
    if (isCustom) {
      setDraftW(value.width)
      setDraftH(value.height)
    }
  }, [isCustom, value])

  const validation = useMemo(() => checkResolution(draftW, draftH), [draftW, draftH])

  const handleConfirm = () => {
    onChange({ width: draftW, height: draftH })
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null)
    setOpen(false)
  }

  const buttonLabel = isCustom ? `${value.width}×${value.height}（自定义）` : '自定义宽高'

  return (
    <Popover
      open={open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      trigger="click"
      placement="bottomLeft"
      content={
        <div style={{ width: 280 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
            像素值需为 16 的倍数，范围 {MIN_DIM}–{MAX_DIM}
          </div>
          <Space>
            <InputNumber
              min={MIN_DIM}
              max={MAX_DIM}
              step={16}
              value={draftW}
              onChange={(v) => setDraftW(v || MIN_DIM)}
              addonBefore="W"
              style={{ width: 120 }}
            />
            <InputNumber
              min={MIN_DIM}
              max={MAX_DIM}
              step={16}
              value={draftH}
              onChange={(v) => setDraftH(v || MIN_DIM)}
              addonBefore="H"
              style={{ width: 120 }}
            />
          </Space>
          {!validation.ok && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ff4d4f' }}>
              {validation.message}
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
            {isCustom ? (
              <Button size="small" type="link" onClick={handleClear}>清除</Button>
            ) : <span />}
            <Space>
              <Button size="small" onClick={() => setOpen(false)}>取消</Button>
              <Button size="small" type="primary" onClick={handleConfirm} disabled={!validation.ok}>
                确定
              </Button>
            </Space>
          </div>
        </div>
      }
    >
      <Button
        size="small"
        type={isCustom ? 'primary' : 'default'}
        ghost={isCustom}
        disabled={disabled}
      >
        {buttonLabel}
      </Button>
    </Popover>
  )
}

function checkResolution(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h)) {
    return { ok: false, message: '宽高必须为整数' }
  }
  if (w < MIN_DIM || h < MIN_DIM || w > MAX_DIM || h > MAX_DIM) {
    return { ok: false, message: `宽/高须在 ${MIN_DIM}–${MAX_DIM}` }
  }
  if (w % 16 !== 0 || h % 16 !== 0) {
    return { ok: false, message: '宽/高必须是 16 的倍数' }
  }
  const ratio = Math.max(w / h, h / w)
  if (ratio > MAX_RATIO) {
    return { ok: false, message: `长短边比不能超过 ${MAX_RATIO}:1` }
  }
  const px = w * h
  if (px < MIN_PIXELS || px > MAX_PIXELS) {
    return { ok: false, message: `总像素须在 ${MIN_PIXELS.toLocaleString()}–${MAX_PIXELS.toLocaleString()}` }
  }
  return { ok: true, message: '' }
}
