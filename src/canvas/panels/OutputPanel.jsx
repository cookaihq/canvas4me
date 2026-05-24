import { lazy, Suspense, useMemo } from 'react'
import { Spin } from 'antd'
import { CAPABILITY_OUTPUT_PANELS } from '../registry/nodeTypes'
import useDebugMode from '../hooks/useDebugMode'
import NodeDataDebugBlock from '../components/debug/NodeDataDebugBlock'

/**
 * 输出节点面板分发器
 *
 * 按照"每子能力独立输出面板"架构（见 docs/archive/node-catalog.md §3,已归档）,
 * 根据 node.data.sourceCapability 懒加载对应的 {Capability}OutputPanel。
 *
 * 调试模式（ai-canvas app setting `debugMode`）开启时，在子面板上方渲染 node.data JSON，
 * 用于定位 resolver / content / 轮询回调链路上的问题。
 */
export default function OutputPanel({ node, onRerun }) {
  const capability = node?.data?.sourceCapability || null
  const debugMode = useDebugMode()

  const LazyPanel = useMemo(() => {
    if (!capability) return null
    const loader = CAPABILITY_OUTPUT_PANELS[capability]
    if (!loader) return null
    return lazy(loader)
  }, [capability])

  const debugBlock = debugMode ? (
    <div style={{ padding: '8px 12px 0 12px' }}>
      <NodeDataDebugBlock node={node} />
    </div>
  ) : null

  if (!LazyPanel) {
    return (
      <div style={{ padding: 16 }}>
        {debugBlock}
        <div style={{ color: 'var(--ac-text-muted)' }}>
          未找到子能力 <code>{capability || '(空)'}</code> 对应的输出面板。
        </div>
      </div>
    )
  }

  return (
    <>
      {debugBlock}
      <Suspense
        fallback={
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin />
          </div>
        }
      >
        <LazyPanel node={node} onRerun={onRerun} />
      </Suspense>
    </>
  )
}

