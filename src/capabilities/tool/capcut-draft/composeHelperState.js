// src/capabilities/tool/capcut-draft/composeHelperState.js
// 纯函数：把 health 探测流的最新结果 + 外层传入的活跃任务对象 + enabled 开关，
// 合并成单一的 4-type 判别联合 state（喂给 HelperStatusBadge 用）。
//
// 合并优先级（自上而下，命中即返回）：
//   1. !enabled                       → { type: 'scan' }   关闭最高优先级（任何 falsy: false/null/undefined）
//   2. activeTask !== null            → { type: 'task', task: activeTask }   任务流压制 health
//   3. loopResult == null             → { type: 'scan' }   首帧还没回
//   4. loopResult.status === 'offline'→ { type: 'offline' }
//   5. loopResult.status === 'online' → { type: 'health', health: loopResult.health }
//
// 单测见 composeHelperState.test.js，新增 / 修改规则务必同步更新测试用例。
//
// type HelperState =
//   | { type: 'scan' }
//   | { type: 'offline' }
//   | { type: 'health', health: HealthResponse }
//   | { type: 'task',   task:   TaskObject }
export function composeHelperState({ enabled, loopResult, activeTask }) {
  if (!enabled) return { type: 'scan' }
  if (activeTask != null) return { type: 'task', task: activeTask }
  if (loopResult == null) return { type: 'scan' }
  if (loopResult.status === 'offline') return { type: 'offline' }
  if (loopResult.status === 'online') return { type: 'health', health: loopResult.health }
  return { type: 'scan' }   // 兜底（不该发生）
}
