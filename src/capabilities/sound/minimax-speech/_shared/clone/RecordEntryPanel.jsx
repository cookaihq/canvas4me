import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Checkbox, message } from 'antd'
import { Mic as MicIcon, Square as SquareIcon, Info as InfoIcon, RefreshCw as RefreshIcon, RotateCcw as RetryIcon } from '@/canvas/icons'
import { useUploader } from '@/platform/provider.jsx'
import { VOICE_CLONE_CONSENT_TEXT, VOICE_CLONE_RULES_URL } from '../terms'

/**
 * 朗读录音克隆入口 — 原型 XKuEg
 *
 * 流程:用户朗读固定文案 → 录音 ≥10s → 勾选授权协议 → 点「生成音色」→ 提交克隆任务
 *
 * 与「上传音频」入口的差异(按原型):
 *   - 必须勾选授权协议(上传入口无此勾选)
 *   - 朗读文案由前端固定提供,与音频绑定一起提交,作为 text 字段
 *
 * Props:
 *   onSubmit: ({ audioUrl, text }) => void
 *   submitting: boolean
 *   onSwitchToUpload: () => void   - 底部「上传音频」链接的回调
 */

const SAMPLE_TEXTS = [
  '一个好的视频，往往不是一次生成出来的，而是在不断尝试中慢慢完成的。喵布TV让创作者可以把灵感、素材和模型组织成清晰的工作流。',
  '声音是情感的载体。一段好的旁白可以让画面更鲜活，让故事更动人。',
  '人工智能正在改变我们与世界交互的方式，从文字到图像，从声音到视频，每一个细节都值得用心打磨。',
  '阅读是一种慢下来的力量。在这个信息爆炸的时代，保持一份专注，就是给自己最好的礼物。',
  '想象一下，你的声音可以朗读任何一段文字，可以用于电影、广播、教育、播客。这就是声音克隆带来的可能性。',
]

const MIN_DURATION_SEC = 10
const PRIMARY_COLOR = '#2B8DA3'

const supportsRecording = typeof window !== 'undefined'
  && typeof window.MediaRecorder !== 'undefined'
  && !!navigator?.mediaDevices?.getUserMedia

