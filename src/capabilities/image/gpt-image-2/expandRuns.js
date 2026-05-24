/**
 * GPT Image 2 expandRuns — 把"点一次 Run"拆成 N 次迭代,
 * 让 num_outputs > 1 也能"一张图一个节点".
 *
 * 拆分规则:
 *   - num_outputs ≤ 1: 退化为 runCount 次普通迭代 (每次一个独立 task), 与历史行为一致
 *   - num_outputs > 1: 每个 runCount 是一个 batch (一次 API 调用要 N 张图),
 *     batch 内拆 num_outputs 个迭代, 每个迭代对应一个独立的(能力节点 + 产物节点)对.
 *     同 batch 内的迭代共享一次 API 调用与一个 task_id, 由 useRunCapability 据
 *     iter.taskBatchKey + iter.slotIndex 协调:
 *       - slotIndex === 0  : "primary" 提交 API (num_outputs=N)
 *       - slotIndex >  0  : "passive" 不提交, 共用 primary 的 extraTaskId
 *     轮询返回 N 个 url 后, polling onSuccess 按 slotIndex 把 urls[slotIndex] 写到
 *     对应节点; 取不到则写 content.placeholder=true 显示"未生成"占位.
 */
let counter = 0

export function expandGptImage2Runs({ modeParams = {}, runCount = 1 }) {
  const numOutputs = Math.max(1, modeParams.num_outputs || 1)

  if (numOutputs <= 1) {
    return Array.from({ length: runCount }, () => ({}))
  }

  const baseId = `gi2-batch-${Date.now()}-${counter++}`
  const iterations = []
  for (let r = 0; r < runCount; r++) {
    const batchKey = `${baseId}-${r}`
    for (let i = 0; i < numOutputs; i++) {
      iterations.push({
        taskBatchKey: batchKey,
        slotIndex: i,
        // 给 slot > 0 的节点起个简短名 (#2 / #3 ...) 方便辨认
        nodeName: i === 0 ? undefined : `#${i + 1}`,
      })
    }
  }
  return iterations
}
