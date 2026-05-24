// src/capabilities/tool/capcut-draft/timelineSpec.test.js
// 运行: node --test src/capabilities/tool/capcut-draft/timelineSpec.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInitialTimeline, materialFromContent, toCapcutSpec, validateTimeline, defaultSegmentDuration, computeInitialTimeline, planProbes } from './timelineSpec.js'

test('materialFromContent · video content', () => {
  const m = materialFromContent('node1', { subType: 'video', content: { url: 'https://x.com/a.mp4', fileName: 'a.mp4', duration: 8 }, label: '视频 #1' })
  assert.deepEqual(m, {
    id: 'mat-node1', sourceNodeId: 'node1', type: 'video',
    url: 'https://x.com/a.mp4', filename: 'a.mp4',
    label: '视频 #1', naturalDurationSec: 8, textContent: null,
  })
})
test('materialFromContent · audio content fallback filename from URL', () => {
  const m = materialFromContent('n2', { subType: 'audio', content: { url: 'https://x.com/b.mp3' }, label: 'bgm' })
  assert.equal(m.filename, 'b.mp3')
  assert.equal(m.type, 'audio')
})
test('materialFromContent · image content,无固有时长', () => {
  const m = materialFromContent('n3', { subType: 'image', content: { url: 'https://x.com/c.jpg' }, label: 'cover' })
  assert.equal(m.type, 'image')
  assert.equal(m.naturalDurationSec, null)
})
test('materialFromContent · text content,记录文本', () => {
  const m = materialFromContent('n4', { subType: 'text', content: { text: '开场标题' }, label: '标题' })
  assert.equal(m.type, 'text')
  assert.equal(m.textContent, '开场标题')
  assert.equal(m.url, null)
})
test('materialFromContent · label 优先取 data.name(用户起的节点名)', () => {
  // 节点既有 label(类型默认名)又有 name(用户起名),应取 name
  const m = materialFromContent('node1', { subType: 'video', name: '4-1', label: '数字人视频 输出', content: { url: 'https://x.com/a.mp4', duration: 8 } })
  assert.equal(m.label, '4-1')
})
test('materialFromContent · 仅 data.label 时退回 label', () => {
  const m = materialFromContent('node1', { subType: 'video', label: '数字人视频 输出', content: { url: 'https://x.com/a.mp4', duration: 8 } })
  assert.equal(m.label, '数字人视频 输出')
})
test('materialFromContent · 折叠 output:contentNode.name 空 → 取 parentName(外壳 capability 起名)', () => {
  const m = materialFromContent('out1', { subType: 'video', label: '数字人视频 输出', content: { url: 'https://x.com/a.mp4', duration: 8 } }, { parentName: '3-1' })
  assert.equal(m.label, '3-1')
})
test('materialFromContent · contentNode.name 优先于 parentName', () => {
  const m = materialFromContent('out1', { subType: 'video', name: '自命名', label: '数字人视频 输出', content: { url: 'https://x.com/a.mp4', duration: 8 } }, { parentName: '3-1' })
  assert.equal(m.label, '自命名')
})
test('materialFromContent · parentName 空 + name 空 → 退回 label', () => {
  const m = materialFromContent('out1', { subType: 'video', label: '数字人视频 输出', content: { url: 'https://x.com/a.mp4', duration: 8 } }, { parentName: null })
  assert.equal(m.label, '数字人视频 输出')
})

test('buildInitialTimeline · 四种类型素材都按顺序铺到对应轨道,各轨独立 cursor', () => {
  const materials = [
    { id: 'mv1', type: 'video', naturalDurationSec: 5, url: 'v1' },
    { id: 'ma1', type: 'audio', naturalDurationSec: 8, url: 'a1' },
    { id: 'mv2', type: 'video', naturalDurationSec: 3, url: 'v2' },
    { id: 'mi1', type: 'image', url: 'i1' },
    { id: 'mi2', type: 'image', url: 'i2' },
    { id: 'mt1', type: 'text', textContent: '标题' },
  ]
  const tl = buildInitialTimeline({ draftName: 'X', canvas: { width: 1920, height: 1080, fps: 30 }, materials })
  assert.equal(tl.draftName, 'X')
  assert.equal(tl.tracks.length, 4)

  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments[0].materialId, 'mv1')
  assert.equal(videoTrack.segments[0].startSec, 0)
  assert.equal(videoTrack.segments[0].durationSec, 5)
  assert.equal(videoTrack.segments[1].materialId, 'mv2')
  assert.equal(videoTrack.segments[1].startSec, 5)
  assert.equal(videoTrack.segments[1].durationSec, 3)

  const imageTrack = tl.tracks.find(t => t.uiKind === 'image')
  assert.equal(imageTrack.segments.length, 2)
  assert.equal(imageTrack.segments[0].materialId, 'mi1')
  assert.equal(imageTrack.segments[0].startSec, 0)
  assert.equal(imageTrack.segments[0].durationSec, 3)
  assert.equal(imageTrack.segments[1].materialId, 'mi2')
  assert.equal(imageTrack.segments[1].startSec, 3)
  assert.equal(imageTrack.segments[1].durationSec, 3)
  // image segment 不带 sourceDurationSec
  assert.equal(imageTrack.segments[0].sourceDurationSec, undefined)

  const audioTrack = tl.tracks.find(t => t.uiKind === 'audio')
  assert.equal(audioTrack.segments[0].materialId, 'ma1')
  assert.equal(audioTrack.segments[0].durationSec, 8)

  const textTrack = tl.tracks.find(t => t.uiKind === 'text')
  assert.equal(textTrack.segments.length, 1)
  assert.equal(textTrack.segments[0].materialId, 'mt1')
  assert.equal(textTrack.segments[0].startSec, 0)
  assert.equal(textTrack.segments[0].durationSec, 3)
})

