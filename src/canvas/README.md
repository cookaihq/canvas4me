# canvas4me

类 Figma 的无限画布节点编排应用，可视化 AI 工作流。

## 文档规范

**本应用的文档独立存放在 `src/apps/ai-canvas/docs/` 目录下，不放在项目根目录 `docs/` 下。**

| 文档 | 说明 |
|------|------|
| [docs/archive/design.md](docs/archive/design.md) | 方案设计（架构、交互、存储、技术选型）—— **已归档**，仅历史参考；当前以 [docs/reference/ux-spec.md](docs/reference/ux-spec.md) 为准 |
| [docs/archive/node-catalog.md](docs/archive/node-catalog.md) | 节点目录（所有节点的三级分类、输入输出、后端映射）—— **已归档**，仅历史参考；当前能力清单见根 [README.md](README.md) |
| [docs/reference/media-cache.md](docs/reference/media-cache.md) | 媒体缓存机制（图片/音频/视频的 URL 缓存、按画布管理、容量策略）；新增自定义渲染节点必读 |
| [docs/prototype/](docs/prototype/) | 原型文件（设计稿、交互原型等） |
| [docs/prototype/nodes/](docs/prototype/nodes/) | 各节点的原型文件 |

## 核心架构

### 节点体系

画布上有三种 React Flow 节点类型：

| 类型 | 用途 | 端口 |
|------|------|------|
| `content` | 内容节点（图片/音频/视频/文件/文本等） | 只有右侧输出 |
| `ability` | 能力节点（包装现有应用的 AI 能力） | 左侧输入 + 右侧输出 |

### 能力节点三级结构

```
一级：能力分类（Category）     — 视频/图片/音频/文字
二级：能力类型（Ability Type）  — 视频生成/Nano Banana/语音合成 ...
三级：具体节点（Node）         — Veo 3.1/Sora 2/Speech 2.8 HD ...
```

共 4 个一级分类、11 个能力类型、31 个具体节点。详见 [节点目录](docs/archive/node-catalog.md)（已归档，仅历史参考；当前能力清单见根 [README.md](README.md)）。

### 注册表驱动

`registry/nodeTypes.js` 是能力节点系统的核心，声明所有分类、能力类型、具体节点。驱动：
- 右键菜单自动生成三级结构
- 节点端口根据注册表动态渲染
- 面板按能力 ID 分发

### 渲染器分离

节点壳（Shell）与节点内容（Renderer）分离：
- `ContentNode.jsx` / `CapabilityNode.jsx` — 壳组件，处理 Handle、resize、操作栏
- `renderers/content/*.jsx` — 内容渲染器，每种内容类型独立文件
- `renderers/ability/*.jsx` — 能力渲染器
- `panels/content/*.jsx` / `panels/ability/*.jsx` — 面板，每种类型独立文件

新增节点类型 = 注册表加一条 + 写 Renderer + 写 Panel（按需）。

### 数据持久化

- 一个画布 = 一个 project
- 画布数据存在 `project.extra.canvas`（nodes/edges/viewport）
- 500ms debounce 自动保存
