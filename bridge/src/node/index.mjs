// Node 运行时入口（本地 stdio 模式）：
//   - 对 MCP 客户端：stdio MCP server。工具不硬编 —— 由浏览器页面在握手时声明，桥据此动态注册。
//   - 对浏览器页面：localhost WebSocket server（端口 7777），转发工具调用、收回结果。
//   - 桥只转发，不实现工具逻辑（逻辑在页面里的「执行器」）。
//   转发状态机 / schema 转换 / 结果信封在 ../core/（运行时无关，供后续其他运行时入口共享）。
//
// 日志一律打到 stderr —— stdout 是 MCP 的 stdio 通道，污染会坏协议。

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { WebSocketServer } from 'ws'
import { createRelay } from '../core/relay.js'
import { jsonSchemaToZodRawShape } from '../core/json-schema-to-zod.js'
import { toToolResult } from '../core/tool-result.js'

const WS_PORT = 7777
const CALL_TIMEOUT_MS = 30_000

const log = (...args) => console.error('[bridge]', ...args)

// ── MCP 一侧：stdio server，工具在握手时动态注册 ─────────────────────────────
const server = new McpServer({ name: 'canvas4me-mcp', version: '0.1.0' })

// 已注册工具名集合。同名工具只注册一次（避免 hello 重发 / 重连时重复注册抛错）。
const registeredTools = new Set()

// ── 转发核心（tab 槽位 + 挂起调用表） ─────────────────────────────────────────
const relay = createRelay({
  callTimeoutMs: CALL_TIMEOUT_MS,
  log,
  onToolsDeclared: (tools) => {
    for (const t of tools) {
      registerForwardingTool(t)
    }
  },
})

// 注册一个「纯转发」工具：调用时把 (name, args) 转发给 tab，回包即工具结果。
// 注：registerTool 在 server 已 connect 后调用会自动触发 notifications/tools/list_changed，
// 所以即便 MCP 客户端先连、页面后到，客户端也能感知工具列表变化。
function registerForwardingTool(t) {
  const { name } = t || {}
  if (!name || typeof name !== 'string') {
    log('hello 中有工具缺少 name，跳过:', t)
    return
  }
  if (registeredTools.has(name)) {
    // 同名工具已注册（hello 重发 / 重连），跳过避免 SDK 抛「already registered」。
    // 已知局限：若页面刷新后用同一 name 改了工具的 schema，这里会保留旧注册、
    // 不更新——需重启桥才能让新 schema 生效。
    log('工具已注册，跳过:', name)
    return
  }

  let inputSchema
  try {
    inputSchema = jsonSchemaToZodRawShape(t.inputSchema)
  } catch (err) {
    // Schema conversion failed — fall back to a passthrough object so args are forwarded
    // unchanged to the tab. An empty z.object({}) would strip every key (Zod v4 default);
    // passthrough() keeps unknown keys, preserving the raw args the MCP client sent.
    log(`工具 ${name} 的 inputSchema 转换失败，args 将不经校验直接转发:`, err?.message || err)
    inputSchema = z.object({}).passthrough()
  }

  server.registerTool(
    name,
    {
      description: typeof t.description === 'string' ? t.description : undefined,
      inputSchema,
    },
    async (args) => toToolResult(await relay.callTab(name, args ?? {})),
  )
  registeredTools.add(name)
  log('已注册工具:', name)
}

// ── WS 一侧：只认第一个连上的 tab ───────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT })

wss.on('listening', () => {
  log(`WS listening on ws://localhost:${WS_PORT} (等待页面连接)`)
})

wss.on('error', (err) => {
  log('WS server error:', err?.message || err)
})

// Security note (MVP limitation): the bridge does NOT check Origin or require a token.
// Browsers do not enforce CORS on WebSocket upgrades, so any page open in the same
// browser can connect to ws://localhost:7777 and become "the tab". In local single-user
// use this is acceptable. Any non-loopback or shared deployment MUST add a handshake
// token and Origin allowlist before exposure.
wss.on('connection', (ws) => {
  // attach/detach 必须用同一引用——闭包持有这条 ws 的适配对象。
  const adapter = {
    send: (str) => ws.send(str),
    isOpen: () => ws.readyState === ws.OPEN,
  }
  const accepted = relay.attachTab(adapter)
  if (!accepted) {
    // 只服务第一个 tab，后来者直接拒绝。
    log('已有 tab 连接，拒绝新连接')
    try { ws.close() } catch {}
    return
  }
  log('页面已连接')

  ws.on('message', (raw) => relay.handleMessage(raw))

  ws.on('close', () => {
    log('页面断开')
    relay.detachTab(adapter)
  })

  ws.on('error', (err) => {
    log('tab ws error:', err?.message || err)
  })
})

// ── 启动 ────────────────────────────────────────────────────────────────────
// 工具是动态注册的（页面握手后才知道有哪些）。但若不预先声明 tools 能力 + 装好
// tools/list 请求处理器，MCP 客户端在「还没有页面连上」时调 listTools() 会撞
// 「Method not found」。这里在 connect 前调一次 SDK 自身的 setToolRequestHandlers
// （它幂等、且后续 registerTool 也会调它）：声明 tools.listChanged 能力、装上
// list/call 处理器，于是没有工具时 listTools() 返回空表，之后 registerTool 会自动
// 发 notifications/tools/list_changed 让客户端感知。
// 直接复用 SDK 的初始化例程（而非自己 setRequestHandler）是为了避免与 registerTool
// 内部的同名处理器注册冲突（重复 setRequestHandler 会抛 already exists）。
// 注意：setToolRequestHandlers 在 SDK 的 .d.ts 里标了 private —— 这里依赖它属于
// 触碰内部实现，已对照 SDK 1.29.0 源码核实其行为（幂等、装 list/call 处理器 +
// 声明 tools.listChanged）。升级 SDK 时务必重新核对此方法是否仍在、语义是否一致。
if (typeof server.setToolRequestHandlers === 'function') {
  server.setToolRequestHandlers()
} else {
  // 找不到就直接快速失败：一个抛在启动期的错误会立刻打到 stderr、肉眼可见。
  // 不做「只声明能力但不装处理器」的半残兜底 —— 那会让客户端看到 tools 能力却在
  // 调 listTools 时撞 -32601，比直接失败更糟（晚一步、更难定位）。
  throw new Error('@modelcontextprotocol/sdk 不兼容：未找到 setToolRequestHandlers（请锁定 ^1.29.0）')
}

const transport = new StdioServerTransport()
await server.connect(transport)
log('MCP stdio server 已就绪（等待 MCP 客户端；工具在页面握手后动态注册）')