// ── toCapcutSpec + validateTimeline ──────────────────────────────────────────

const baseMaterials = [
  { id: 'mv1', type: 'video', url: 'https://x.com/v.mp4', filename: 'v.mp4', naturalDurationSec: 5 },
  { id: 'mi1', type: 'image', url: 'https://x.com/i.jpg', filename: 'i.jpg' },
  { id: 'mt1', type: 'text', textContent: '开场标题' },
]

test('toCapcutSpec · 视频片段产生 material + timeline + source', () => {
  const tl = {
    draftName: '我的视频', allowReplace: false,
    canvas: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: 'tv', type: 'video', segments: [
        { materialId: 'mv1', startSec: 0, durationSec: 3, sourceDurationSec: 3 },
      ]},
    ],
  }
  const spec = toCapcutSpec(tl, baseMaterials)
  assert.equal(spec.draft_name, '我的视频')
  assert.deepEqual(spec.canvas, { width: 1920, height: 1080, fps: 30 })
  assert.equal(spec.tracks.length, 1)
  assert.deepEqual(spec.tracks[0], {
    type: 'video',
    segments: [{
      material: { url: 'https://x.com/v.mp4', type: 'video', filename: 'v.mp4' },
      timeline: { start: 0, duration: 3_000_000 },
      source:   { start: 0, duration: 3_000_000 },
    }],
  })
})

test('toCapcutSpec · 图片片段不带 source', () => {
  const tl = {
    draftName: 'X', allowReplace: false, canvas: { width: 1, height: 1, fps: 30 },
    tracks: [{ type: 'video', segments: [{ materialId: 'mi1', startSec: 1, durationSec: 4 }] }],
  }
  const spec = toCapcutSpec(tl, baseMaterials)
  assert.deepEqual(spec.tracks[0].segments[0], {
    material: { url: 'https://x.com/i.jpg', type: 'image', filename: 'i.jpg' },
    timeline: { start: 1_000_000, duration: 4_000_000 },
  })
})

test('toCapcutSpec · 文字片段进 text 轨道,不带 material', () => {
  const tl = {
    draftName: 'X', allowReplace: false, canvas: { width: 1, height: 1, fps: 30 },
    tracks: [{ type: 'text', segments: [{ materialId: 'mt1', startSec: 0, durationSec: 3 }] }],
  }
  const spec = toCapcutSpec(tl, baseMaterials)
  assert.deepEqual(spec.tracks[0], {
    type: 'text',
    segments: [{
      timeline: { start: 0, duration: 3_000_000 },
      text: { content: '开场标题', style: {} },
    }],
  })
})

test('toCapcutSpec · 空轨道过滤掉', () => {
  const tl = {
    draftName: 'X', allowReplace: false, canvas: { width: 1, height: 1, fps: 30 },
    tracks: [
      { type: 'video', segments: [] },
      { type: 'audio', segments: [{ materialId: 'mv1', startSec: 0, durationSec: 1, sourceDurationSec: 1 }] },
    ],
  }
  const spec = toCapcutSpec(tl, baseMaterials)
  assert.equal(spec.tracks.length, 1)
  assert.equal(spec.tracks[0].type, 'audio')
})

test('toCapcutSpec · allowReplace false 不写入;true 时写入', () => {
  const base = { draftName: 'X', canvas: { width: 1, height: 1, fps: 30 }, tracks: [] }
  assert.equal(toCapcutSpec(base, []).allow_replace, undefined)
  assert.equal(toCapcutSpec({ ...base, allowReplace: true }, []).allow_replace, true)
})

