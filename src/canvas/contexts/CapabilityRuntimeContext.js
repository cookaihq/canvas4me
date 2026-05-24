import { createContext, useContext } from 'react'

/**
 * 暴露给能力节点 / 输出节点组件的运行时能力。
 *
 * 字段:
 * - retryTransfer(localId): 手动触发转存重试（供输出节点在超过自动重试上限后使用）
 *   实现：调 POST /api/apps/ai-canvas/v1/tasks/{task_id}/retry-transfer，
 *        成功后把任务重新加入轮询队列。
 * - runCapability(nodeId, runCount?): 重新触发能力节点运行(Failed 卡片的"重试"按钮调用)
 *   等价于在 DockedPanel 上点 Run, 走 useRunCapability.run(nodeId, runCount)。
 *   Done 态会派生新节点; Ready/Failed 态原地重跑。
 * - reconnectStream(outputNodeId): 流式接口断线后的"重连"动作。
 *   查 task 状态后按结果分发: 已完成→直接写 done; 仍在跑+有 stream_url→重启 SSE;
 *   真失败→更新真实 error。不重跑 capability、不消耗额外配额。
 */
export const CapabilityRuntimeContext = createContext({
  retryTransfer: () => Promise.resolve(),
  runCapability: () => {},
  reconnectStream: () => Promise.resolve(),
})

export function useCapabilityRuntime() {
  return useContext(CapabilityRuntimeContext)
}
