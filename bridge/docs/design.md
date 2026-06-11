# canvas4me-mcp（中继桥）— 设计草案

**状态**: 草案 v0（seed）
**日期**: 2026-06-10
**来源**: 画布侧 MCP 操控设计讨论（角色、部署、契约的决策沉淀）

> 本文只搬**已确定**的部分（角色、部署、契约、原则）。桥的**内部实现**（传输、托管、鉴权、防滥用、协议细化）尚未设计，集中列在 §5「待设计」，留待单独 brainstorm。

## 1. 角色：只转发的中继

- 一端对 **MCP 客户端**（Claude Code / Codex…）说 MCP，宣布「我有这些工具」。
- 一端对**浏览器页面**开 WebSocket，转发工具调用、收回结果。
- **桥从不碰业务数据**：真正干活的是浏览器页面里的「执行器」（调页面自己的 API）。桥是传声筒。
- 浏览器页面**只能向外连**（不能被连入），所以页面**主动连**桥；桥必须是页面够得到的端点。

## 2. 三种部署（同一份代码）

| 模式 | 桥跑在哪 | 对 agent 接法 | 谁用 |
|---|---|---|---|
| 本地 | 用户本机 | stdio 或本地 URL（见 §2.1） | 纯本地 / 断网 / 零信任：命令全留本机 |
| 自托管 server | 用户自己的服务器 | 远程（Streamable HTTP）+ wss | 要掌控、免装本地 |
| 公共托管 | 一份公开实例 | 远程 + wss | 零安装：连地址 + 贴配对码 |

**可达性要点**：页面**向外连**桥（本地连本地、任意页连远程）都通；唯一不通的是「公网 https 页**伸进** localhost」（Safari 拦 + Chrome Local Network Access 权限闸，2025-10 起）——而三种模式都不走那个方向。所以**自托管/公共桥对所有页面通用**；本地桥只服务本地页。

### 2.1 本地模式：分发 vs 生命周期是两个独立的轴，三种运行形态

**别把两个轴搅一起：**
- **分发 / 启动**：npx（Node）/ 单二进制 / uvx / docker —— 怎么把桥跑起来；任一种都能用于下面任一形态。
- **生命周期 + 客户端怎么连**（这个才决定常驻不常驻）：
  - **stdio**：MCP 客户端**自己 spawn** 桥、用管道通信 → 桥的命 = 这次会话；stdio **只能连客户端自己拉起的子进程**，连不上一个已在后台跑的进程。**stdio ⟹ 随会话生灭、常驻不了。**
  - **本地 URL（HTTP）**：你**自己把桥跑成常驻**，客户端连 `http://localhost:PORT`。**这才是常驻。**

> npx 不是「只能临时」——`npx pkg` 给客户端 stdio 拉起，或 `npx pkg serve` 自己跑成常驻，两个轴它都能用。「常驻」由**连法（本地 URL）**决定，不是由 npx 决定。

| 形态 | 怎么跑 | 客户端怎么连 | 常驻 | WS 端口 | 「没启动」自启动 |
|---|---|---|---|---|---|
| **stdio 临时** | 客户端配一行命令（npx/二进制）自动拉起 | stdio | 否，随会话生灭 | 绑会话、多实例抢 | **天然**——客户端每次自己拉起，没有「没启动」这回事 |
| **本地 URL 常驻** | 你起一次（`npx … serve` / 二进制 / 做成服务） | `http://localhost:PORT` | 是 | 独占、多 tab 稳 | 要靠外力（技能/agent 检测端口→拉起，见下） |
| **shim 混合** | 客户端 stdio 拉起极薄 shim → 转发到常驻 daemon | stdio（到 shim） | daemon 常驻 | daemon 独占 | shim 那一拉可顺手代启 daemon |

**「桥没启动能不能自启动」**：
- **stdio 形态**根本不需要——客户端每次自己拉起，不存在「没启动」。
- **常驻形态**才有「没在跑」：可由**技能 / agent 检测端口未通 → 后台拉起（`npx … serve &`）→ 等就绪**。但有个**鸡生蛋**：画布**工具来自桥（MCP server）**，桥晚启后 MCP 客户端要**重连**才拿得到工具——所以自启动得配合「客户端重连 / 重载 MCP」。
- **结论**：要「永远不用操心启动」，用 **stdio 形态**最省；要常驻又自启动，走「检测→拉起→客户端重连」，或用 shim 让客户端那一拉顺手把 daemon 带起来。

