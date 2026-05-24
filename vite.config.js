import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { versionJsonPlugin } from './scripts/version-json-plugin.js'

const version = fs.readFileSync(path.resolve(__dirname, 'version'), 'utf-8').trim()

export default defineConfig({
  plugins: [react(), versionJsonPlugin({ projectRoot: __dirname })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    // 生成 sourcemap — 让浏览器 DevTools 能把 stack trace 还原成源码行号 / 组件名,
    // 否则错误日志里只有 'index-xxx.js:411:49107' 这种没法定位的位置.
    // 副作用: dist/ 多出 .map 文件, 仅在打开 DevTools 时按需下载, 不影响首屏.
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3183,
    open: true,
    proxy: {
      '/foxapi': {
        target: 'https://api.foxapi.cc',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/foxapi/, ''),
      },
      '/oss-proxy': {
        target: 'https://ftres.oss-cn-beijing.aliyuncs.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/oss-proxy/, ''),
      },
    },
  },
  preview: {
    port: 3184,
  },
})
