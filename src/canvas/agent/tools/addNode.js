/**
 * 工具 add_node —— 在画布上新建一个节点。支持三大类:
 *
 *   - kind='content' (素材节点): subType ∈ {image,video,audio,text,file}。
 *     可选 content:{url} (image/video/audio/file) 或 {text} (text),作为初始产物内联进
 *     节点 data.content。url 必须是远端 http(s) url(画布不存 base64/blob)。
 *   - kind='ability' (能力节点): nodeType ∈ {image,video,sound,llm} + capability(+可选 mode)。
 *     折叠能力会一并带出常驻 output 节点 + internal 边,两者一起写入。
 *   - kind='group' (视觉分组): 需 box {x,y,width,height}。
 *
 * 落点(position)可选,缺省走自动布局(视口中心找空位居中),避免堆在 (0,0)。
 * group 不参与自动布局(几何由 box 显式给定)。
 *
 * 节点/边写入只走 facade,不裸 setNodes/setEdges。
 */
import { createInputNode, createCapabilityNode, createGroupNode } from '@/canvas/utils/nodeFactory'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { assertEditable, assertHttpUrl } from './_shared/guards'

const CONTENT_SUBTYPES = ['image', 'video', 'audio', 'text', 'file']
const ABILITY_NODE_TYPES = ['image', 'video', 'sound', 'llm']

/**
 * 把节点放到目标落点:position 给定 → 用它;缺省 → 视口中心找空位再居中。
 * @returns {object} 放好位置的节点
 */
function placeNode(node, ctx, rawPos) {
  const hasPos = typeof rawPos?.x === 'number' && typeof rawPos?.y === 'number'
  if (hasPos) {
    return { ...node, position: { x: rawPos.x, y: rawPos.y } }
  }
  const viewport = ctx.viewport()
  if (!viewport) {
    // 视口能力未接通时退化为原点(不应发生;接线缺失的兜底)。
    return node
  }
  const center = viewport.findFreeSpot(viewport.getViewportCenter())
  return viewport.centerNodeAt({ ...node, position: center }, center)
}

/**
 * 构造 content 节点的初始产物(校验后写入 data.content)。
 * image/video/audio/file → {url}; text → {text}。非法 url 抛错。
 */
function buildContentExtra(subType, content) {
  if (!content || typeof content !== 'object') return {}
  if (subType === 'text') {
    if (typeof content.text !== 'string') return {}
    return { content: { text: content.text } }
  }
  // 媒体/文件:必须带远端 http(s) url。
  if (content.url == null) return {}
  assertHttpUrl(content.url, 'content.url')
  const c = { url: content.url }
  if (typeof content.fileName === 'string') c.fileName = content.fileName
  return { content: c }
}

function addContentNode(args, ctx) {
  const { subType } = args
  if (!CONTENT_SUBTYPES.includes(subType)) {
    throw new Error(`content 节点 subType 必须是 ${CONTENT_SUBTYPES.join('/')},收到: ${subType}`)
  }
  const extraData = buildContentExtra(subType, args.content)
  const node = placeNode(createInputNode(subType, { x: 0, y: 0 }, extraData), ctx, args.position)
  ctx.facade.addNodes([node])
  return { ok: true, nodeId: node.id, kind: 'content', subType }
}

function addAbilityNode(args, ctx) {
  const { nodeType, capability, mode } = args
  if (!ABILITY_NODE_TYPES.includes(nodeType)) {
    throw new Error(`ability 节点 nodeType 必须是 ${ABILITY_NODE_TYPES.join('/')},收到: ${nodeType}`)
  }
  if (!capability || typeof capability !== 'string') {
    throw new Error('ability 节点需要 capability(子能力 id)')
  }
  const capDef = CAPABILITIES[capability]
  if (!capDef) throw new Error(`未知 capability: ${capability}`)
  if (capDef.nodeType !== nodeType) {
    throw new Error(`capability ${capability} 属于 nodeType=${capDef.nodeType},与传入 nodeType=${nodeType} 不符`)
  }
  if (mode != null && !capDef.modes?.[mode]) {
    throw new Error(`capability ${capability} 无此 mode: ${mode}`)
  }
  // createCapabilityNode 返回 { nodes, edges }:折叠能力 nodes=[能力节点, 常驻 output]、edges=[internal 边];
  // 非折叠 nodes=[能力节点]、edges=[]。两者都写入(主能力节点是 nodes[0])。
  const { nodes: created, edges } = createCapabilityNode(nodeType, { x: 0, y: 0 }, capability, { mode })
  const main = created[0]
  const placedMain = placeNode(main, ctx, args.position)
  const dx = placedMain.position.x - main.position.x
  const dy = placedMain.position.y - main.position.y
  const placed = created.map((n, i) => i === 0
    ? placedMain
    : { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } })
  ctx.facade.addNodes(placed)
  if (edges.length) ctx.facade.addEdges(edges)
  return { ok: true, nodeId: main.id, kind: 'ability', nodeType, capability, mode: main.data?.mode ?? null }
}

function addGroupNode(args, ctx) {
  const box = args.box
  const ok = box && ['x', 'y', 'width', 'height'].every((k) => typeof box[k] === 'number')
  if (!ok) throw new Error('group 节点需要 box {x,y,width,height}(均为数字)')
  if (box.width <= 0 || box.height <= 0) throw new Error('group box 的 width/height 必须为正')
  const node = createGroupNode(box)
  ctx.facade.addNodes([node])
  return { ok: true, nodeId: node.id, kind: 'group' }
}

/** @type {import('./index').AgentTool} */
export const addNode = {
  name: 'add_node',
  description:
    '在画布上新建节点。kind="content"(素材:image/video/audio/text/file,可带初始 content)、' +
    'kind="ability"(能力:nodeType+capability,折叠能力自动带产物节点)、kind="group"(分组,需 box)。' +
    'position 缺省自动布局。',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['content', 'ability', 'group'], description: '节点大类' },
      subType: {
        type: 'string',
        enum: CONTENT_SUBTYPES,
        description: 'kind=content 时的内容子类型',
      },
      nodeType: {
        type: 'string',
        enum: ABILITY_NODE_TYPES,
        description: 'kind=ability 时的能力大类',
      },
      capability: { type: 'string', description: 'kind=ability 时的子能力 id(见 list_capabilities)' },
      mode: { type: 'string', description: 'kind=ability 时的子能力 mode(可选,缺省用 defaultMode)' },
      content: {
        type: 'object',
        description: 'kind=content 时的初始产物:媒体/文件用 {url}(远端 http(s) url),文本用 {text}',
        properties: {
          url: { type: 'string', description: '远端 http(s) url(image/video/audio/file)' },
          text: { type: 'string', description: '文本内容(text)' },
          fileName: { type: 'string', description: '文件名(可选)' },
        },
        additionalProperties: false,
      },
      position: {
        type: 'object',
        description: '落点坐标(画布坐标系)。缺省自动布局到视口中心空位。group 忽略此字段(用 box)。',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        additionalProperties: false,
      },
      box: {
        type: 'object',
        description: 'kind=group 时的分组框(绝对几何)',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
    required: ['kind'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    switch (args?.kind) {
      case 'content':
        return addContentNode(args, ctx)
      case 'ability':
        return addAbilityNode(args, ctx)
      case 'group':
        return addGroupNode(args, ctx)
      default:
        throw new Error(`add_node 未知 kind: ${args?.kind}(应为 content/ability/group)`)
    }
  },
}
