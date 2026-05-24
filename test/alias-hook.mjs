// node:test 用 — 让源码的 Vite 风格导入在 Node 下可解析:
//   1. `@/x` → `src/x`(对齐构建时的 resolve.alias)
//   2. src 内部的扩展名缺省相对导入(`../registry/nodeTypes`)补 `.js`/`.jsx`/index 兜底
// node_modules 与非 src 路径走默认解析,不受影响。
// 用法: node --test --import ./test/alias-hook.mjs <test files>
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const SRC = path.resolve(import.meta.dirname, '..', 'src')
const SRC_URL = pathToFileURL(SRC + path.sep).href
const EXTS = ['.js', '.jsx', '.mjs', '.json', '/index.js', '/index.jsx']

// 构建时 Vite 会把 import.meta.env 内联;Node 下没有,提供一个空 env 兜底。
globalThis.__VITE_TEST_ENV__ = globalThis.__VITE_TEST_ENV__ || { MODE: 'test', DEV: false, PROD: false }

function resolveWithExts(absNoExt) {
  if (fs.existsSync(absNoExt) && fs.statSync(absNoExt).isFile()) {
    return pathToFileURL(absNoExt).href
  }
  for (const ext of EXTS) {
    const candidate = absNoExt + ext
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href
    }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let abs = null
    if (specifier.startsWith('@/')) {
      abs = path.join(SRC, specifier.slice(2))
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      const candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      // 只对 src 内部的相对导入兜底,node_modules 不碰
      if (candidate.startsWith(SRC + path.sep)) abs = candidate
    }
    if (abs) {
      const url = resolveWithExts(abs)
      if (url) return { url, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(SRC_URL)) return nextLoad(url, context)
    const result = nextLoad(url, context)
    if (result.source != null) {
      const src = result.source.toString()
      if (src.includes('import.meta.env')) {
        return { ...result, source: src.split('import.meta.env').join('globalThis.__VITE_TEST_ENV__') }
      }
    }
    return result
  },
})
