---
name: ai-canvas-control
description: 用对话操控浏览器里的 AI Canvas（看画布、加节点、连线、填参数、跑、取结果、分组、镜头跟随）。当用户想让 agent 帮忙在画布上搭建或运行 AI 生成流水线时使用。
---

# 操控 AI Canvas（经 canvas4me-mcp）

本技能让你通过 `canvas4me-mcp`（MCP 中继桥）提供的工具，操控用户**正打开的 AI Canvas 画布 tab**。

---

## 1. 节点类型概览

AI Canvas 的画布由三种节点构成：

| 类型 | 说明 | 端口 |
|------|------|------|
| **content** | 素材节点（subType: `image` / `video` / `audio` / `text` / `file`）；放置已有内容作为输入源 | 只有右侧输出端口 |
| **ability** | AI 能力节点（nodeType: `image` / `video` / `sound` / `llm` + capability + mode）；接收输入、运行模型、输出结果 | 左侧输入 + 右侧输出 |
| **group** | 视觉分组，把相关节点框在一起方便管理 | 无端口 |

节点之间通过**端口**连线（`connect`）。端口 id 从 `list_canvas` 的响应里读，不要猜测。

---

## 2. 工具全集

### 能力发现

| 工具 | 签名 | 说明 |
|------|------|------|
| `list_capabilities` | `list_capabilities()` | 列出全部 nodeType + 能力：id / 说明 / modes / 参数 schema / 端口。**开始任何任务必须先调用一次**，用它发现能做什么、参数叫什么。 |
| `get_capability` | `get_capability(id)` | 单个能力的全量信息（参数 schema + 端口定义），list_capabilities 返回后按需下钻。 |

### 项目层

| 工具 | 签名 | 说明 |
|------|------|------|
| `list_projects` | `list_projects()` | 列出用户全部项目（id / name）。 |
| `open_project` | `open_project(id)` | 切换到指定项目，画布加载该项目数据。 |
| `create_project` | `create_project(name)` | 新建项目并切换进去。 |

### 画布读

| 工具 | 签名 | 说明 |
|------|------|------|
| `list_canvas` | `list_canvas([detail])` | 完整画布地图：节点 + 端口 + 连线 + 分组 + 运行态。`detail:'full'` 时额外包含参数与内容。**connect 前必须先调用此工具获取真实端口 id。** |
| `get_node` | `get_node(nodeId)` | 单节点全量下钻（参数、内容、端口、运行状态）。 |

### 编辑权限

| 工具 | 说明 |
|------|------|
| `acquire_edit_lock` | 获取画布编辑锁。**修改画布前必须先持锁**；工具若报"需要锁"，先调此工具再重试。 |
| `release_edit_lock` | 释放编辑锁。任务结束后释放，让用户可手动编辑。 |

### 节点 / 边写

| 工具 | 签名 | 说明 |
|------|------|------|
| `add_node` | `add_node(kind, {subType?, nodeType?, capability?, mode?, content?, position?})` | 新建节点。`kind:'content'` 需 `subType`，素材内容在**同一次调用的 `content` 字段内联给出**（image/video/audio/file → `content:{url}`，text → `content:{text}`），**不用 set_params**；`kind:'ability'` 需 `nodeType + capability`，可选 `mode`；`position` 不传则自动布局。`mode` 默认取该能力的 `defaultMode`；**当你需要某个具体 mode（如图生视频），必须在 `add_node` 时传 `mode`** —— 用 `list_capabilities`/`get_capability` 查该能力有哪些 mode + 各自的端口，别依赖 defaultMode。 |
| `connect` | `connect(source, target, sourceHandle?, targetHandle?)` | 连接两个节点的端口。端口 id 从 `list_canvas` 读，不要推测。 |
| `set_params` | `set_params(nodeId, params)` | 设置节点参数（如 prompt、model、seed 等）。参数名从 `list_capabilities` / `get_capability` 的 schema 中读取。**文本驱动能力（llm、gpt-image-2 等）：** 连接文本边不会自动填入 prompt，必须在 prompt 参数中写占位符 `{{ai-canvas:edge:<sourceOutputNodeId>}}`，其中 `sourceOutputNodeId` 是 `list_canvas` 里该边 `source` 字段的值（折叠能力节点的 `source` 是其输出节点 id，用 `get_result` 的 `resultNodeId` 字段也可取到）。媒体边（图片 → 视频等）走端口直接传递，**不需要**占位符。 |
| `update_node` | `update_node(nodeId, {name?, position?, color?, delete?})` | 改节点名称、位置、颜色，或 `delete:true` 删除节点。 |

