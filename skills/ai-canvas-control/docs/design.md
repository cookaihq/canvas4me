# ai-canvas-control 技能 — 设计草案

**状态**: 草案 v0（seed，2026-06-10 起草；技能现随画布仓 `skills/` 分发）
**配套**: 桥 = 本仓 [`bridge/`](../../../bridge/)；画布 = 本仓画布应用

## 1. 它是什么

一个装进用户 agent 的**技能**：把「经 `canvas4me-mcp` 操控 AI Canvas」打包好——含**连哪个桥的配置**（本地 / 线上 + baseUrl）+ **用法指引**（怎么用画布工具）。

## 2. 核心配置

`config.json`（本地文件，从 `config.example.json` 复制创建）：
- `mode: "local" | "online"` —— 默认连本地桥还是线上桥。
- `baseUrl` —— `online` 时的桥地址（如 `https://bridge.example.com`）。

## 3. 「本地且没启动」怎么办（自启动）

- **online**：无需启动，连 `baseUrl`。
- **local / stdio 形态**：MCP 客户端自己拉起，无「没启动」状态。
- **local / 常驻形态且未运行**：技能可指示 agent **检测端口未通 → 后台拉起（`npx … serve &`）→ 等就绪**。
  - **鸡生蛋待解**：画布工具来自桥（MCP server），桥晚启后客户端要**重连**才拿得到工具。自启动须配合「客户端重连 / 重载 MCP」——具体机制待设计（见桥 [`design.md`](../../../bridge/docs/design.md) §2.1）。

## 4. 待设计

- **打包形态**：纯 Agent Skill（`SKILL.md`）？还是 Claude Code 插件（顺带 bundle 一份 MCP server 配置）？后者能把「连哪个桥」直接写进 MCP 配置，更省事。
- **配置怎么接到 MCP 连接**：`config.json` 的 local / online + baseUrl，如何落成 MCP 客户端实际连的端点（stdio 命令 / 本地 URL / 远程 URL）。
- **自启动 + MCP 重连**：见 §3 的鸡生蛋。
- **配对码流转**：画布出码 → 用户 / agent 带码连桥（桥契约，见桥 [`design.md`](../../../bridge/docs/design.md) §3）。

## 5. MVP 定档（自治实现范围）

- **形态**：Agent Skill（`SKILL.md` + `config.json`）。
- 本期**只做 / 只测 local 模式**（online 需远程桥 = 在线化阶段（桥 server 模式）的事，`baseUrl` 字段留着但不 e2e）。
- local 用 **stdio**（MCP 客户端自动拉起本地桥）——**不需要 auto-start**（常驻 + 自启动归在线化阶段，见桥 [`design.md`](../../../bridge/docs/design.md) §2.1）。
- `SKILL.md` 必写：节点类型（content/ability/group）概览 + 标准流程（**先 `list_capabilities` 发现能造什么 + 参数** → `open_project`/`create_project` → `acquire_edit_lock` → 建/连/`set_params` → `run_node`/`get_result` → `focus_node`）。
- **自动测**：`config.json` 合法、`SKILL.md` frontmatter 合法。**唯一留给用户**（真·Claude-Code-做不了）：真 agent 读技能驱动画布（需真 MCP 客户端）。

## 参考

- 桥设计草案：[`../../../bridge/docs/design.md`](../../../bridge/docs/design.md)
- 画布工具语义：见 [`SKILL.md`](../SKILL.md) 工具全集
