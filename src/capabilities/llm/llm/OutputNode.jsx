/**
 * llm 输出节点 —— text 类型输出,4 个 mode 共用一个 OutputNode 组件。
 *
 * 节点本体只展示文本结果(无图片缩略图等),所以结构比 image/video 简单。
 * 正文渲染抽到 _shared/LlmOutputBody.jsx,带流式 markdown / reasoning 折叠 / 完成态徽章。
 */
import { memo, useMemo } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import OutputModeBadge from '@/canvas/components/nodes/OutputModeBadge'
import { getContentTypeColor } from '@/canvas/utils/designTokens'
import NodeMetaRow from '@/canvas/components/NodeMetaRow'
import OutputHandles from '@/canvas/components/nodes/OutputHandles'
import { useStoreEdges } from '@/canvas/state/canvasDerived'
import LlmOutputBody from './_shared/LlmOutputBody'

function LlmOutput({ id, data, selected }) {
  // 给 Failed 重试用: 沿入边反查上游能力节点 id
  const edges = useStoreEdges()
  const capabilityNodeId = useMemo(() => {
    for (const e of edges) {
      if (e.target === id) return e.source
    }
    return null
  }, [edges, id])
  // 用 text 颜色作为外框 type-color(下游连线着色一致)
  const typeColor = getContentTypeColor('text')
  const isError = data.runStatus === 'error'
  // done 态把 tokens 挂到 meta 行右侧 (跟图片/视频的"分辨率·大小"同一档"产物量化信息")
  const totalTokens = data.usage?.total_tokens
  const metaInfo = data.runStatus === 'done' && Number.isFinite(totalTokens)
    ? `${totalTokens} Tokens`
    : undefined

  return (
    <>
      <NodeResizer
        minWidth={240}
        minHeight={140}
        isVisible={selected}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      <NodeMetaRow
        nodeId={id}
        name={data.name}
        info={metaInfo}
        runStatus={data.runStatus}
        startedAt={data.startedAt}
        finishedAt={data.finishedAt}
        timedOut={Boolean(data.content?.pollingTimeout || data.content?.sseTimeout)}
      />

      <div
        className={[
          'output-node',
          selected && 'selected',
          selected && 'nowheel',
          data.runStatus === 'done' && 'output-done',
          (data.runStatus === 'running' || data.runStatus === 'polling') && 'output-running',
          isError && 'output-error',
        ].filter(Boolean).join(' ')}
        style={{ '--type-color': typeColor }}
        data-subtype="text"
      >
        <OutputModeBadge capability={data.sourceCapability} mode={data.sourceMode} />
        <div className="output-node-content">
          <LlmOutputBody
            data={data}
            outputNodeId={id}
            capabilityNodeId={capabilityNodeId}
            sourceCapability={data.sourceCapability}
          />
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="node-handle"
        style={{ '--port-color': typeColor, top: '44px' }}
      />
      <OutputHandles nodeId={id} sourceCapability={data.sourceCapability} sourceMode={data.sourceMode} />
    </>
  )
}

export default memo(LlmOutput)
