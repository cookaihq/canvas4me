# syntax=docker/dockerfile:1.7

# ============================================================================
# canvas4me - 静态站镜像
# ----------------------------------------------------------------------------
# 镜像内只封装 nginx + 站点配置,不含 dist:
#   - dist/ 在宿主机 `npm run build` 后通过 volume 挂进容器
#   - 优点:迭代时只需重 build dist,容器无需重建/重启
#
# 构建:
#   docker compose build       # 由 docker-compose.yml 调起
#
# 直接构建(不走 compose):
#   docker build -t canvas4me:latest .
# ============================================================================

FROM nginx:alpine

# 替换默认站点配置(SPA fallback + gzip + 长缓存 + /healthz)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx:alpine 默认 CMD: ["nginx", "-g", "daemon off;"]
