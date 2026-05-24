import { useCallback, useEffect, useRef, useState } from 'react'
import { Spin, message } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { useVoicePresets } from '@/platform/provider.jsx'
import useTaskPolling from '@/canvas/hooks/useTaskPolling'
import { generateExtraTaskId } from '@/canvas/utils/extraTaskId'
import RecordEntryPanel from './RecordEntryPanel'
import UploadEntryPanel from './UploadEntryPanel'

/**
 * 克隆音色弹窗 — 两入口切换 + 提交 + 轮询
 *
 * 入口:
 *   - 朗读文字(默认): RecordEntryPanel — 录音 ≥10s + 朗读固定文案
 *   - 上传音频:       UploadEntryPanel — 选音频 ≥10s + 可选文字
 *
 * 流程:
 *   1. 用户在某个 entry 准备好音频 → onSubmit({ audioUrl, text })
 *   2. 这里调 voicePresets.submitClone(...) 拿 Task 快照
 *   3. submitting=true,显示遮罩 + spinner
 *   4. 把 extraTaskId 加入轮询队列(useTaskPolling)
 *   5. 终态:
 *      - 成功 → message.success + onSuccess(voice_id) + onClose()
 *      - 失败/超时 → message.error + submitting=false 让用户重试
 *   6. submitting 期间禁止关闭(防丢任务)
 *
 * 轮询机制: 直接复用 canvas/hooks/useTaskPolling.js — 它本来就是基于 "taskId + localId
 * 二元组" 工作的, 跟画布节点没有耦合; 这里把 nodeId 作为 localId 传进去, 让 Debug 日志
 * 仍有意义即可.
 *
 * Props:
 *   open: boolean
 *   projectId: string                    - 当前画布 id
 *   nodeId: string                       - 触发克隆的 minimax-speech 节点 id
 *   onClose: () => void
 *   onSuccess: (newVoiceId: string) => void
 */

const PRIMARY_COLOR = '#2B8DA3'

const TABS = [
  { key: 'record', label: '朗读文字' },
  { key: 'upload', label: '上传音频' },
]