const okTimeline = () => ({
  draftName: '我的视频', canvas: { width: 1920, height: 1080, fps: 30 },
  tracks: [{ type: 'video', segments: [{ materialId: 'm', startSec: 0, durationSec: 1, sourceDurationSec: 1 }] }],
})

test('validateTimeline · 合法 → 无错误', () => {
  assert.deepEqual(validateTimeline(okTimeline()), [])
})

test('validateTimeline · 草稿名为空', () => {
  assert.ok(validateTimeline({ ...okTimeline(), draftName: '' }).includes('草稿名不能为空'))
})

test('validateTimeline · 草稿名含非法字符', () => {
  assert.ok(validateTimeline({ ...okTimeline(), draftName: 'a/b' }).includes('草稿名不能包含 / 或 \\'))
})

test('validateTimeline · 画布尺寸非法', () => {
  assert.ok(validateTimeline({ ...okTimeline(), canvas: { width: 0, height: 1, fps: 30 } }).includes('画布尺寸必须 > 0'))
})

test('validateTimeline · 所有轨道都空', () => {
  assert.ok(validateTimeline({ ...okTimeline(), tracks: [{ type: 'video', segments: [] }] }).includes('至少要把一个素材放到轨道上'))
})

test('validateTimeline · 片段时长 ≤ 0', () => {
  const bad = okTimeline()
  bad.tracks[0].segments[0].durationSec = 0
  assert.ok(validateTimeline(bad).includes('有片段时长不合法'))
})

test('defaultSegmentDuration · video 有自然时长 → 返回该值', () => {
  assert.equal(defaultSegmentDuration({ type: 'video', naturalDurationSec: 7.5 }), 7.5)
})
test('defaultSegmentDuration · audio 有自然时长 → 返回该值', () => {
  assert.equal(defaultSegmentDuration({ type: 'audio', naturalDurationSec: 12 }), 12)
})
test('defaultSegmentDuration · video 无自然时长 → 返回 null(取消 5s 兜底)', () => {
  assert.equal(defaultSegmentDuration({ type: 'video', naturalDurationSec: null }), null)
})
test('defaultSegmentDuration · audio 无自然时长 → 返回 null', () => {
  assert.equal(defaultSegmentDuration({ type: 'audio', naturalDurationSec: null }), null)
})
test('defaultSegmentDuration · image → 3s', () => {
  assert.equal(defaultSegmentDuration({ type: 'image' }), 3)
})
test('defaultSegmentDuration · text → 3s', () => {
  assert.equal(defaultSegmentDuration({ type: 'text' }), 3)
})
test('buildInitialTimeline · video 缺 naturalDurationSec 跳过,cursor 不前进', () => {
  const materials = [
    { id: 'mv1', type: 'video', naturalDurationSec: null, url: 'v1' },
    { id: 'mv2', type: 'video', naturalDurationSec: 4,    url: 'v2' },
    { id: 'mv3', type: 'video', naturalDurationSec: null, url: 'v3' },
    { id: 'mv4', type: 'video', naturalDurationSec: 6,    url: 'v4' },
  ]
  const tl = buildInitialTimeline({ draftName: 'X', canvas: { width: 1, height: 1, fps: 30 }, materials })
  const videoTrack = tl.tracks.find(t => (t.uiKind || t.type) === 'video')
  assert.equal(videoTrack.segments.length, 2)
  assert.equal(videoTrack.segments[0].materialId, 'mv2')
  assert.equal(videoTrack.segments[0].startSec, 0)
  assert.equal(Number.isFinite(videoTrack.segments[0].durationSec), true)
  assert.equal(videoTrack.segments[1].materialId, 'mv4')
  assert.equal(videoTrack.segments[1].startSec, 4)   // cursor 跨越 null 后正确累加
})

test('buildInitialTimeline · audio 缺 naturalDurationSec 跳过,cursor 不前进', () => {
  const materials = [
    { id: 'ma1', type: 'audio', naturalDurationSec: null, url: 'a1' },
    { id: 'ma2', type: 'audio', naturalDurationSec: 10,   url: 'a2' },
    { id: 'ma3', type: 'audio', naturalDurationSec: 7,    url: 'a3' },
  ]
  const tl = buildInitialTimeline({ draftName: 'X', canvas: { width: 1, height: 1, fps: 30 }, materials })
  const audioTrack = tl.tracks.find(t => (t.uiKind || t.type) === 'audio')
  assert.equal(audioTrack.segments.length, 2)
  assert.equal(audioTrack.segments[0].materialId, 'ma2')
  assert.equal(audioTrack.segments[0].startSec, 0)
  assert.equal(audioTrack.segments[1].materialId, 'ma3')
  assert.equal(audioTrack.segments[1].startSec, 10)
})

