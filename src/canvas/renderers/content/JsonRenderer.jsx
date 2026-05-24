import { memo } from 'react'

/**
 * JSON 兜底渲染器 — 折叠树 + 语法高亮
 * 本阶段简化实现，显示 JSON 文本
 */
function JsonRenderer({ data }) {
  const content = data.content?.data || data.content || {}
  const jsonStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  return (
    <div className="renderer-json">
      <pre className="renderer-json-pre">{jsonStr}</pre>
    </div>
  )
}

export default memo(JsonRenderer)
