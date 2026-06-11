# worker/ — Cloudflare Workers 运行时入口（占位）

在线化阶段的 Serverless 部署入口（Workers + Durable Objects）：

- MCP 一侧：Agents SDK（McpAgent，Streamable HTTP，每会话一个 DO）
- 页面一侧：DO WebSocket（Hibernation API，长连接闲置休眠）
- 转发状态机 / schema 转换 / 结果信封复用 [`../core/`](../core/)

尚未实现。设计见 [`../../docs/design.md`](../../docs/design.md)。
