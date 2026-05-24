/**
 * Vite 插件 - build 结束时往输出目录写 version.json
 *
 * 给容器内 nginx 的 /version 端点提供数据源,部署完后可通过
 * https://<host>/version 拿到 JSON,便于核对当前部署的版本/commit.
 *
 * 字段说明:
 *   - canvasVersion: 整数,缓存探测号(src/canvas/version.js)
 *   - appVersion:    semver 字符串(根 version 文件)
 *   - gitTag:        构建时 HEAD 所指向的 v* tag(如 v0.1.1);
 *                    没有指向任何 tag 时为 null
 *   - gitSha:        完整 commit SHA
 *   - gitShortSha:   7 位短 SHA
 *   - buildTime:     ISO8601(本地时区)
 *
 * git 信息读不到时退化为 null,不阻断 build.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function safeGit(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
  } catch {
    return null
  }
}

function readCanvasVersion(projectRoot) {
  try {
    const src = fs.readFileSync(path.join(projectRoot, 'src/canvas/version.js'), 'utf-8')
    const m = src.match(/CANVAS_VERSION\s*=\s*(\d+)/)
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

function readAppVersion(projectRoot) {
  try {
    return fs.readFileSync(path.join(projectRoot, 'version'), 'utf-8').trim() || null
  } catch {
    return null
  }
}

export function versionJsonPlugin(options = {}) {
  const projectRoot = options.projectRoot || process.cwd()
  let resolvedOutDir = null
  return {
    name: 'version-json',
    apply: 'build',
    configResolved(config) {
      resolvedOutDir = config.build?.outDir || options.outDir || null
    },
    closeBundle() {
      const outDir = resolvedOutDir || options.outDir
      if (!outDir) return
      const absOut = path.isAbsolute(outDir) ? outDir : path.join(projectRoot, outDir)

      const gitSha = safeGit('git rev-parse HEAD')
      // git describe --tags --exact-match 只匹配 HEAD 正好指向的 tag(无 fallback)
      const gitTag = safeGit('git describe --tags --exact-match HEAD')

      const payload = {
        canvasVersion: readCanvasVersion(projectRoot),
        appVersion: readAppVersion(projectRoot),
        gitTag,
        gitSha,
        gitShortSha: gitSha ? gitSha.slice(0, 7) : null,
        buildTime: new Date().toISOString(),
      }

      fs.mkdirSync(absOut, { recursive: true })
      fs.writeFileSync(
        path.join(absOut, 'version.json'),
        JSON.stringify(payload, null, 2) + '\n',
        'utf-8',
      )
    },
  }
}