export default function RecordEntryPanel({ onSubmit, submitting, onSwitchToUpload }) {
  const uploader = useUploader()

  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordedUrl, setRecordedUrl] = useState('')
  const [recordedSec, setRecordedSec] = useState(0)
  const [consentChecked, setConsentChecked] = useState(false)
  const [currentTextIdx, setCurrentTextIdx] = useState(0)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [uploading, setUploading] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const recordedUrlRef = useRef('')

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
      streamRef.current = null
    }
  }, [])

  const revokeRecordedUrl = useCallback(() => {
    if (recordedUrlRef.current) {
      try { URL.revokeObjectURL(recordedUrlRef.current) } catch { /* noop */ }
      recordedUrlRef.current = ''
    }
  }, [])

  // unmount cleanup:停止录音、释放麦克风、清掉 blob URL
  useEffect(() => {
    return () => {
      stopTimer()
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* noop */ }
      }
      releaseStream()
      revokeRecordedUrl()
    }
  }, [stopTimer, releaseStream, revokeRecordedUrl])

  const handleStartRecord = useCallback(async () => {
    if (!supportsRecording || submitting || starting || stopping || recording) return
    setStarting(true)
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setStarting(false)
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        message.error('请允许浏览器访问麦克风')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        message.error('未检测到可用的麦克风设备')
      } else {
        message.error(`无法启动录音: ${err?.message || '未知错误'}`)
      }
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    // 清掉上一段录音的预览(若有)
    revokeRecordedUrl()
    setRecordedBlob(null)
    setRecordedUrl('')
    setRecordedSec(0)

    let recorder
    try {
      // 优先 audio/webm,浏览器不支持时让 MediaRecorder 自己挑默认 codec
      const mimeType = (typeof MediaRecorder.isTypeSupported === 'function'
        && MediaRecorder.isTypeSupported('audio/webm'))
        ? 'audio/webm'
        : undefined
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch (err) {
      releaseStream()
      setStarting(false)
      message.error(`无法创建录音器: ${err?.message || '未知错误'}`)
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const type = recorder.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type })
      chunksRef.current = []
      const url = URL.createObjectURL(blob)
      recordedUrlRef.current = url
      setRecordedBlob(blob)
      setRecordedUrl(url)
      releaseStream()
      setStopping(false)
    }
    recorder.onerror = (e) => {
      stopTimer()
      releaseStream()
      setRecording(false)
      setStarting(false)
      setStopping(false)
      message.error(`录音异常: ${e?.error?.message || '未知错误'}`)
    }

    recorderRef.current = recorder
    try {
      recorder.start()
    } catch (err) {
      releaseStream()
      setStarting(false)
      message.error(`无法开始录音: ${err?.message || '未知错误'}`)
      return
    }

    setRecording(true)
    setStarting(false)
    timerRef.current = setInterval(() => {
      setRecordedSec((s) => s + 1)
    }, 1000)
  }, [
    submitting,
    starting,
    stopping,
    recording,
    releaseStream,
    revokeRecordedUrl,
    stopTimer,
  ])

  const handleStopRecord = useCallback(() => {
    if (!recording || stopping) return
    setStopping(true)
    stopTimer()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* noop */ }
    } else {
      // 兜底
      releaseStream()
      setStopping(false)
    }
    setRecording(false)
  }, [recording, stopping, stopTimer, releaseStream])

  const handleRetryRecord = useCallback(() => {
    if (submitting || uploading) return
    stopTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* noop */ }
    }
    releaseStream()
    revokeRecordedUrl()
    setRecordedBlob(null)
    setRecordedUrl('')
    setRecordedSec(0)
    setRecording(false)
    setStarting(false)
    setStopping(false)
  }, [submitting, uploading, stopTimer, releaseStream, revokeRecordedUrl])

  const handleRefreshText = useCallback(() => {
    if (submitting) return
    setCurrentTextIdx((idx) => (idx + 1) % SAMPLE_TEXTS.length)
  }, [submitting])

  const canSubmit = !!recordedBlob
    && consentChecked
    && !submitting
    && !uploading
    && !recording
    && recordedSec >= MIN_DURATION_SEC

  const handleGenerate = useCallback(async () => {
    if (!recordedBlob) return
    if (recordedSec < MIN_DURATION_SEC) {
      message.warning(`参考音频至少需 ${MIN_DURATION_SEC} 秒`)
      return
    }
    if (!consentChecked) {
      message.warning('请先勾选授权协议')
      return
    }
    setUploading(true)
    try {
      const file = new File([recordedBlob], 'recording.webm', {
        type: recordedBlob.type || 'audio/webm',
      })
      const result = await uploader.uploadFile(file)
      if (!result?.url) throw new Error('上传未返回 URL')
      onSubmit?.({ audioUrl: result.url, text: SAMPLE_TEXTS[currentTextIdx] })
    } catch (err) {
      message.error(`音频上传失败: ${err?.message || '未知错误'}`)
    } finally {
      setUploading(false)
    }
  }, [recordedBlob, recordedSec, consentChecked, uploader, onSubmit, currentTextIdx])

  // 浏览器不支持录音 → 降级面板
  if (!supportsRecording) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
          朗读一段文字，即可克隆你的专属声音
        </div>
        <div
          style={{
            padding: 24,
            border: '1px dashed rgba(0,0,0,0.15)',
            borderRadius: 12,
            background: '#fafafa',
            textAlign: 'center',
            color: 'rgba(0,0,0,0.65)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          当前浏览器不支持麦克风录音，请切换至「上传音频」入口。
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a
            onClick={(e) => { e.preventDefault(); onSwitchToUpload?.() }}
            style={{ color: PRIMARY_COLOR, fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
            href="#"
          >
            上传音频
          </a>
          <Button type="primary" disabled style={{ minWidth: 120, height: 44, fontSize: 15, fontWeight: 700 }}>
            生成音色
          </Button>
        </div>
      </div>
    )
  }

  const disableSwitch = submitting || uploading || recording

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 头部:提示 + 文本刷新 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
          朗读一段文字，即可克隆你的专属声音
        </div>
        <button
          type="button"
          onClick={handleRefreshText}
          disabled={submitting || recording}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            color: 'rgba(0,0,0,0.65)',
            fontSize: 16,
            fontWeight: 600,
            cursor: (submitting || recording) ? 'not-allowed' : 'pointer',
            opacity: (submitting || recording) ? 0.5 : 1,
            borderRadius: 6,
          }}
          aria-label="刷新朗读文案"
        >
          <RefreshIcon size={18} />
          文本刷新
        </button>
      </div>

      {/* 朗读内容 + 录音按钮 / 已录预览 */}
      <div
        style={{
          padding: '32px 28px',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 12,
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            fontSize: 17,
            color: 'rgba(0,0,0,0.85)',
            lineHeight: 1.65,
            textAlign: 'center',
            width: '100%',
          }}
        >
          <span style={{ color: 'rgba(0,0,0,0.45)' }}>需朗读内容：</span>
          {SAMPLE_TEXTS[currentTextIdx]}
        </div>

        {/* 录音按钮 or 已录预览 */}
        {!recordedBlob ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={recording ? handleStopRecord : handleStartRecord}
              disabled={submitting || starting || stopping}
              aria-label={recording ? '停止录音' : '开始录音'}
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                border: 'none',
                background: recording ? '#EF4444' : PRIMARY_COLOR,
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (submitting || starting || stopping) ? 'not-allowed' : 'pointer',
                opacity: (submitting || starting || stopping) ? 0.6 : 1,
                boxShadow: recording
                  ? '0 0 0 8px rgba(239, 68, 68, 0.18), 0 0 0 16px rgba(239, 68, 68, 0.08)'
                  : '0 4px 12px rgba(43, 141, 163, 0.25)',
                transition: 'box-shadow 0.2s, background 0.2s',
              }}
            >
              {recording ? <SquareIcon size={28} fill="#fff" /> : <MicIcon size={32} />}
            </button>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', minHeight: 20 }}>
              {recording
                ? `已用时 ${formatTime(recordedSec)}`
                : (recordedSec > 0 ? `已用时 ${formatTime(recordedSec)}` : '点击开始录音')}
            </div>
            {recordedSec > 0 && recordedSec < MIN_DURATION_SEC && !recording && (
              <div style={{ fontSize: 12, color: '#EF4444' }}>
                至少录 {MIN_DURATION_SEC} 秒
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={recordedUrl} style={{ width: '100%', maxWidth: 520 }} />
            <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
              已录 {formatTime(recordedSec)}
              {recordedSec < MIN_DURATION_SEC && (
                <span style={{ color: '#EF4444', marginLeft: 8 }}>
                  (至少 {MIN_DURATION_SEC} 秒)
                </span>
              )}
            </div>
            <Button
              type="text"
              icon={<RetryIcon size={14} />}
              onClick={handleRetryRecord}
              disabled={submitting || uploading}
              style={{ color: PRIMARY_COLOR, fontWeight: 600 }}
            >
              重新录制
            </Button>
          </div>
        )}

        {/* 授权 pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: '#E8F6FA',
            border: '1px solid #C7EBF4',
            borderRadius: 999,
            fontSize: 13,
            color: 'rgba(0,0,0,0.65)',
          }}
        >
          <InfoIcon size={14} color={PRIMARY_COLOR} />
          开始录音即表示您已获得声音授权
        </div>
      </div>

      {/* 协议勾选 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Checkbox
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          disabled={submitting || uploading}
          style={{ marginTop: 2 }}
        />
        <div
          style={{
            fontSize: 13,
            color: 'rgba(0,0,0,0.65)',
            lineHeight: 1.6,
            flex: 1,
            cursor: (submitting || uploading) ? 'not-allowed' : 'pointer',
          }}
          onClick={() => {
            if (submitting || uploading) return
            setConsentChecked((v) => !v)
          }}
        >
          {VOICE_CLONE_CONSENT_TEXT}{' '}
          <a
            href={VOICE_CLONE_RULES_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: PRIMARY_COLOR, fontWeight: 600 }}
          >
            查看规则
          </a>
        </div>
      </div>

      {/* 底部:上传链接 + 生成按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            if (disableSwitch) return
            onSwitchToUpload?.()
          }}
          style={{
            color: PRIMARY_COLOR,
            fontSize: 17,
            fontWeight: 600,
            cursor: disableSwitch ? 'not-allowed' : 'pointer',
            opacity: disableSwitch ? 0.5 : 1,
            pointerEvents: disableSwitch ? 'none' : 'auto',
          }}
        >
          上传音频
        </a>
        <Button
          type="primary"
          onClick={handleGenerate}
          disabled={!canSubmit}
          loading={submitting || uploading}
          style={{ minWidth: 120, height: 44, fontSize: 15, fontWeight: 700 }}
        >
          生成音色
        </Button>
      </div>
    </div>
  )
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
