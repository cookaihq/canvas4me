// 运行: node --test --import ./test/alias-hook.mjs src/canvas/utils/groupDrag.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDragToGroups, findDropTargetGroup } from './groupDrag.js'

const sized = (o) => ({ measured: { width: 50, height: 50 }, ...o })

test('detach: 成员被拖到与组完全不相交 → 清 parentId + 转绝对', () => {
  // group 在 (76,76) 98x98, 成员 a 相对(24,24)=绝对(100,100); 把 a 拖到相对(900,900)=绝对(976,976) 远离
  const prev = [
    { id: 'g', type: 'group', position: { x: 76, y: 76 }, style: { width: 98, height: 98 } },
    sized({ id: 'a', type: 'input', parentId: 'g', position: { x: 900, y: 900 } }),
    sized({ id: 'b', type: 'input', parentId: 'g', position: { x: 24, y: 24 } }),
  ]
  const out = applyDragToGroups(prev, new Set(['a']), 24)
  const a = out.find(n => n.id === 'a')
  assert.equal(a.parentId, undefined)
  assert.deepEqual(a.position, { x: 976, y: 976 }) // 转绝对
  // 组按剩余成员 b 重算: b 绝对(100,100) → box(76,76,98,98), b 相对(24,24)
  const g = out.find(n => n.id === 'g')
  assert.deepEqual(g.position, { x: 76, y: 76 })
})

test('stay+expand: 成员部分拖出仍相交 → 留组, 组重算扩张包住', () => {
  // group(76,76,98,98); a 拖到相对(100,24)=绝对(176,100), 50 宽 → 右边到 226, 超出组右界(174)但仍相交
  const prev = [
    { id: 'g', type: 'group', position: { x: 76, y: 76 }, style: { width: 98, height: 98 } },
    sized({ id: 'a', type: 'input', parentId: 'g', position: { x: 100, y: 24 } }),
    sized({ id: 'b', type: 'input', parentId: 'g', position: { x: 24, y: 24 } }),
  ]
  const out = applyDragToGroups(prev, new Set(['a']), 24)
  const a = out.find(n => n.id === 'a')
  assert.equal(a.parentId, 'g') // 仍在组
  // 重算: 成员绝对 a(176,100)~(226,150)、b(100,100)~(150,150) → 包围盒(100,100,126,50) 外扩24 → box(76,76,174,98)
  const g = out.find(n => n.id === 'g')
  assert.deepEqual(g.position, { x: 76, y: 76 })
  assert.equal(g.width, 174) // 顶层 width: 修复关键 — 渲染优先顶层, resize 后自动调整才生效
  assert.deepEqual(g.style.width, 174) // style 同步
  // 成员世界坐标不变: a 新相对 = 176-76=100
  assert.deepEqual(a.position, { x: 100, y: 24 })
})

test('adopt: 自由节点中心落入组矩形 → 设 parentId + 转相对, 组重算', () => {
  const prev = [
    { id: 'g', type: 'group', position: { x: 76, y: 76 }, style: { width: 98, height: 98 } },
    sized({ id: 'b', type: 'input', parentId: 'g', position: { x: 24, y: 24 } }),
    sized({ id: 'f', type: 'input', position: { x: 100, y: 100 } }), // 自由, 中心(125,125) 在组内
  ]
  const out = applyDragToGroups(prev, new Set(['f']), 24)
  const f = out.find(n => n.id === 'f')
  assert.equal(f.parentId, 'g')
})

test('findDropTargetGroup: 节点中心在某组矩形内 → 返回该组 id', () => {
  const groups = [{ id: 'g', position: { x: 0, y: 0 }, style: { width: 100, height: 100 } }]
  assert.equal(findDropTargetGroup({ x: 40, y: 40, width: 20, height: 20 }, groups), 'g')
  assert.equal(findDropTargetGroup({ x: 400, y: 400, width: 20, height: 20 }, groups), null)
})

test('group 自身被拖 → 不当成员吸入别的组(不嵌套)', () => {
  const prev = [
    { id: 'g1', type: 'group', position: { x: 0, y: 0 }, style: { width: 300, height: 300 } },
    { id: 'g2', type: 'group', position: { x: 50, y: 50 }, style: { width: 80, height: 80 } },
  ]
  const out = applyDragToGroups(prev, new Set(['g2']), 24)
  const g2 = out.find(n => n.id === 'g2')
  assert.equal(g2.parentId, undefined) // group 不被吸进 group
})
