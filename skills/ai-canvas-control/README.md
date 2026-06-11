# ai-canvas-control — Agent 技能

一个 **Agent 技能（skill）**：让用户的 agent（Claude Code / Codex 等）通过 [`canvas4me-mcp`](../../bridge/) 中继桥操控浏览器里的 AI Canvas。

**安装**：`npx skills add cookaihq/canvas4me`（技能随画布仓一起分发）。

**核心配置**（`config.json`，本地文件，从 [`config.example.json`](config.example.json) 复制创建）：默认连**本地桥**还是**线上桥**；选线上填一个 **`baseUrl`**。

> 配套：桥 = 本仓 [`bridge/`](../../bridge/)；画布 = 本仓画布应用。详见 [`SKILL.md`](SKILL.md) 与 [`docs/design.md`](docs/design.md)。
