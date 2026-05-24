import { useMemo } from 'react'
import { Button, message } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'

/**
 * 完整错误日志弹窗 — 按 docs/reference/ux-spec.md §6.3 规范
 *
 * 把 rawError 完整展示给用户(等宽字体 / JSON 缩进 / 可滚动 / 可复制)。
 */
function formatRawError(rawError) {
  if (rawError == null) return ''
  if (typeof rawError === 'string') return rawError
  try {
    return JSON.stringify(rawError, null, 2)
  } catch {
    try {
      return String(rawError)
    } catch {
      return ''
    }
  }
}

export default function ErrorLogModal({ open, rawError, onClose }) {
  const text = useMemo(() => formatRawError(rawError), [rawError])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制')
    } catch {
      message.error('复制失败，请手动选择文本')
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="完整错误日志"
      width={720}
      footer={[
        <Button key="copy" onClick={handleCopy}>复制到剪贴板</Button>,
        <Button key="close" type="primary" onClick={onClose}>关闭</Button>,
      ]}
      destroyOnHidden
    >
      <pre
        style={{
          maxHeight: '60vh',
          overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          padding: 12,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text || '(空)'}
      </pre>
    </Modal>
  )
}