## 3. 页面 ↔ 桥 契约（唯一接缝）

桥与「使用它的 web 应用」之间一份**稳定、带版本**的契约：

- **配对握手**：页面出一次性配对码 → agent 侧带码连桥 → 桥把这条 agent 会话与这张页面 tab 绑定。
- **工具声明**：页面 tab 配对时**声明自己支持哪些工具**（name + JSON schema）→ 桥据此对 MCP 客户端暴露。**桥不硬编任何业务工具**（这是它通用、可复用的关键）。
- **命令 / 结果信封**：`{tool, args, callId}` ⇄ `{callId, result}` 的转发壳。

## 4. 原则：瞎转发 + 可选 E2E

- 桥**只转信封、不解析工具语义**。好处：① 通用——任何 web 应用都能接；② 连公共实例也不「理解」用户操作（隐私）；③ 工具定义留在使用方、归属正确。
- 可选两端 E2E 加密：除连接元数据外都对桥不可见。

## 5. 待设计（未定，留待单独 brainstorm）

- **传输实现**：stdio（本地）、Streamable HTTP（远程 MCP）、WS（到页面）三套怎么落地、怎么共用一份核心。
- **配对 / 绑定细节**：配对码生命周期；一次只控一张 tab；tab 断开 → 会话迁移 / 自动重连。
- **鉴权插件**：none（本地）/ token / 接入方 SSO（如团队登录）——做成可插拔。
- **公共实例**：托管、扩容、防滥用 / 限流、封禁。
- **协议规范 + 版本化**：契约的线上格式（消息类型、错误码、版本协商）。
- **安全**：本地模式校验 Origin / 一次性 token；远程模式鉴权 + 防 CSRF。

## 6. MVP 定档（自治实现范围）

本期 = 把 spike 桥养成正式版，**只做本地 stdio 模式**：
- **传输**：stdio（对 MCP 客户端）+ localhost WS（对画布 tab），端口固定。**不做** Streamable HTTP / 远程 / 公共托管（在线化阶段）。
- **绑定**：**认第一个连上的 tab**、拒后来者，**无配对码**（在线化阶段）。
- **鉴权**：**无**（本地单用户）。
- **契约**：信封 `{type:'call',callId,tool,args}` ⇄ `{type:'result'|'error',callId,result|error}`；**工具声明握手**（tab 配对时上报它支持哪些工具，桥据此对 agent 暴露，桥不硬编）。前期 spike 已端到端验证此骨架。

### 6.1 已实现（`src/node/index.mjs`）

正式桥已落地，覆盖上面 MVP 全部范围：

- **WS server（7777）**：认第一个 tab、拒后来者；tab 断开清空所有挂起调用。
- **工具声明握手**：收到 `{type:'hello',tools:[{name,description,inputSchema}]}` → 对每个工具 `registerTool` 动态注册；同名工具去重（hello 重发 / 重连不重复注册）。
- **JSON Schema → 入参校验**：`inputSchema` 由页面用 JSON Schema 给，桥转成 SDK `registerTool` 要的扁平 `field→zod` 映射（ZodRawShape）。覆盖 string/number/integer/boolean/object/array + enum + required（非 required → optional）；无法识别的形态回退 `z.any()`，保证「能注册、不丢工具」。
- **纯转发 + 错误透传**：handler = `callTab(name,args)`（30s 超时）；tab 回 `{type:'error'}` → handler 抛 → MCP `isError`。
- **动态注册时序**：启动时先调一次 SDK 的工具处理器初始化（声明 `tools.listChanged` 能力 + 装 list/call 处理器），于是 MCP 客户端在「页面还没连」时调 `listTools()` 返回**空表**而非「Method not found」；页面握手后 `registerTool` 自动发 `notifications/tools/list_changed`，客户端即可感知新工具。
- **stdout 干净**：日志全走 stderr。

验证：临时 mock（连 WS、发 hello 声明工具、应答 result/error）+ MCP client 脚本往返通过（listTools 见到工具、callTool 往返、错误路径浮现为 MCP error），exit 0。

## 参考

- 画布工具语义（使用方、契约对端）：[`skills/ai-canvas-control/SKILL.md`](../../skills/ai-canvas-control/SKILL.md) 工具全集；执行器实现 `src/canvas/agent/`
