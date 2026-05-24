/**
 * antd Modal / Drawer 的薄包装,默认 closeIcon 用 Lucide X (跟项目整体图标体系一致).
 * 调用方传 closeIcon prop 可覆盖默认值.
 *
 * 用法: import { Modal, Drawer } from '@/canvas/components/AntdWrappers'
 * 不要再从 antd 直接 import Modal/Drawer (除非确实需要 antd 默认关闭图标).
 */
import { Modal as AntdModal, Drawer as AntdDrawer } from 'antd'
import { X } from '@/canvas/icons'

const lucideCloseIcon = <X size={18} strokeWidth={1.8} />

export function Modal(props) {
  return <AntdModal closeIcon={lucideCloseIcon} {...props} />
}

export function Drawer(props) {
  return <AntdDrawer closeIcon={lucideCloseIcon} {...props} />
}
