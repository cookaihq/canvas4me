/**
 * foldedEdge 单元测试
 *
 * 运行: node --test src/canvas/state/foldedEdge.test.js
 *
 * nodeTypes.js 通过 @/ Vite alias 引入 lucide-react,node 原生无法解析。
 * 这里用 node:module register() 在顶层注册 @/ → src/ 别名钩子,
 * 再通过动态 import() 加载目标模块——静态 import 在 register() 生效前已解析,
 * 必须用 dynamic import 才能让钩子介入。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve as pathResolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = pathResolve(fileURLToPath(import.meta.url), '..')
// __dirname = .../canvas-state-arch-migration/src/canvas/state
// 3 levels up: state → canvas → src → canvas-state-arch-migration (= repoRoot)
const repoRoot = pathResolve(__dirname, '../../..')
const srcRoot = pathResolve(repoRoot, 'src')

// 注册 @/ → src/ 解析钩子（register 是异步启动,但在本次 module graph 创建之前已生效）
const hooksCode = `
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as pathResolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const srcRoot = ${JSON.stringify(srcRoot)}

export function resolve(specifier, context, next) {
  // @/ Vite alias → src/ absolute
  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2)
    let absolutePath = pathResolve(srcRoot, relativePath)
    if (!existsSync(absolutePath)) absolutePath = absolutePath + '.js'
    if (!existsSync(absolutePath)) absolutePath = absolutePath.replace(/\\.js$/, '.jsx')
    return { url: pathToFileURL(absolutePath).href, shortCircuit: true }
  }
  // extensionless relative import (./ or ../) → try adding .js / .jsx (mirrors Vite resolve)
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.match(/\\.jsx?$/)) {
    const base = context.parentURL ? fileURLToPath(context.parentURL) : srcRoot
    const absolute = pathResolve(dirname(base), specifier)
    if (existsSync(absolute + '.js')) return { url: pathToFileURL(absolute + '.js').href, shortCircuit: true }
    if (existsSync(absolute + '.jsx')) return { url: pathToFileURL(absolute + '.jsx').href, shortCircuit: true }
  }
  return next(specifier, context)
}
`

register(
  `data:text/javascript,${encodeURIComponent(hooksCode)}`,
  { parentURL: pathToFileURL('/').href }
)

// 动态导入：必须在 register() 调用之后
const foldedEdgePath = pathToFileURL(pathResolve(__dirname, 'foldedEdge.js')).href
const nodeTypesPath = pathToFileURL(pathResolve(srcRoot, 'canvas/registry/nodeTypes.js')).href

const { buildFoldedOutputMap, resolveEdgeEndpoints } = await import(foldedEdgePath)
const { registerCapability, CAPABILITIES } = await import(nodeTypesPath)

// ─── 注册测试用最小 capability ───
//
// 真实折叠 capability: gpt-image-2（image/gpt-image-2/register.js form: 'folded'）
// defaultMode: 'gpt-image-2'
// primary output: { id: 'image-out', type: 'image', role: 'generated_image' }
// output node type: 'output-gpt-image-2'（isOutputNodeType 检查 startsWith('output-')）
//
// 只注入 CAPABILITIES 中有效的最小字段——不包含 React 组件（outputNode）等运行时依赖。

if (!CAPABILITIES['gpt-image-2']) {
  registerCapability({
    id: 'gpt-image-2',
    nodeType: 'image',
    label: 'GPT Image 2',
    defaultMode: 'gpt-image-2',
    form: 'folded',
    modes: {
      'gpt-image-2': {
        label: '完整版',
        inputs: [
          { id: 'prompt', role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        ],
        outputs: [
          { id: 'image-out', type: 'image', role: 'generated_image' },
        ],
      },
    },
  })
}

// 注册一个非折叠 capability 用于对照
if (!CAPABILITIES['nano-banana']) {
  registerCapability({
    id: 'nano-banana',
    nodeType: 'image',
    label: 'Nano Banana',
    defaultMode: 'txt2img',
    // form 缺省 → 'separated'（不折叠）
    modes: {
      txt2img: {
        label: '文生图',
        inputs: [
          { id: 'prompt', role: 'prompt_text', canAcceptRoles: ['prompt_text'] },
        ],
        outputs: [
          { id: 'image-out', type: 'image', role: 'generated_image' },
        ],
      },
    },
  })
}

// ─── 测试辅助 ───

function lookupOf(nodes) {
  return new Map(nodes.map((n) => [n.id, n]))
}

// ─── 测试场景节点与边 ───
//
// cap-1: folded capability (gpt-image-2)，连向 out-1（output-gpt-image-2）
// cap-2: non-folded capability (nano-banana)，连向 out-2（output-nano-banana）
// consumer-1: 普通 content 节点，接收来自 out-1 的跨越边

const NODES = [
  { id: 'cap-1', type: 'capability', data: { capability: 'gpt-image-2', mode: 'gpt-image-2' } },
  { id: 'out-1', type: 'output-gpt-image-2', data: {} },
  { id: 'cap-2', type: 'capability', data: { capability: 'nano-banana', mode: 'txt2img' } },
  { id: 'out-2', type: 'output-nano-banana', data: {} },
  { id: 'consumer-1', type: 'content', data: {} },
]

const EDGES = [
  // 内部边：折叠 cap → 自己的 output
  { id: 'e-cap1-out1',    source: 'cap-1', sourceHandle: 'image-out', target: 'out-1',      targetHandle: 'in' },
  // 跨越边：折叠 output → 外部消费者（应被重写到 cap-1）
  { id: 'e-out1-consumer', source: 'out-1', sourceHandle: 'out',      target: 'consumer-1', targetHandle: 'in' },
  // 非折叠 cap → 自己的 output（不应进 map）
  { id: 'e-cap2-out2',    source: 'cap-2', sourceHandle: 'image-out', target: 'out-2',      targetHandle: 'in' },
]

// ─── Tests ───

test('buildFoldedOutputMap: 折叠 capability 的 output 节点被登记，映射到正确的 parentId + parentHandle', () => {
  const map = buildFoldedOutputMap(lookupOf(NODES), EDGES)
  assert.deepEqual(
    map.get('out-1'),
    { parentId: 'cap-1', parentHandle: 'image-out' }
  )
})

test('buildFoldedOutputMap: 非折叠 capability 的 output 节点不进 map', () => {
  const map = buildFoldedOutputMap(lookupOf(NODES), EDGES)
  assert.equal(map.has('out-2'), false)
})

test('resolveEdgeEndpoints: 跨越边 source 从折叠 output 重写到 parentId + parentHandle，hiddenInternal false', () => {
  const map = buildFoldedOutputMap(lookupOf(NODES), EDGES)
  const edge = EDGES.find((e) => e.id === 'e-out1-consumer')
  const result = resolveEdgeEndpoints(edge, map)
  assert.equal(result.source, 'cap-1')
  assert.equal(result.sourceHandle, 'image-out')
  assert.equal(result.target, 'consumer-1')
  assert.equal(result.hiddenInternal, false)
})

test('resolveEdgeEndpoints: 内部边（折叠 cap → 自己的 output）hiddenInternal true', () => {
  const map = buildFoldedOutputMap(lookupOf(NODES), EDGES)
  const edge = EDGES.find((e) => e.id === 'e-cap1-out1')
  const result = resolveEdgeEndpoints(edge, map)
  assert.equal(result.hiddenInternal, true)
})

test('resolveEdgeEndpoints: 空 foldedMap 时普通边原样返回', () => {
  const emptyMap = new Map()
  const edge = EDGES.find((e) => e.id === 'e-cap2-out2')
  const result = resolveEdgeEndpoints(edge, emptyMap)
  assert.equal(result.source, 'cap-2')
  assert.equal(result.target, 'out-2')
  assert.equal(result.hiddenInternal, false)
})

test('buildFoldedOutputMap: getCapabilityPrimaryOutput 返回 null 时（无输出端口的 capability）不进 map', () => {
  // 注册一个 folded 但 outputs 为空的 capability
  if (!CAPABILITIES['empty-out-cap']) {
    registerCapability({
      id: 'empty-out-cap',
      nodeType: 'tool',
      label: 'Empty Out',
      defaultMode: 'default',
      form: 'folded',
      modes: {
        default: {
          label: 'Default',
          inputs: [],
          outputs: [], // 无 output → getCapabilityPrimaryOutput 返回 null
        },
      },
    })
  }
  const nodes = [
    { id: 'ecap', type: 'capability', data: { capability: 'empty-out-cap', mode: 'default' } },
    { id: 'eout', type: 'output-empty-out-cap', data: {} },
  ]
  const edges = [
    { id: 'e-ecap-eout', source: 'ecap', sourceHandle: null, target: 'eout', targetHandle: 'in' },
  ]
  const map = buildFoldedOutputMap(lookupOf(nodes), edges)
  assert.equal(map.has('eout'), false)
})