### 分组

| 工具 | 签名 | 说明 |
|------|------|------|
| `group_nodes` | `group_nodes(nodeIds, name?)` | 把指定节点框进一个 group。 |
| `ungroup` | `ungroup(groupId)` | 解散 group，节点保留在画布上。 |

### 运行

| 工具 | 签名 | 说明 |
|------|------|------|
| `run_node` | `run_node(nodeId)` | **取号式**：立刻回 `{nodeId, status:'running'}`，生成在后台进行，不等完成。 |
| `get_result` | `get_result(nodeId)` | 查结果：`status:'running'` 表示还在跑，等几秒再问；`status:'done'` 带 `content`；`status:'error'` 带错误信息。图片 / 视频生成可能需要数分钟，要有耐心轮询。 |

### 视图

| 工具 | 签名 | 说明 |
|------|------|------|
| `focus_node` | `focus_node(nodeId)` | 把画布镜头平滑移到该节点，让用户看到正在操作的位置。重要操作前后都可调用。 |

---

## 3. 标准流程（端到端食谱）

拿到用户目标后，按以下顺序执行：

```
1. list_capabilities
   → 发现有哪些能力、能力 id、参数名、端口名
   → 不跳过此步，否则你不知道 capability 叫什么

2. list_projects → open_project(id) 或 create_project(name)
   → 确保有当前项目；用户没指定时询问或新建

3. acquire_edit_lock
   → 持锁才能写；工具报"需要锁"就先调此工具

4. add_node(s)
   → 根据任务建 content 节点（素材）和 ability 节点（能力）
   → position 不用传，画布自动布局

5. list_canvas
   → 读取真实端口 id（sourceHandle / targetHandle）

6. connect(source, target, sourceHandle, targetHandle)
   → 按端口 id 连线；connect 前先 list_canvas

7. set_params(nodeId, params)
   → 按 list_capabilities 拿到的 schema 填参数（prompt、model 等）

8. run_node(nodeId)
   → 取号启动，立即返回 running

9. 轮询 get_result(nodeId)
   → running：等 5–10 秒再调一次
   → done：取 content，流程结束
   → error：向用户报错，询问如何处理

10. focus_node(nodeId)
    → 镜头对准结果节点，用户可看到输出

11. release_edit_lock
    → 释放锁，用户可手动继续编辑
```

---

## 4. 关键约束与注意事项

### 必须先发现，不要猜

**永远从 `list_capabilities` 开始**，用它获得能力 id、参数名、端口名。能力名称和参数字段名来自画布运行时声明，不要凭训练记忆猜测。

### 锁的规则

- 改节点 / 边 / 参数前必须持有编辑锁（`acquire_edit_lock`）。
- 只读操作（`list_canvas`、`get_node`、`get_result`）不需要锁。
- 任务完成后调 `release_edit_lock` 还锁。
- 若工具返回"锁冲突"，说明用户正在手动编辑，等待或询问用户。

### 连线必须用真实端口 id

`connect` 的 `sourceHandle` / `targetHandle` 来自 `list_canvas` 响应中的端口定义，不要推测或使用默认值。

### 运行是异步的

`run_node` 立即返回，`get_result` 可能要轮询数分钟。每次收到 `running` 就等一段时间再问，不要连续轰炸。

### 文本提示词怎么喂（占位符机制）

把文本节点用边连到能力节点，**不会自动把文本内容塞进 prompt 参数**。要让文本内容生效，必须在 `set_params` 里显式写占位符：

```
set_params(abilityNodeId, {
  prompt: '{{ai-canvas:edge:<sourceOutputNodeId>}}'
})
```

