import { useCallback, useMemo, useRef, useState } from 'react'
import { message, Tooltip } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'

import { Image as ImageIcon, Video as VideoIcon, Music as MusicIcon, Plus, X as XIcon, Eye } from '@/canvas/icons'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import MediaPreviewModal from '@/canvas/components/MediaPreviewModal'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import { useUploader } from '@/platform/provider.jsx'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import DockedReferenceRow from '@/capabilities/image/gpt-image-2/_shared/DockedReferenceRow'
import PromptChipEditor from '../_shared/PromptChipEditor'
import {
  parseSeedancePromptSegments,
  buildSeedancePromptText,
  findOrphanAnchors,
} from '../_shared/seedance-prompt'
import { R2V_MAX_IMAGES, R2V_MAX_VIDEOS, R2V_MAX_AUDIOS } from '../register'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import '../_shared/prompt-chip-editor.css'

function ReferenceVideoThumb({ url }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'video' })
  return <video src={displayUrl} muted playsInline preload="metadata" onError={markError} />
}

/**
 * Seedance 2.0 · reference-to-video DockedPanel — 见 docs/capabilities/video/seedance-2.md §2.7
 *
 * 主区:
 *   - 参考图网格 (端口 image / 上传 panel_image_urls 合并; 上限 9)
 *   - 参考视频网格 (端口 video / 上传 panel_video_urls 合并; 上限 3)
 *   - 参考音频列表 (端口 audio / 上传 panel_audio_urls 合并; 上限 3)
 *   - chip prompt 编辑器 (segments)
 *   - prompt 端口已连接时整个编辑器隐藏 (端口文本优先)
 *
 * 数据存储 (modeParams['reference-to-video']):
 *   - panel_image_urls / panel_video_urls / panel_audio_urls : 各自面板上传 URL 数组
 *   - _reference_prompt_segments : chip 编辑器内部 segments
 *   - prompt : 序列化后的纯文本 (提交用; 改 segments 时同步更新)
 *
 * anchor 编号: image / video / audio 各自从 1 起, 端口在前 + 面板在后. 顺序变了 anchor
 * 也变, 用户已插入的 chip 会变成悬空 (UI 标 ⚠).
 */

const IMAGE_LIMIT = R2V_MAX_IMAGES
const VIDEO_LIMIT = R2V_MAX_VIDEOS
const AUDIO_LIMIT = R2V_MAX_AUDIOS

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm'
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/m4a,audio/aac'

