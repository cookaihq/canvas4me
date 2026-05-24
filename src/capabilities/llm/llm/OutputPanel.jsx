/**
 * llm 输出面板 —— text 输出节点的右侧详情面板。
 *
 * 结构:
 *   - Markdown 正文(完整、可滚动,Streamdown)
 *   - 底部 usage 信息(prompt / completion / total tokens)
 *   - Regenerate 按钮(触发上游能力节点 rerun)
 *
 * 不再提供"继续对话"按钮(本 capability 是单轮 LLM,无 messagesSnapshot)。
 */
import { useCallback } from 'react'
import { Button } from 'antd'
import { RotateCw } from '@/canvas/icons'
import { Streamdown } from 'streamdown'

export default function LlmOutputPanel({ node, onRerun }) {
  const { runStatus } = node.data || {}
  const sourceCapabilityId = node.data?.sourceCapabilityId ?? node.data?.sourceAbilityId
  const text = node.data?.content?.text || ''
  const error = node.data?.content?.error
  const usage = node.data?.usage

  const handleRerun = useCallback(() => {
    if (sourceCapabilityId && onRerun) onRerun(sourceCapabilityId)
  }, [sourceCapabilityId, onRerun])

  const isBusy = runStatus === 'running' || runStatus === 'polling'

  return (
    <div className="panel-output llm-response-panel">
      <div className="panel-output-content">
        {error ? (
          <div className="llm-panel-error">{error}</div>
        ) : text ? (
          <div className="llm-markdown llm-panel-markdown">
            <Streamdown mode="static" animated={false}>{text}</Streamdown>
          </div>
        ) : (
          <div className="llm-panel-empty">
            {runStatus === 'done' ? '模型仅产生了思考过程，未输出正文' : '等待输出...'}
          </div>
        )}
      </div>

      {usage && (
        <div className="llm-panel-usage">
          <span>prompt: {usage.prompt_tokens ?? '—'}</span>
          <span>completion: {usage.completion_tokens ?? '—'}</span>
          <span>total: {usage.total_tokens ?? '—'}</span>
        </div>
      )}

      <div className="llm-response-actions">
        <Button
          icon={<RotateCw size={14} />}
          onClick={handleRerun}
          disabled={!sourceCapabilityId || isBusy}
          block
        >
          Regenerate
        </Button>
      </div>
    </div>
  )
}