- `sourceOutputNodeId` = `list_canvas` 中该边 `source` 字段的值。
- 如果来源是一个折叠的能力节点，画布会把边自动代理到该能力的下游输出节点，因此 `source` 会显示输出节点的 id，而非能力节点本身的 id；`get_result` 的 `resultNodeId` 字段也可用来取这个 id。
- 占位符可以和其它文本混用，例如 `'请将以下内容改写为正式风格：{{ai-canvas:edge:abc123}}'`。
- 媒体边（图片 → 视频、音频 → 能力等）**走端口直接传递，不需要占位符**，只需正确连线即可。

### 画布只接受远端 URL

画布存储只接受 `http(s)://` 链接，不接受 `base64:` / `blob:` / 本地路径。如果用户想放本地文件，需要先上传获得 URL 再 `add_node`。

### 让用户看见你在做什么

操作重要节点前后用 `focus_node` 把镜头移过去，让用户实时看到 agent 在操作哪里。

---

## 5. 常见场景速查

### 场景：文生图

```
list_capabilities → 找 image 类 capability（如 gpt-image-2）
create_project("我的图片项目") 或 open_project(id)
acquire_edit_lock
add_node('ability', {nodeType:'image', capability:'gpt-image-2'})
set_params(nodeId, {prompt:'一只橙色的猫坐在月亮上'})
run_node(nodeId)
轮询 get_result → done
focus_node(nodeId)
release_edit_lock
```

### 场景：图生视频

**重要**：大多数视频能力同时支持文生视频和图生视频两种 mode，`defaultMode` 通常是文生视频（无图片输入端口）。**必须在 `add_node` 时传 `mode`**，否则后续 `connect` 的目标端口不存在。先用 `list_capabilities`/`get_capability` 确认该 mode 下的图片输入端口名，再连线。

以下示例使用 `seedance-2` 的 `image-to-video` mode，经验证其图片输入端口为 `start_image`：

```
list_capabilities → 找 video 类 capability，查看各 mode 及其端口
list_projects → open_project(id) 或 create_project("我的视频项目")
acquire_edit_lock
// content 节点的素材 URL 在 add_node 的 content 字段里内联给出，不走 set_params
add_node('content', {subType:'image', content:{url:'https://example.com/photo.jpg'}})
list_canvas  // 读端口 id
// 必须在 add_node 时指定 mode，不能之后再改
add_node('ability', {nodeType:'video', capability:'seedance-2', mode:'image-to-video'})
list_canvas  // 重新读，获取视频节点的真实端口 id
connect(imageNodeId, videoNodeId, imageOutputHandle, 'start_image')
set_params(videoNodeId, {prompt:'镜头缓缓拉远'})
run_node(videoNodeId)
轮询 get_result → done（视频生成可能需 2–5 分钟）
focus_node(videoNodeId)
release_edit_lock
```

> **注意**：`set_params` 中的 `mode` 字段只是表单参数，**不会切换节点的 mode**。节点 mode 只能在 `add_node` 时设定，建立之后不可更改。

### 场景：文本节点驱动 LLM 改写

此场景演示占位符机制：文本节点连到 LLM 能力节点后，prompt 里必须写占位符才能引用文本内容。

```
list_capabilities → 找 llm 类 capability（如 gpt-4o）
open_project(id) 或 create_project("改写任务")
acquire_edit_lock
add_node('content', {subType:'text', content:{text:'待改写的原文内容'}})
add_node('ability', {nodeType:'llm', capability:'gpt-4o'})
list_canvas  // 读端口 id，同时记下文本节点的 id（textNodeId）
connect(textNodeId, llmNodeId, textOutputHandle, textInputHandle)
// 用占位符引用文本节点内容；textNodeId 来自 list_canvas 中该边的 source
set_params(llmNodeId, {prompt:'请将以下内容改写为正式风格：{{ai-canvas:edge:<textNodeId>}}'})
run_node(llmNodeId)
轮询 get_result → done
focus_node(llmNodeId)
release_edit_lock
```

> **提示**：`textNodeId` 是 `list_canvas` 中连线 `source` 的值（文本 content 节点直接就是输出节点）。若来源是折叠的能力节点，`source` 显示其下游输出节点 id，与 `get_result` 返回的 `resultNodeId` 一致。

### 场景：查看当前画布再决策

```
list_canvas({detail:'full'})
// 读懂节点结构、连线、参数、运行状态
// 再决定下一步
```
