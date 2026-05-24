// src/capabilities/tool/capcut-draft/components/AuthHintModal.jsx
// 兜底引导弹窗：当 trust_url 唤起后 helper 仍未授权当前 origin 时弹出。
// 直接展示 helper /health 返回的 hint 文案（已是中文人话），底部按钮触发 recheck。
//
// 设计依据：docs/superpowers/specs/2026-05-17-capcut-helper-status-badge-redesign-design.md §4.3 / §7.1

import { Button } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'

const DEFAULT_HINT = '当前网站未在剪映助手的 CORS 白名单中。请打开剪映助手 → 设置 → CORS 白名单 → 添加当前网站后保存（无需重启）。'

export default function AuthHintModal({ open, hint, onRetry, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="需要在剪映助手中授权当前网站"
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="retry" type="primary" onClick={onRetry}>我已添加，重试</Button>,
      ]}
      centered
      destroyOnClose
    >
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{hint || DEFAULT_HINT}</p>
    </Modal>
  )
}
