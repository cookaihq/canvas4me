import { useCallback, useRef, useState } from 'react'
import { Button, Input, Spin, message } from 'antd'

import { Upload as UploadIcon, Music as MusicIcon, X as XIcon } from '@/canvas/icons'
import { useUploader } from '@/platform/provider.jsx'

/**
 * 上传音频克隆入口 — 原型 Y3Sy8
 *
 * 流程:用户上传音频(≥10s) + 可选填写对应文字 → 点「生成音色」→ 提交克隆任务
 *
 * 与「录音克隆」入口的差异(按原型):**无协议勾选**
 *
 * Props:
 *   onSubmit: ({ audioUrl, text }) => void
 *   submitting: boolean   - 由 CloneVoiceModal 控制(克隆任务进行中)
 */

const ACCEPT = 'audio/*'
const MIN_DURATION_SEC = 10

export default function UploadEntryPanel({ onSubmit, submitting }) {
  const uploader = useUploader()
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [audioUrl, setAudioUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [duration, setDuration] = useState(null)
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const disabled = submitting

  // 用 <audio> + blob URL 读本地 File 的时长(秒,浮点)
  const probeDurationFromFile = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(file)
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.muted = true

      let settled = false
      const cleanup = () => {
        audio.onloadedmetadata = null
        audio.onerror = null
        audio.src = ''
        URL.revokeObjectURL(blobUrl)
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('读取音频时长超时'))
      }, 10000)

      audio.onloadedmetadata = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const d = audio.duration
        cleanup()
        if (!Number.isFinite(d) || d <= 0) {
          reject(new Error('无法读取音频时长'))
          return
        }
        resolve(d)
      }
      audio.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        cleanup()
        reject(new Error('音频文件无法解析'))
      }
      audio.src = blobUrl
    })
  }, [])

  const handleSelectFile = useCallback(async (file) => {
    if (!file || disabled || uploading) return
    // 1. 先在本地校验时长 ≥10s,避免无效文件白白上传
    let dur
    try {
      dur = await probeDurationFromFile(file)
    } catch (err) {
      message.error(err?.message || '音频文件无法解析')
      return
    }
    if (dur < MIN_DURATION_SEC) {
      message.error('参考音频至少需 10 秒')
      return
    }

    // 2. 通过校验 → 上传
    setUploading(true)
    try {
      const result = await uploader.uploadFile(file)
      if (!result?.url) throw new Error('上传未返回 URL')
      setAudioUrl(result.url)
      setFileName(file.name || '已上传音频')
      setDuration(dur)
    } catch (err) {
      message.error(`音频上传失败: ${err?.message || '未知错误'}`)
    } finally {
      setUploading(false)
    }
  }, [disabled, uploading, uploader, probeDurationFromFile])

  const handleFileInputChange = useCallback((e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleSelectFile(file)
  }, [handleSelectFile])

  const handlePickClick = useCallback(() => {
    if (disabled || uploading) return
    fileInputRef.current?.click()
  }, [disabled, uploading])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (disabled || uploading) return
    setDragOver(true)
  }, [disabled, uploading])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled || uploading) return
    const file = e.dataTransfer?.files?.[0]
    if (file) handleSelectFile(file)
  }, [disabled, uploading, handleSelectFile])

  const handleDelete = useCallback((e) => {
    e?.stopPropagation?.()
    if (disabled) return
    setAudioUrl('')
    setFileName('')
    setDuration(null)
  }, [disabled])

  const canSubmit = !!audioUrl && !submitting && !uploading
  const handleGenerate = useCallback(() => {
    if (!canSubmit) return
    onSubmit?.({ audioUrl, text })
  }, [canSubmit, onSubmit, audioUrl, text])

  const filled = !!audioUrl

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
        上传一段音频，并补充对应文字，即可生成你的专属声音
      </div>

      {/* 上传区 */}
      <div
        ref={dropRef}
        onClick={!filled ? handlePickClick : undefined}
        onDragOver={!filled ? handleDragOver : undefined}
        onDragLeave={!filled ? handleDragLeave : undefined}
        onDrop={!filled ? handleDrop : undefined}
        style={{
          minHeight: 180,
          border: `1px dashed ${dragOver ? '#2B8DA3' : 'rgba(0,0,0,0.15)'}`,
          borderRadius: 12,
          background: filled ? 'rgba(0,0,0,0.02)' : (dragOver ? 'rgba(43,141,163,0.04)' : '#fafafa'),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
          cursor: filled || disabled || uploading ? 'default' : 'pointer',
          transition: 'all 0.15s',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {uploading ? (
          <>
            <Spin />
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)' }}>上传中...</div>
          </>
        ) : !filled ? (
          <>
            <UploadIcon size={36} color="#2B8DA3" />
            <div style={{ fontSize: 17, fontWeight: 700, color: 'rgba(0,0,0,0.85)' }}>
              上传音频文件
            </div>
            <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
              点击或拖拽音频到这里
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 10,
              maxWidth: '100%',
            }}
          >
            <MusicIcon size={18} color="#2B8DA3" />
            <span
              title={fileName}
              style={{
                fontSize: 14,
                color: 'rgba(0,0,0,0.85)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}
            >
              {fileName}
            </span>
            {duration != null && (
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                {formatDuration(duration)}
              </span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={disabled}
              aria-label="删除音频"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                padding: 0,
                marginLeft: 4,
                border: 'none',
                background: 'transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: 'rgba(0,0,0,0.45)',
                borderRadius: 4,
              }}
            >
              <XIcon size={14} />
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          disabled={disabled || uploading}
        />
      </div>

      {/* 文字内容 */}
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="该音频对应的文字(可选,留空则不生成预览音频)"
        autoSize={{ minRows: 4, maxRows: 8 }}
        maxLength={5000}
        showCount
        disabled={disabled}
      />

      {/* 生成按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          onClick={handleGenerate}
          disabled={!canSubmit}
          loading={submitting}
          style={{ minWidth: 120, height: 44, fontSize: 15, fontWeight: 700 }}
        >
          生成音色
        </Button>
      </div>
    </div>
  )
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
