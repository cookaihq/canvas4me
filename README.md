# canvas4me

> 一个跑在浏览器里的 AI 工作流画布——把图像 / 视频 / 音频 / LLM 能力拖出来连起来用。

基于 Vite + React + @xyflow/react 构建，类 Figma 的无限画布节点编排，浏览器本地存储，自带 API Key 直连 [foxapi](https://api.foxapi.cc) 调用各家 AI 能力。

## 它是什么

- **视觉化工作流编辑器**：节点 + 连线表达 prompt → 模型 → 输出的全过程
- **AI 能力节点**：图像生成 / 视频生成 / 语音合成 / 音乐生成 / LLM 等开箱即用
- **浏览器本地存储**：画布数据存 IndexedDB，无需账号，开关浏览器即恢复
- **自带 API Key**：在 SimpleSettings 配 foxapi Bearer token 即可使用
- **Agent 可操控（MCP）**：自带 MCP 中继桥 + Agent 技能，Claude Code / Codex 对话即可搭建和运行画布（见下文）

## 快速开始

```bash
git clone https://github.com/cookaihq/canvas4me.git
cd canvas4me
npm install
npm run dev
# 浏览器打开 → 右下角 SimpleSettings → API Key tab 配 foxapi Bearer token
```

要求 Node.js >= 24.0.0，npm >= 10.0.0。

## 部署上线

本项目是纯浏览器应用（IndexedDB 本地存储 + 直连 foxapi），没有自己的后端，部署 = 把构建产物丢给任意静态服务器。

```bash
npm install
npm run build      # 产出 dist/，全是静态资源
```

部署方式任选一种：

| 方式 | 用法 |
|---|---|
| **Docker（推荐自家服务器）** | 仓库根目录已带 `docker-compose.yml` + `Dockerfile` + `nginx.conf`，详见下文 |
| 本地预览（验证构建产物） | `npm run preview` → http://localhost:3184 |
| 裸 nginx | nginx / caddy 把 web root 指向 `dist/`，**必须配 SPA history fallback**，否则刷新页面会 404 |
| 托管平台 | Vercel / Netlify / Cloudflare Pages 直连 GitHub 仓库，build 命令填 `npm run build`，输出目录填 `dist` |
| GitHub Pages | 把 `dist/` 推到 `gh-pages` 分支 |

部署后用户首次进入仍需在右下角 SimpleSettings → API Key 配 foxapi Bearer token。

### Docker 部署

仓库根目录已带 `Dockerfile` + `docker-compose.yml` + `nginx.conf` + `.env.example`。镜像内只封装 nginx 站点配置（SPA fallback / gzip / 长缓存 / `/healthz`），`dist/` 通过 volume 挂载——以后只要在宿主机重跑 `npm run build` 就能更新站点，不需要重 build 镜像或重启容器。

```bash
git clone https://github.com/cookaihq/canvas4me.git
cd canvas4me
npm install && npm run build    # 宿主机生成 dist/
cp .env.example .env            # 按需改端口（默认 3183）
docker compose up -d --build
```

启动后容器在 `http://127.0.0.1:3183/` 提供服务（端口取自 `.env` 的 `CANVAS4ME_PORT`）。

**域名 / HTTPS 走宿主机外层反代**（不要让容器直接对外）：

```nginx
# 宿主机 nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3183;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

证书用 certbot / acme.sh 在宿主机签发即可。

**更新站点**：

```bash
git pull
npm install && npm run build    # 重新生成 dist/，容器自动看到新文件
```

**裸 nginx 关键配置**（不走 Docker 时）：

```nginx
location / {
  root /var/www/canvas4me/dist;
  try_files $uri $uri/ /index.html;
}
```

## 配置说明

通过画布右下角 **SimpleSettings** 弹窗配置，共 4 个 tab：

- **API Key**（必填）：[foxapi.cc](https://api.foxapi.cc) 的 Bearer token，所有能力调用都走这个；可一键查询用量和消费明细
- **偏好**：画布布局、主题等基础偏好
- **画布数据**：导出 / 导入 JSON、清空本地缓存（能力默认值 / 媒体缓存 / 全量重置）
- **诊断**：查看 / 下载本地错误日志（最近 50 条），方便反馈问题

文件上传走 foxapi 临时存储（72 小时后自动清理），但不影响画布长期使用——详见下方 FAQ 第 3 条。

## 已支持的能力

| 类型 | 能力 |
|---|---|
| 图像生成 | `nano-banana`、`gpt-image-2`、`midjourney`、`wan-image`、`phota`、`pbr-material`、`image-upscale` |
| 视频生成 | `sora`、`seedance-2`、`wan-video`、`video-extend`、`talking-head`、`video-upscale`、`kling-v3`、`kling-o3`、`lipsync` |
| 音频 / 音乐 | `minimax-speech`、`minimax-music`、`suno`、`lyria-3` |
| LLM | `llm`（4 mode：text / vision / audio / video） |

更多能力陆续接入中。

## 用 agent 操控画布（MCP）

本仓自带一套 MCP 集成：让你自己的 agent（Claude Code / Codex 等 MCP 客户端）通过对话操控你打开的画布——增删节点、连线、填参、触发运行、取回真实产物。

**架构一句话**：你的 agent（自带大脑）→ MCP 协议 → [`bridge/`](bridge/)（只转发的中继桥）→ 画布 tab 里的执行器 → 画布。桥不碰画布数据，真正动手的永远是浏览器里的执行器。

> 当前为**本地 stdio 模式**：MCP 客户端自动拉起桥，桥在 `localhost:7777` 等画布 tab 连。远程 / 公共托管 / 配对码 / 鉴权在路线图上。

**① 把桥配进 MCP 客户端**

```bash
claude mcp add canvas4me -- npx canvas4me-mcp
# npm 包发布前可用仓内路径等价替代：
claude mcp add canvas4me -- node /path/to/canvas4me/bridge/src/node/index.mjs
```

画布 tab 没连上前 `listTools` 为空是正常的——工具由画布连上时动态声明，桥不写死任何工具。

**② 装技能**（教 agent 画布工具的标准用法）

```bash
npx skills add cookaihq/canvas4me
```

**③ 启用画布的 agent 桥**（默认关闭，暂无 UI 开关）

打开画布页 → DevTools 控制台（F12）粘贴运行：

```js
const k = 'ai-canvas:settings:global'
const s = JSON.parse(localStorage.getItem(k) || '{}')
s.agentBridge = { ...(s.agentBridge || {}), enabled: true }
localStorage.setItem(k, JSON.stringify(s))
location.reload()
```

刷新后画布连上 `ws://localhost:7777`，向桥声明全部 18 个工具（能力发现 / 项目 / 画布读 / 增删改连 / 分组 / 运行取结果 / 镜头）。关闭：同一个 key 把 `enabled` 改回 `false` 再刷新。

**④ 对 agent 说目的**

保持**画布 tab 开着**（桥只认第一个连上的 tab），在 Claude Code 里直接说，例如：

> 「写个小故事放进文本节点；连到大模型节点变成分镜脚本；按分镜用 gpt-image-2 出图；再把图给 seedance-2 出视频。」

agent 会自己拆成工具调用，你在画布上看着它一步步搭建、运行、出真实产物。

**注意**：本地桥不校验 Origin、不要 token——同浏览器里任意页面都可能抢先连 7777 当「tab」。信任敏感场景关掉其它 tab；详见 [`bridge/README.md`](bridge/README.md) 的 Security 段。真实生成消耗 foxapi 额度。

## 贡献

本仓是主开发仓的**开源镜像**（单向同步）：直接对本仓提的 PR 无法原样合入——下次同步会覆盖。欢迎照常开 PR / issue：有价值的改动由维护者人工搬回主仓、随下次同步发布并在 PR 中致谢；issue 与讨论不受镜像机制影响。

## FAQ

**Q: API Key 在哪里申请？**
A: [foxapi.cc](https://api.foxapi.cc) 注册后在控制台生成 Bearer token。

**Q: 数据存在哪里？换浏览器会不会丢？**
A: 画布数据存浏览器 IndexedDB，**仅当前浏览器可见**。换浏览器或换设备前请用 SimpleSettings 的"画布数据"tab 导出 JSON，到新浏览器再导入。

**Q: 文件上传后只存 72 小时？过期后画布会失效吗？**
A: 不会。foxapi 临时存储 72h 失效时，画布会从浏览器本地缓存（Cache API / IndexedDB）自动重新上传拿到新 URL，用户无感知。只有当本地缓存也被清掉（换设备、手动清理）才会真的丢——这种场景请提前用"画布数据"tab 导出 JSON 再换设备导入。

**Q: 怎么导出 / 导入画布？**
A: 右下角 SimpleSettings → 画布数据 tab → 导出当前画布为 JSON / 从 JSON 导入。

**Q: 需要团队协作 / 多端同步 / 后端转存等功能？**
A: 这些不在本仓覆盖范围内。可关注作者的相关商业版本（详情见作者后续公告）。

## License

[Apache License 2.0](LICENSE)
