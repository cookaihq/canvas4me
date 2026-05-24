/**
 * 折叠形态(form 'folded')下,llm 能力节点的产物预览卡 — 4 个 mode 共用
 *
 * 状态以下游 outputNode 为准(idle/running/polling/done/error);Ready 退化为提示文案。
 * 完整 LLM 输出(流式 markdown + reasoning 折叠 + meta)由 _shared/LlmOutputBody 渲染,
 * 与独立 OutputNode 节点完全一致(reuse 同一组件)。
 *
 * 每个 mode 一个薄包装文件,只是传不同的 readyHint(mode 名)。
 */
import { memo } from 'react'
import { MessageCircle } from '@/canvas/icons'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import LlmOutputBody from '../_shared/LlmOutputBody'

function LlmFoldedCard({ nodeId, data, downstreamOutputNode, modeLabel }) {
  // 真实状态以下游 outputNode 为准;未运行时退化到本节点
  const outputData = downstreamOutputNode?.data
  const runStatus = outputData?.runStatus || data?.runStatus
  const status = normalizeRunStatus(runStatus)

  if (status === 'Ready') {
    return (
      <div className="llm-folded-empty">
        <MessageCircle className="llm-folded-empty-icon" />
        <div className="llm-folded-empty-title">{modeLabel}</div>
        <div className="llm-folded-empty-hint">连接输入后点击 Run</div>
      </div>
    )
  }

  // running/polling/done/error 全部交给 LlmOutputBody;数据走下游 outputNode.data
  // nodeId 是上游能力节点 id, 给 LlmOutputBody 的 Failed 重试用
  return (
    <div className="llm-folded-body">
      <LlmOutputBody
        data={outputData || data}
        outputNodeId={downstreamOutputNode?.id}
        capabilityNodeId={nodeId}
        sourceCapability={data?.capability}
      />
    </div>
  )
}

export default memo(LlmFoldedCard)