export default function ReferenceToVideoDockedPanel({
  node,
  capability,
  mode,
  params,
  edges,
  nodes,
  isDone,
  paramsUnchanged = false,
  variant = 'default',
  onCapabilityChange,
  onModeChange,
  onParamsChange,
  onRun,
  onRequestVariant,
}) {
  const uploader = useUploader()
  const facade = useCanvasFacade()
  const editorRef = useRef(null)

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // 端口侧 — 多选端口 image / video / audio
  const portImages = useMemo(() => collectPortItems(edges, nodes, node.id, 'image'), [edges, nodes, node.id])
  const portVideos = useMemo(() => collectPortItems(edges, nodes, node.id, 'video'), [edges, nodes, node.id])
  const portAudios = useMemo(() => collectPortItems(edges, nodes, node.id, 'audio'), [edges, nodes, node.id])

  // 面板侧 — 直接上传到 modeParams
  const panelImageUrls = params?.panel_image_urls || []
  const panelVideoUrls = params?.panel_video_urls || []
  const panelAudioUrls = params?.panel_audio_urls || []

  // 合并后的素材列表 (端口在前, 面板在后) — 决定 chip 引用 anchor 的索引
  const mergedImages = useMemo(() => mergePortAndPanel(portImages, panelImageUrls), [portImages, panelImageUrls])
  const mergedVideos = useMemo(() => mergePortAndPanel(portVideos, panelVideoUrls), [portVideos, panelVideoUrls])
  const mergedAudios = useMemo(() => mergePortAndPanel(portAudios, panelAudioUrls), [portAudios, panelAudioUrls])

  // assetMap: 'image-1' → { url, type, name }, 给 chip 编辑器用
  const assetMap = useMemo(() => {
    const map = {}
    mergedImages.forEach((it, i) => { map[`image-${i + 1}`] = { url: it.url, type: 'image', name: it.name } })
    mergedVideos.forEach((it, i) => { map[`video-${i + 1}`] = { url: it.url, type: 'video', name: it.name } })
    mergedAudios.forEach((it, i) => { map[`audio-${i + 1}`] = { url: it.url, type: 'audio', name: it.name } })
    return map
  }, [mergedImages, mergedVideos, mergedAudios])

  // segments
  const segments = useMemo(() => {
    if (Array.isArray(params?._reference_prompt_segments)) {
      return parseSeedancePromptSegments(params._reference_prompt_segments)
    }
    return parseSeedancePromptSegments(params?.prompt || '')
  }, [params?._reference_prompt_segments, params?.prompt])

  const handleSegmentsChange = useCallback((next) => {
    onParamsChange?.({
      _reference_prompt_segments: next,
      prompt: buildSeedancePromptText(next),
    })
  }, [onParamsChange])

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  // (跟 LLM/GPT-Image-2 一致, edge segment 进 segments 数组里跟 asset segment 并列)
  useEdgePlaceholderSync({
    value: params?.prompt || '',
    onChange: (newPrompt) => {
      // hook 把 placeholder 写到 prompt string, 这里把 string 反向 parse 为 segments
      // (parseSeedancePromptSegments 已识别 {{ai-canvas:edge:N}} → edge segment)
      const nextSegments = parseSeedancePromptSegments(newPrompt)
      onParamsChange?.({
        prompt: newPrompt,
        _reference_prompt_segments: nextSegments,
      })
    },
    nodeId: node.id,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id &&
      e.targetHandle === 'prompt' &&
      e.source === sourceNodeId
    )))
  }, [facade, node.id])

  // ── 面板上传 / 删除 处理 ──
  const handleUploadFiles = useCallback(async (kind, files) => {
    if (!files || files.length === 0) return
    const limit = kind === 'image' ? IMAGE_LIMIT : kind === 'video' ? VIDEO_LIMIT : AUDIO_LIMIT
    const portCount = kind === 'image' ? portImages.length : kind === 'video' ? portVideos.length : portAudios.length
    const panelArr = kind === 'image' ? panelImageUrls : kind === 'video' ? panelVideoUrls : panelAudioUrls
    const total = portCount + panelArr.length
    const remain = limit - total
    if (remain <= 0) {
      message.warning(`参考${kind === 'image' ? '图' : kind === 'video' ? '视频' : '音频'}最多 ${limit} 项`)
      return
    }
    const accepted = Array.from(files).slice(0, remain)
    if (files.length > remain) {
      message.warning(`最多再添加 ${remain} 项，已丢弃 ${files.length - remain} 项`)
    }

    const newUrls = []
    for (const file of accepted) {
      try {
        const result = await uploader.uploadFile(file)
        if (result?.url) newUrls.push({ url: result.url, name: file.name })
      } catch (err) {
        message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
      }
    }
    if (newUrls.length === 0) return
    const key = kind === 'image' ? 'panel_image_urls'
      : kind === 'video' ? 'panel_video_urls' : 'panel_audio_urls'
    onParamsChange?.({ [key]: [...panelArr, ...newUrls] })
  }, [portImages.length, portVideos.length, portAudios.length,
    panelImageUrls, panelVideoUrls, panelAudioUrls, uploader, onParamsChange])

  const handleDelete = useCallback((kind, item) => {
    if (item.source === 'edge') {
      // 端口侧删除 = 直接断开 edge
      // 父组件按 edgeId 处理 — 这里没有 setEdges 引用, 改走 edges 删除是 R2V 的副作用,
      // 比较保险的做法: 跳一个简单提示, 让用户去画布上删
      message.info('该参考来自画布连线，请直接在画布上断开连线')
      return
    }
    const key = kind === 'image' ? 'panel_image_urls'
      : kind === 'video' ? 'panel_video_urls' : 'panel_audio_urls'
    const panelArr = kind === 'image' ? panelImageUrls : kind === 'video' ? panelVideoUrls : panelAudioUrls
    const next = panelArr.filter((p, i) => `panel-${i}` !== item.localKey)
    onParamsChange?.({ [key]: next })
  }, [panelImageUrls, panelVideoUrls, panelAudioUrls, onParamsChange])

  const handleInsertAnchor = useCallback((kind, globalIndex) => {
    const anchor = `${kind}-${globalIndex}`
    editorRef.current?.insertAnchor(anchor)
  }, [])

  // 悬空引用 (chip 引用了已删除的素材)
  const orphanAnchors = useMemo(() => {
    const available = {
      image: new Set(mergedImages.map((_, i) => `image-${i + 1}`)),
      video: new Set(mergedVideos.map((_, i) => `video-${i + 1}`)),
      audio: new Set(mergedAudios.map((_, i) => `audio-${i + 1}`)),
    }
    return findOrphanAnchors(segments, available)
  }, [segments, mergedImages, mergedVideos, mergedAudios])

  // ── Run ──
  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    const totalImages = mergedImages.length
    const totalVideos = mergedVideos.length
    const totalAudios = mergedAudios.length
    const total = totalImages + totalVideos + totalAudios
    if (total === 0) {
      message.warning('至少上传一项参考素材')
      return
    }
    if (totalImages === 0 && totalVideos === 0 && totalAudios > 0) {
      message.warning('仅音频不够，请同时上传图片或视频')
      return
    }
    if (totalImages > IMAGE_LIMIT) { message.warning(`参考图最多 ${IMAGE_LIMIT} 张`); return }
    if (totalVideos > VIDEO_LIMIT) { message.warning(`参考视频最多 ${VIDEO_LIMIT} 段`); return }
    if (totalAudios > AUDIO_LIMIT) { message.warning(`参考音频最多 ${AUDIO_LIMIT} 段`); return }

    // prompt 字面非空即可(可能含 placeholder); builder 会调 expandPromptPlaceholders 展开
    const promptText = buildSeedancePromptText(segments).trim()
    if (!promptText) {
      message.warning('请填写 Prompt')
      return
    }
    if (orphanAnchors.length > 0) {
      message.warning(`Prompt 中有 ${orphanAnchors.length} 个失效引用，将被忽略`)
      // 不阻止: 后端会忽略不存在的 @ 引用
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, mergedImages.length, mergedVideos.length, mergedAudios.length, segments, orphanAnchors.length])

  // ── 渲染辅助 ──
  const refImageItems = mergedImagesToRefItems(mergedImages)

  return (
    <div className="docked-panel-body sd2-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="sd2-dp-r2v-section docked-panel-scroll">
        {/* 参考图 */}
        <div className="sd2-dp-r2v-group">
          <div className="sd2-dp-r2v-group-header">
            <span><ImageIcon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />参考图</span>
            <span className={`sd2-dp-r2v-group-counter${mergedImages.length > IMAGE_LIMIT ? ' over-limit' : ''}`}>
              {mergedImages.length} / {IMAGE_LIMIT}
            </span>
          </div>
          <DockedReferenceRow
            items={refImageItems}
            max={IMAGE_LIMIT}
            showAddButton
            showDeleteButton
            onPickFiles={(files) => handleUploadFiles('image', files)}
            onDelete={(item) => handleDelete('image', item)}
            onInsertToken={(idx) => handleInsertAnchor('image', idx)}
            label="图"
          />
        </div>

        {/* 参考视频 + 参考音频 — 并排两栏 (各自上限 3, 半幅可容纳) */}
        <div className="sd2-dp-r2v-row-2col">
          {/* 参考视频 */}
          <div className="sd2-dp-r2v-group">
            <div className="sd2-dp-r2v-group-header">
              <span><VideoIcon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />参考视频</span>
              <span className={`sd2-dp-r2v-group-counter${mergedVideos.length > VIDEO_LIMIT ? ' over-limit' : ''}`}>
                {mergedVideos.length} / {VIDEO_LIMIT}
              </span>
            </div>
            <VideoRefRow
              items={mergedVideos}
              max={VIDEO_LIMIT}
              onPickFiles={(files) => handleUploadFiles('video', files)}
              onDelete={(item) => handleDelete('video', item)}
              onInsertAnchor={(idx) => handleInsertAnchor('video', idx)}
            />
          </div>

          {/* 参考音频 */}
          <div className="sd2-dp-r2v-group">
            <div className="sd2-dp-r2v-group-header">
              <span><MusicIcon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />参考音频</span>
              <span className={`sd2-dp-r2v-group-counter${mergedAudios.length > AUDIO_LIMIT ? ' over-limit' : ''}`}>
                {mergedAudios.length} / {AUDIO_LIMIT}
              </span>
            </div>
            <AudioRefRow
              items={mergedAudios}
              max={AUDIO_LIMIT}
              onPickFiles={(files) => handleUploadFiles('audio', files)}
              onDelete={(item) => handleDelete('audio', item)}
              onInsertAnchor={(idx) => handleInsertAnchor('audio', idx)}
            />
          </div>
        </div>

        {/* prompt — segments 同时支持 asset (@Image1/@Video1/...) + edge (.tp-chip) 两种 chip */}
        <PromptChipEditor
          ref={editorRef}
          segments={segments}
          onSegmentsChange={handleSegmentsChange}
          assetMap={assetMap}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          placeholder="描述想要生成的视频，可输入 @Image1 / @Video2 / @Audio3 引用素材…"
        />
      </div>

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
      />
    </div>
  )
}

