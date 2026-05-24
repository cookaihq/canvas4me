/**
 * LLM 输出节点的正文渲染体 —— 4 个 mode 的 OutputNode 共用此组件
 *
 * 行为(对应 docs/ui-standards 节点 3 状态):
 *   - running/polling 且 text 空 : reasoning 折叠(可选) + 灰底 preview 居中 "等待输出..."
 *   - running/polling 且 text 有 : reasoning 折叠(可选) + 灰底 preview 流式 markdown + 闪烁光标
 *   - done                       : 最终 markdown (donebody 独立可滚区)
 *   - done 但 text 空            : "模型仅产生了思考过程，未输出正文" (thinking 模型常见)
 *   - error                      : FailedCard
 *
 * 节点本体不带头部条、不带底部 footer——模型名/运行状态/tokens 全部交给上方
 * NodeMetaRow (名称 + 右侧 elapsed chip 或 tokens info) 承载。
 *
 * 复用画布全局 LLM 样式 .renderer-llm-context / .llm-output-* (src/canvas/styles.css)。
 */
import { memo, useRef, useState } from 'react'
import { ChevronRight, ChevronDown } from '@/canvas/icons'
import { Streamdown } from 'streamdown'
import useStickToBottom from '@/canvas/hooks/useStickToBottom'
import useCanvasPanThrough from '@/canvas/hooks/useCanvasPanThrough'
import FailedCard from '@/canvas/components/FailedCard'
import { getCapabilityErrorSummary } from '@/canvas/utils/errorFormatter'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'

/**
 * LLM 输出体
 *
 * Props:
 *   - data                  : 输出节点 data (含 content.text / runStatus / error 等)
 *   - outputNodeId          : 输出节点 id (用于 reconnectStream; 折叠场景为下游 outputNode.id)
 *   - capabilityNodeId      : 上游能力节点 id (折叠卡片场景由 _shared.jsx 透传)
 *   - sourceCapability      : capability id (折叠场景透传; 不传则回退到 data.sourceCapability)
 *
 * Failed 分支用 FailedCard:
 *   - 重连 = 调 CapabilityRuntimeContext.reconnectStream(outputNodeId) — 查任务状态, 不消耗配额
 *   - 重试 = 调 CapabilityRuntimeContext.runCapability(capabilityNodeId) — 从头跑整个能力
 *   只在节点持有 taskId 时才显示"重连"按钮(没 taskId 说明任务还没提交,无可重连)
 */
function LlmOutputBody({ data, outputNodeId, capabilityNodeId, sourceCapability }) {
  const text = data.content?.text || ''
  const reasoningStream = data.content?.reasoning_stream || ''
  const error = data.content?.error
  // 优先用 content.rawError (完整原始对象, ErrorLogModal 显示完整 JSON),
  // 没有时回退到 content.error (预拼字符串, 兼容老画布数据)
  const rawError = data.content?.rawError ?? error
  const status = data.runStatus
  const isStreaming = status === 'running' || status === 'polling'
  const isDone = status === 'done'
  const isRunning = status === 'running'

  const { runCapability, reconnectStream } = useCapabilityRuntime()
  const capId = sourceCapability || data?.sourceCapability || 'llm'
  const hasTaskId = Boolean(data?.taskId || data?.extraTaskId || data?.realTaskId)

  const previewRef = useRef(null)
  useStickToBottom(previewRef, text, isStreaming)
  // done 态正文容器: 内容溢出可滚, 接入画布滚轮穿透契约(UX_SPEC §9.9)
  const doneBodyRef = useCanvasPanThrough()

  const [reasoningOpen, setReasoningOpen] = useState(true)
  // reasoning 区域只在运行中显示;运行结束后(content 已被 onDone 清空 reasoning_stream)自然消失

  if (error) {
    const summary = getCapabilityErrorSummary(capId, rawError)
    const onRetry = capabilityNodeId
      ? () => runCapability?.(capabilityNodeId, 1)
      : undefined
    const onReconnect = (outputNodeId && hasTaskId)
      ? () => reconnectStream?.(outputNodeId)
      : undefined
    return (
      <div className="renderer-llm-context renderer-llm-error">
        <FailedCard
          summary={summary}
          rawError={rawError}
          onRetry={onRetry}
          onReconnect={onReconnect}
        />
      </div>
    )
  }

  if (!isDone) {
    return (
      <div className="renderer-llm-context llm-output-processing">
        {reasoningStream && (
          <div className="llm-output-reasoning">
            <button
              type="button"
              className="llm-output-reasoning-head nodrag"
              onClick={() => setReasoningOpen(v => !v)}
            >
              {reasoningOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>思考中…</span>
            </button>
            {reasoningOpen && (
              <div className="llm-output-reasoning-body">
                {reasoningStream}
              </div>
            )}
          </div>
        )}
        <div
          className={`llm-output-processing-preview${text ? '' : ' is-waiting'}`}
          ref={previewRef}
        >
          {text ? (
            <>
              <div className="llm-markdown llm-markdown-compact">
                <Streamdown mode="streaming" parseIncompleteMarkdown animated={false}>
                  {text}
                </Streamdown>
              </div>
              {isRunning && <span className="renderer-llm-cursor" />}
            </>
          ) : (
            <span className="renderer-placeholder">等待输出...</span>
          )}
        </div>
      </div>
    )
  }

  // done
  const emptyOutput = !text.trim()
  return (
    <div className="renderer-llm-context llm-output-done">
      <div className="llm-output-done-body" ref={doneBodyRef}>
        {emptyOutput ? (
          <span className="renderer-placeholder">模型仅产生了思考过程，未输出正文</span>
        ) : (
          <div className="llm-markdown llm-markdown-compact llm-output-done-text">
            <Streamdown mode="static" animated={false}>{text}</Streamdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(LlmOutputBody)
