/**
 * llm capability — 任务结果 → node.data.content 解析器
 *
 * SSE 完成时 canvas/index.jsx 的 onDone 已经把 content.text + usage 写好。
 * 本 resolver 在"轮询拿到最终结果"路径(SSE 未启动 / 未完成前刷新页面)兜底使用。
 *
 * 两版 result 形态:
 *   - 服务端: task.result = { content: "...", usage }
 *   - 直连  : task.result = { results: [<OpenAI ChatCompletion>] } 或 ChatCompletion 本身
 *
 * 归一化为 { type:'text', text, usage? }(usage 可能缺失,留空即可)。
 */
export function resolveLlmContent(result) {
  if (!result) return null

  // 服务端包装:result.content 字符串
  if (typeof result.content === 'string') {
    return { type: 'text', text: result.content, usage: result.usage }
  }

  // 直连 OSS:result.results[0] 是 OpenAI ChatCompletion
  const arr = Array.isArray(result.results) ? result.results : null
  const chat = arr && arr.length > 0 ? arr[0] : result
  const messageContent = chat?.choices?.[0]?.message?.content
  if (typeof messageContent === 'string') {
    return { type: 'text', text: messageContent, usage: chat.usage || result.usage }
  }

  return null
}
