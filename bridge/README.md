# canvas4me-mcp

AI Canvas 的 **MCP 中继桥**：让外部 MCP 客户端（Claude Code / Codex 等）操控**跑在浏览器里的画布**。

浏览器页面**向外连**这座桥，MCP 客户端也连这座桥，桥在中间**转发**「工具调用 ⇄ 结果」。真正干活的是浏览器里的页面（执行器），**桥只转发、不碰业务数据**——工具由页面连上时动态声明，桥不硬编任何业务工具。

## 接入（MCP 客户端配置）

```jsonc
// .mcp.json / claude_desktop_config.json
{
  "mcpServers": {
    "canvas4me": {
      "command": "npx",
      "args": ["canvas4me-mcp"]
    }
  }
}
```

仓内开发未发包时等价写法：`"command": "node", "args": ["<repo>/bridge/src/node/index.mjs"]`。

配套 Agent 技能（教 agent 画布工具怎么用）：`npx skills add cookaihq/canvas4me`。

## 部署模式（同一份代码）

| 模式 | 桥跑在哪 | 对 agent | 适合 |
|---|---|---|---|
| 本地（stdio）**（已实现）** | 用户本机，MCP 客户端自动拉起 | stdio | 纯本地 / 断网 / 零信任：一切留本机 |
| 自托管 | 用户自己的服务器 | 远程（Streamable HTTP）+ wss | 要掌控、免装本地 |
| 公共托管 | 一份公开实例 | 远程 + wss | 零安装：连地址 + 贴配对码 |
| Serverless | Cloudflare Workers + Durable Objects | 远程 + wss | 个人零成本自托管 |

## 当前状态

本地 stdio 模式**已实现**（`src/node/index.mjs`）：

- stdio MCP server（对 MCP 客户端）+ localhost WS server（端口 7777，对页面）。
- **认第一个连上的 tab、拒后来者**；无配对码、无鉴权（本地单用户）。
- **工具声明握手**：页面连上后发 `{type:'hello',tools:[...]}` 声明自己支持哪些工具（带 JSON Schema），桥据此**动态注册**到 MCP server。
- 每个工具 = 纯转发：调用即 `{type:'call',callId,tool,args}` ⇄ `{type:'result'|'error',...}`，30s 超时；tab 回 `error` → MCP `isError` 透传。
- 日志全走 stderr，stdout 保持 MCP 协议干净。

未做（在线化阶段）：Streamable HTTP / 远程 / 公共托管 / Serverless、配对码、鉴权——见 [`docs/design.md`](docs/design.md) §5。

```bash
npm install
npm start   # node src/node/index.mjs
```

## Security / Limitations

The MVP bridge does **not** check `Origin` or require an auth token. Because browsers do not enforce CORS on WebSocket upgrades, any page open in the same browser can connect to `ws://localhost:7777` and act as "the tab". This is acceptable for local, single-user use — close other browser tabs in trust-sensitive contexts. Any non-loopback or shared deployment **must** add a handshake token and Origin allowlist before exposure.
