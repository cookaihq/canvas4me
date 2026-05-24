import React from 'react'
import { captureError } from '@/utils/errorReport'

/**
 * 应用根 ErrorBoundary — 抓 React render / commit 阶段的同步错误
 *
 * 行为:
 *   - componentDidCatch 触发 captureError 把错误 + componentStack + 当时画布快照
 *     + console 面包屑塞进 localStorage 环形缓冲
 *   - render 时直接卸掉子树, 显示空白 (用户视觉无差别)
 *   - 用户可在设置页 "诊断" tab 下载完整 json 反馈给我
 *
 * 不在白屏上显示错误信息: 错误屏越简单越好, 提示文案反而让用户慌
 * (见与用户的对话: 选择方案 A)
 */
export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    captureError({
      type: 'react',
      error,
      componentStack: info?.componentStack || '',
    })
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}