// ── computeInitialTimeline ────────────────────────────────────────────────────

const baseCanvas = { width: 1920, height: 1080, fps: 30 }
const oneVideo = [{ id: 'mv1', type: 'video', naturalDurationSec: 5, url: 'v1' }]

test('computeInitialTimeline · stored undefined → 基于 materials 自动铺,userEdited=false', () => {
  const tl = computeInitialTimeline(undefined, oneVideo)
  assert.equal(tl.userEdited, false)
  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments[0].materialId, 'mv1')
})

test('computeInitialTimeline · stored.userEdited=true → 原样返回 stored(经 ensureAllTracks)', () => {
  const stored = {
    draftName: '我的草稿',
    canvas: { width: 1280, height: 720, fps: 24 },
    userEdited: true,
    tracks: [
      { id: 'track-video-1', type: 'video', uiKind: 'video',
        segments: [{ id: 's1', materialId: 'mv1', startSec: 10, durationSec: 2, sourceDurationSec: 2 }] },
    ],
    materialFilenames: { mv1: '改名' },
    allowReplace: true,
  }
  const tl = computeInitialTimeline(stored, oneVideo)
  assert.equal(tl.userEdited, true)
  assert.equal(tl.draftName, '我的草稿')
  assert.equal(tl.canvas.width, 1280)
  assert.equal(tl.allowReplace, true)
  assert.deepEqual(tl.materialFilenames, { mv1: '改名' })
  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments[0].startSec, 10)   // 完全沿用 stored
})

test('computeInitialTimeline · stored.userEdited=false → 重铺,但保留 stored 的非轨道字段', () => {
  const stored = {
    draftName: '保留名',
    canvas: { width: 1080, height: 1920, fps: 60 },
    userEdited: false,
    tracks: [],
    materialFilenames: { mv1: '改名' },
    allowReplace: true,
  }
  const tl = computeInitialTimeline(stored, oneVideo)
  assert.equal(tl.userEdited, false)
  assert.equal(tl.draftName, '保留名')
  assert.equal(tl.canvas.width, 1080)
  assert.equal(tl.allowReplace, true)
  assert.deepEqual(tl.materialFilenames, { mv1: '改名' })
  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments[0].materialId, 'mv1')
})

test('computeInitialTimeline · stored 无 userEdited 字段(老节点) → 等同 userEdited=false 重铺', () => {
  const stored = {
    draftName: '老草稿',
    canvas: baseCanvas,
    tracks: [],
  }
  const tl = computeInitialTimeline(stored, oneVideo)
  assert.equal(tl.userEdited, false)
  assert.equal(tl.draftName, '老草稿')
  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments[0].materialId, 'mv1')
})

test('computeInitialTimeline · 未编辑路径,缺时长的 video 不进 tracks', () => {
  const tl = computeInitialTimeline(undefined, [
    { id: 'mv1', type: 'video', naturalDurationSec: null, url: 'v1' },
    { id: 'mv2', type: 'video', naturalDurationSec: 4,    url: 'v2' },
  ])
  const videoTrack = tl.tracks.find(t => t.uiKind === 'video')
  assert.equal(videoTrack.segments.length, 1)
  assert.equal(videoTrack.segments[0].materialId, 'mv2')
})

test('planProbes · 挑出缺时长的 video/audio,跳过已在 probeState 里的', () => {
  const materials = [
    { id: 'mv1', type: 'video', naturalDurationSec: null },
    { id: 'mv2', type: 'video', naturalDurationSec: 5 },
    { id: 'ma1', type: 'audio', naturalDurationSec: null },
    { id: 'mi1', type: 'image' },
    { id: 'mt1', type: 'text' },
  ]
  const probeState = new Map([['ma1', 'pending']])
  const result = planProbes(materials, probeState)
  // mv1 缺时长 → 待探测;mv2 已有时长 → 跳过;ma1 已 pending → 跳过;mi1/mt1 类型不匹配 → 跳过
  assert.deepEqual(result, ['mv1'])
})

test('planProbes · failed 状态的素材也不再自动探测(等用户重试)', () => {
  const materials = [{ id: 'mv1', type: 'video', naturalDurationSec: null }]
  const probeState = new Map([['mv1', 'failed']])
  assert.deepEqual(planProbes(materials, probeState), [])
})

test('planProbes · 空 probeState + 多个缺时长素材', () => {
  const materials = [
    { id: 'mv1', type: 'video', naturalDurationSec: null },
    { id: 'ma1', type: 'audio', naturalDurationSec: null },
  ]
  assert.deepEqual(planProbes(materials, new Map()), ['mv1', 'ma1'])
})
