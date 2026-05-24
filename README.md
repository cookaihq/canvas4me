# canvas4me

> 一个跑在浏览器里的 AI 工作流画布——把图像 / 视频 / 音频 / LLM 能力拖出来连起来用。

基于 Vite + React + @xyflow/react 构建，类 Figma 的无限画布节点编排，浏览器本地存储，自带 API Key 直连 [foxapi](https://api.foxapi.cc) 调用各家 AI 能力。

## 它是什么

- **视觉化工作流编辑器**：节点 + 连线表达 prompt → 模型 → 输出的全过程
- **AI 能力节点**：图像生成 / 视频生成 / 语音合成 / 音乐生成 / LLM 等开箱即用
- **浏览器本地存储**：画布数据存 IndexedDB，无需账号，开关浏览器即恢复
- **自带 API Key**：在 SimpleSettings 配 foxapi Bearer token 即可使用

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
