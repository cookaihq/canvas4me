import { createContext } from 'react'

/**
 * NodeActionExtras Context —— 装饰层（如素材库的 "加入素材库" 按钮）通过此 Context
 * 注入额外的节点操作按钮。
 *
 * 值是一个函数: (node, ctx) => ReactNode | null
 *   - node: React Flow 节点对象 (含 id, type, data 等)
 *   - ctx.mediaContext: 由 NodeToolbarPortal 用 resolveMediaContext 解析出的产物描述
 *       { url, mediaType:'image'|'video'|'audio', nodeName?, fileName? } 或 null
 *     — 适用于 output 节点和折叠态媒体能力节点 (它们不在 data.content.url 上直接挂 url)。
 *       装饰层判断"是否可显示按钮"以及"按钮拿什么数据"时优先用这个。
 *   - 返回 ReactNode 表示要在选中态工具栏 (NodeToolbarPortal) 的 actions 段里追加渲染的内容
 *     (已是 React 节点)，返回 null 表示不渲染
 *
 * 默认值是返回 null 的函数，保证未注入装饰层时等价于"不渲染额外按钮"。
 */
export const NodeActionExtrasContext = createContext(() => null)
