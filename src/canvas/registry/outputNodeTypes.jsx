/**
 * 输出节点 React Flow nodeType 注册表(2.1.5 后:统一来自 capabilities)
 *
 * 每个 capability 对应一个独立的 nodeType: `output-{capability}`。
 * Eager import 是 React Flow 的硬性要求,所以 src/capabilities/{type}/{cap}/register.js
 * 通过 registerCapability({ outputNode: <已 import 的组件> }) 把组件 eager 注入到
 * CAPABILITY_OUTPUT_NODE_TYPES,本文件用 withFoldedShell 包一层后透传给 React Flow。
 *
 * withFoldedShell:被上游折叠能力吸收的 output 节点渲染为不可见 1×1 壳,
 * 但保留隐形 Handle —— React Flow 对"无 handle bounds 的节点"会跳过其边的渲染,
 * 留隐形 handle 让跨外边仍能挂载,再由 CustomEdge 把起点重写到 parent 能力节点端口。
 * source handle 复用 OutputHandles(id = 各 output.id),target 复用约定的 id="input",
 * 两者 id 与展开态一致,保证 RF 量到的 handle bounds 不变。
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { CAPABILITY_OUTPUT_NODE_TYPES } from './nodeTypes'
import { useIsFoldedOutput } from '../state/canvasDerived'
import OutputHandles from '../components/nodes/OutputHandles'

function FoldedOutputShell({ id, data }) {
  return (
    <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
      <Handle type="target" position={Position.Left} id="input" style={{ opacity: 0 }} />
      <OutputHandles nodeId={id} sourceCapability={data?.sourceCapability} sourceMode={data?.sourceMode} />
    </div>
  )
}

function withFoldedShell(Comp) {
  function FoldedShellWrapper(props) {
    const folded = useIsFoldedOutput(props.id)
    if (folded) return <FoldedOutputShell id={props.id} data={props.data} />
    return <Comp {...props} />
  }
  FoldedShellWrapper.displayName = `withFoldedShell(${Comp.displayName || Comp.name || 'OutputNode'})`
  return memo(FoldedShellWrapper)
}

export const OUTPUT_NODE_TYPES = Object.fromEntries(
  Object.entries(CAPABILITY_OUTPUT_NODE_TYPES).map(([type, Comp]) => [type, withFoldedShell(Comp)]),
)
