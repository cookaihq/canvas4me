// 把 tab 返回的任意结果包成 MCP 工具结果信封（纯转发，不解析语义）。
export function toToolResult(result) {
  return {
    // JSON.stringify(undefined) === undefined (not a string), which would drop the `text` key
    // from the serialized response and violate the MCP spec (text must be a string).
    content: [{ type: 'text', text: JSON.stringify(result) ?? 'null' }],
    structuredContent: result && typeof result === 'object' ? result : { value: result },
  }
}
