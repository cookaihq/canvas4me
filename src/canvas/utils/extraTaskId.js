/**
 * 生成前端任务别名 extra_task_id
 *
 * 用途：AI Canvas 乐观提交场景下，前端点"运行"后立即创建输出节点、
 * 后台异步提交 submit 接口。需要在 submit 前就能确定任务的查询 ID，
 * 因此前端生成一个全局唯一的 `extra_task_id` 作为任务别名，
 * 后端接口会把它存进 tasks.extra_task_id 字段，后续可用它查询任务状态。
 *
 * 格式：`cvs-{base36 时间戳}-{12 位随机 hex}`
 * 示例：`cvs-lxqv0k5-8a3f2b1c9e7d`
 *
 * 约束：
 * - 后端 extra_task_id 字段最大 128 字符，当前格式总长约 22 字符
 * - 冲突概率极低（48 bit 随机 + 时间戳）
 * - 若后端返回 409，说明生成规则有 bug，应该上报错误而非无限重试
 */
export function generateExtraTaskId() {
  const ts = Date.now().toString(36)
  let rand = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(6)
    crypto.getRandomValues(buf)
    rand = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
  } else {
    rand = Math.random().toString(16).slice(2, 14).padStart(12, '0')
  }
  return `cvs-${ts}-${rand}`
}
