/**
 * Seedance 2.0 expandRuns — 见 docs/capabilities/video/seedance-2.md §2.9
 *
 * foxapi /v1/videos/generations 不支持单次返回多视频 (无 n 参数), 所以 ×N 派生通过
 * "原节点 + N-1 个新节点"实现, 每个节点是独立 task / 独立结算积分.
 *
 * 这里返回 runCount 个完全一致的迭代:
 *   - 通用层 (useRunCapability) 拿到 runCount 长度的数组就为 runCount 个独立任务
 *   - 第 1 个迭代落到原节点, 第 2..N 个由通用层派生新节点 (DERIVE_VERTICAL_GAP=80 纵向)
 *   - 每个迭代各自调一次 API, 各自结算积分
 *
 * 不需要 taskBatchKey / slotIndex (那是 gpt-image-2 num_outputs>1 batch 共享 task 的机制,
 * 本能力每次提交都是独立 task).
 */
export function expandSeedance2Runs({ runCount = 1 }) {
  return Array.from({ length: Math.max(1, runCount) }, () => ({}))
}