export default function CloneVoiceModal({ open, projectId, nodeId, onClose, onSuccess }) {
  const voicePresets = useVoicePresets()

  const [currentEntry, setCurrentEntry] = useState('record')
  const [submitting, setSubmitting] = useState(false)
  // 当前正在轮询的查询 ID (优先 extra_task_id, 兜底 task.id)
  const pollingKeyRef = useRef(null)

  // 关闭弹窗时把轮询任务清掉, 防止后台残留 (submitting=false 才允许关闭, 但 unmount
  // 仍可能在 submitting 中触发 — 双保险)
  const removeTaskRef = useRef(null)

  // 弹窗一关上就重置内部状态(下次打开是干净的)
  useEffect(() => {
    if (!open) {
      // 清掉可能残留的轮询任务
      if (pollingKeyRef.current && removeTaskRef.current) {
        try { removeTaskRef.current(pollingKeyRef.current) } catch { /* noop */ }
      }
      pollingKeyRef.current = null
      setSubmitting(false)
      setCurrentEntry('record')
    }
  }, [open])

  const handleSuccess = useCallback((_localId, result) => {
    const voiceId = result?.result?.voice_id
    if (!voiceId) {
      // 任务声明成功但没拿到 voice_id — 走失败分支让用户感知
      message.error('克隆完成但未返回音色 ID，请重试')
      pollingKeyRef.current = null
      setSubmitting(false)
      return
    }
    message.success('音色克隆成功')
    pollingKeyRef.current = null
    setSubmitting(false)
    onSuccess?.(voiceId)
    onClose?.()
  }, [onSuccess, onClose])

  const handleFailed = useCallback((_localId, result) => {
    const msg = result?.error || result?.errorMsg || '克隆失败'
    message.error(msg)
    pollingKeyRef.current = null
    setSubmitting(false)
  }, [])

  const handlePollingTimeout = useCallback((_localId, info) => {
    message.error(`克隆超时(${info?.timeDescription || '已达最大轮询次数'})，请稍后重试`)
    pollingKeyRef.current = null
    setSubmitting(false)
  }, [])

  const { addTask, removeTask } = useTaskPolling({
    interval: 5000,
    maxAttempts: 60,
    onSuccess: handleSuccess,
    onFailed: handleFailed,
    onPollingTimeout: handlePollingTimeout,
  })

  // 把最新的 removeTask 暴露给 useEffect cleanup (避免把 removeTask 加进 useEffect deps
  // 引发循环重建)
  useEffect(() => {
    removeTaskRef.current = removeTask
  }, [removeTask])

  // 两入口共用的 submit 处理: 调 submitClone → 拿 task 快照 → 加入轮询
  const handleEntrySubmit = useCallback(async ({ audioUrl, text }) => {
    if (submitting) return
    if (!audioUrl) {
      message.warning('请先准备好参考音频')
      return
    }

    setSubmitting(true)
    const extraTaskId = generateExtraTaskId()
    try {
      const task = await voicePresets.submitClone(projectId, nodeId, audioUrl, text, extraTaskId)
      // 后端 Task 快照里 id 就是 task_id; extra_task_id 应该回显我们刚传的值.
      // 优先用 extra_task_id 当轮询 key (跟前端传入一致, 后端两边都匹配), 兜底用 id.
      const pollingKey = task?.extra_task_id || extraTaskId || task?.id
      if (!pollingKey) {
        throw new Error('提交成功但未拿到任务 ID')
      }
      pollingKeyRef.current = pollingKey
      addTask(pollingKey, nodeId)
    } catch (err) {
      console.error('[CloneVoiceModal] 提交克隆任务失败:', err)
      message.error(err?.message || '提交克隆任务失败')
      setSubmitting(false)
    }
  }, [submitting, voicePresets, projectId, nodeId, addTask])

  const handleClose = useCallback(() => {
    if (submitting) {
      message.info('克隆任务进行中，请稍候...')
      return
    }
    onClose?.()
  }, [submitting, onClose])

  const handleSwitchToUpload = useCallback(() => {
    if (submitting) return
    setCurrentEntry('upload')
  }, [submitting])

  const handleSwitchTab = useCallback((key) => {
    if (submitting) return
    setCurrentEntry(key)
  }, [submitting])

  return (
    <Modal
      title="克隆新音色"
      open={open}
      onCancel={handleClose}
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      footer={null}
      width={640}
      destroyOnClose
    >
      <div style={{ position: 'relative' }}>
        {/* Tab 切换 — 自定义 segmented control, 跟原型风格保持一致 */}
        <div
          style={{
            display: 'inline-flex',
            gap: 4,
            padding: 4,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          {TABS.map((tab) => {
            const active = currentEntry === tab.key
            const disabled = submitting
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSwitchTab(tab.key)}
                disabled={disabled}
                style={{
                  padding: '6px 18px',
                  border: 'none',
                  borderRadius: 8,
                  background: active ? '#fff' : 'transparent',
                  color: active ? PRIMARY_COLOR : 'rgba(0,0,0,0.65)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Entry 面板 */}
        {currentEntry === 'record' ? (
          <RecordEntryPanel
            onSubmit={handleEntrySubmit}
            submitting={submitting}
            onSwitchToUpload={handleSwitchToUpload}
          />
        ) : (
          <UploadEntryPanel
            onSubmit={handleEntrySubmit}
            submitting={submitting}
          />
        )}

        {/* 克隆进行中遮罩 */}
        {submitting && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,255,255,0.75)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              zIndex: 10,
              borderRadius: 8,
              backdropFilter: 'blur(2px)',
            }}
          >
            <Spin size="large" />
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', textAlign: 'center' }}>
              正在生成音色，请稍候...
              <br />
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                (约 1-2 分钟，请勿关闭弹窗)
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
