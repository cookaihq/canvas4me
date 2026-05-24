import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { useEffect } from 'react'
import { getCapabilityOutputs } from '../../registry/nodeTypes'
import { getContentTypeColor, getOutputHandleTop } from '../../utils/designTokens'

/**
 * 输出节点右侧 source handles 渲染器
 *
 * 按 (sourceCapability, sourceMode) 从 registry 读 outputs 数组渲染多个 source handle:
 *   - 主端口 outputs[0]: top=44px, 颜色 = type 对应色(和能力节点主输出端口一致)
 *   - 副端口 outputs[1+]: top 依次 +36px, 颜色 = 各自 type 对应色
 *   - outputs=[] 时不渲染 handle(无输出端口的能力)
 *
 * 约定:handle id = outputs[i].id(通常等于 type,同 type 多个时副用语义名)
 */
export default function OutputHandles({ nodeId, sourceCapability, sourceMode }) {
  const outputs = getCapabilityOutputs(sourceCapability, sourceMode)

  // outputs 集合随 (capability, mode) 变化(LLM 目前固定 2 个,其他能力 1 个)。
  // 副端口出现/消失时需通知 React Flow 重测 handleBounds,否则新连线画不出来。
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(nodeId)
  }, [nodeId, outputs.length, updateNodeInternals])

  return outputs.map((output, index) => (
    <Handle
      key={output.id}
      type="source"
      position={Position.Right}
      id={output.id}
      className="node-handle node-handle-output"
      style={{
        '--port-color': getContentTypeColor(output.type),
        top: `${getOutputHandleTop(index)}px`,
      }}
    />
  ))
}