// ─── 辅助 ───

function collectPortItems(edges, nodes, nodeId, handle) {
  return expandPortInputs({
    targetNodeId: nodeId,
    targetHandle: handle,
    edges,
    nodes,
  })
}

function mergePortAndPanel(portItems, panelArr) {
  return [
    ...portItems,
    ...panelArr.map((p, i) => ({
      source: 'panel',
      localKey: `panel-${i}`,
      url: p.url,
      name: p.name || `素材 ${i + 1}`,
    })),
  ]
}

function mergedImagesToRefItems(merged) {
  // DockedReferenceRow 需要的形态: { url, source, edgeId?, sourceNodeId?, localKey?, name? }
  return merged.map((it) => ({
    url: it.url,
    source: it.source,
    edgeId: it.edgeId,
    sourceNodeId: it.sourceNodeId,
    localKey: it.localKey,
    name: it.name,
  }))
}

// ─── 视频参考行 (DockedReferenceRow 内置 accept image/*, 视频要单独画) ───

function VideoRefRow({ items, max, onPickFiles, onDelete, onInsertAnchor }) {
  const inputRef = useRef(null)
  const isFull = items.length >= max
  const [previewUrl, setPreviewUrl] = useState(null)
  const handleFilesChange = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) onPickFiles?.(e.target.files)
    e.target.value = ''
  }, [onPickFiles])

  return (
    <div className="dpr-thumbs">
      {items.map((item, i) => {
        const idx = i + 1
        return (
          <div key={`${item.source}-${item.edgeId || item.localKey || i}`} className="dpr-thumb">
            <ReferenceVideoThumb url={item.url} />
            <div className="dpr-thumb-hover-actions">
              <Tooltip title="插入到 prompt">
                <button type="button" className="dpr-thumb-action" onClick={() => onInsertAnchor?.(idx)}>
                  <Plus size={14} />
                </button>
              </Tooltip>
              <Tooltip title="查看">
                <button type="button" className="dpr-thumb-action" onClick={() => setPreviewUrl(item.url)}>
                  <Eye size={14} />
                </button>
              </Tooltip>
            </div>
            <Tooltip title={item.source === 'edge' ? '来自画布连线' : '删除'}>
              <button
                type="button"
                className="dpr-thumb-x"
                onClick={() => onDelete?.(item)}
                aria-label="删除视频"
              >
                <XIcon size={10} />
              </button>
            </Tooltip>
          </div>
        )
      })}
      {!isFull && (
        <Tooltip title="添加视频">
          <button type="button" className="dpr-thumb dpr-thumb-add" onClick={() => inputRef.current?.click()}>
            <Plus size={18} />
          </button>
        </Tooltip>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesChange}
      />
      <MediaPreviewModal
        open={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        mediaType="video"
        url={previewUrl}
      />
    </div>
  )
}

// ─── 音频参考行 (方形 chip, 与视频一致; 无缩略图, 居中音乐图标) ───

function AudioRefRow({ items, max, onPickFiles, onDelete, onInsertAnchor }) {
  const inputRef = useRef(null)
  const isFull = items.length >= max
  const [previewUrl, setPreviewUrl] = useState(null)
  const handleFilesChange = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) onPickFiles?.(e.target.files)
    e.target.value = ''
  }, [onPickFiles])

  return (
    <div className="dpr-thumbs">
      {items.map((item, i) => {
        const idx = i + 1
        return (
          <div
            key={`${item.source}-${item.edgeId || item.localKey || i}`}
            className="dpr-thumb"
            title={item.name || `音频 ${idx}`}
          >
            <div className="dpr-thumb-empty"><MusicIcon size={20} /></div>
            <div className="dpr-thumb-hover-actions">
              <Tooltip title="插入到 prompt">
                <button type="button" className="dpr-thumb-action" onClick={() => onInsertAnchor?.(idx)}>
                  <Plus size={14} />
                </button>
              </Tooltip>
              <Tooltip title="查看">
                <button type="button" className="dpr-thumb-action" onClick={() => setPreviewUrl(item.url)}>
                  <Eye size={14} />
                </button>
              </Tooltip>
            </div>
            <Tooltip title={item.source === 'edge' ? '来自画布连线' : '删除'}>
              <button
                type="button"
                className="dpr-thumb-x"
                onClick={() => onDelete?.(item)}
                aria-label="删除音频"
              >
                <XIcon size={10} />
              </button>
            </Tooltip>
          </div>
        )
      })}
      {!isFull && (
        <Tooltip title="添加音频">
          <button type="button" className="dpr-thumb dpr-thumb-add" onClick={() => inputRef.current?.click()}>
            <Plus size={18} />
          </button>
        </Tooltip>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesChange}
      />
      <MediaPreviewModal
        open={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        mediaType="audio"
        url={previewUrl}
      />
    </div>
  )
}
