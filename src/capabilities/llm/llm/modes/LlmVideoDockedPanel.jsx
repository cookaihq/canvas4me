/**
 * llm-video DockedPanel — 视频理解 —— UX_SPEC.md §9 新形态
 *
 * 与 LlmVision 差异: 视频附件(最多 10 段, video-accent 红色 — 由 CSS 控制)。
 *
 * 附件入口:
 *   - 上传文件 → handlePickFiles → 走 OSS 上传 (所有模型可用),走画布 content 节点
 *   - 粘贴链接 → 仅 Gemini 系列模型 (params.model 以 'gemini' 开头) 显示该入口,
 *     接受严格 YouTube URL → push 到 params.videoLinks (不创建画布节点);
 *     builder 在 submit 时把它合并进 body.video_urls,且声明为 externalUrls 跳过健康检查
 */
import { useCallback, useMemo, useState } from 'react'
import { Input, Tooltip, message } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { Link, X, Plus } from '@/canvas/icons'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import LlmPromptInput from '../_shared/LlmPromptInput'
import LlmAdvancedSection from '../_shared/LlmAdvancedSection'
import LlmAttachmentRow from '../_shared/LlmAttachmentRow'
import useEdgeAttachments from '../_shared/useEdgeAttachments'
import { useLlmModels, getModelsForCapability } from '../_shared/useLlmModels'
import useModelForMode from '../_shared/useModelForMode'
import { MAX_VIDEOS } from '../builder'

const YOUTUBE_URL_REGEX = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)[\w-]+|youtu\.be\/[\w-]+)/i

export default function LlmVideoDockedPanel({
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

  const { items: videoItems, handlePickFiles, handleDelete } = useEdgeAttachments({
    nodeId: node.id,
    capabilityNode: node,
    edges,
    nodes,
    portId: 'video',
    inputSubType: 'video',
    max: MAX_VIDEOS,
  })

  const isGemini = (params?.model || '').toLowerCase().startsWith('gemini')
  const videoLinks = useMemo(
    () => (Array.isArray(params?.videoLinks) ? params.videoLinks : []),
    [params?.videoLinks],
  )
  const totalAttachments = videoItems.length + videoLinks.length

  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  const openLinkModal = useCallback(() => {
    if (totalAttachments >= MAX_VIDEOS) {
      message.warning(`最多 ${MAX_VIDEOS} 段视频`)
      return
    }
    setLinkInput('')
    setLinkModalOpen(true)
  }, [totalAttachments])

  const submitLink = useCallback(() => {
    const url = (linkInput || '').trim()
    if (!url) {
      message.warning('请粘贴 YouTube 视频链接')
      return
    }
    if (!YOUTUBE_URL_REGEX.test(url)) {
      message.error('仅支持 YouTube 链接（youtube.com/watch、youtu.be 或 youtube.com/shorts）')
      return
    }
    if (videoLinks.includes(url)) {
      message.warning('该链接已添加')
      return
    }
    onParamsChange({ videoLinks: [...videoLinks, url] })
    setLinkModalOpen(false)
  }, [linkInput, videoLinks, onParamsChange])

  const removeVideoLink = useCallback((url) => {
    onParamsChange({ videoLinks: videoLinks.filter(u => u !== url) })
  }, [videoLinks, onParamsChange])

  const { loading: modelsLoading, models: modelCatalog } = useLlmModels()
  const modeModels = useMemo(() => getModelsForCapability(modelCatalog, mode), [modelCatalog, mode])
  useModelForMode({
    mode, models: modeModels, loading: modelsLoading, params, onParamsChange,
  })

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  const modelOptions = useMemo(() => (
    modeModels.map(m => ({
      value: m.name,
      name: m.name,
      label: m.label || m.name,
      shortLabel: m.label || m.name,
      badge: m.badge || '',
      description: m.description || '',
    }))
  ), [modeModels])

  const extraOptions = useMemo(() => ({
    model: {
      options: modelOptions,
      control: modelOptions.length > 6 ? 'select' : 'buttons',
    },
  }), [modelOptions])

  const [runCount, setRunCount] = useState(1)
  const promptText = params.prompt || ''
  const hasVideo = videoItems.some(i => !i.uploading && i.url) || videoLinks.length > 0
  const canRun = !!params?.model && !!promptText.trim() && hasVideo

  const handleRun = useCallback(() => {
    if (!node?.id || !canRun) return
    if (videoItems.some(i => i.uploading)) {
      message.warning('视频还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, canRun, runCount, onRun, videoItems])

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body llm-dp" data-mode={mode}>
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {(videoItems.length > 0 || videoLinks.length === 0) && (
        <LlmAttachmentRow
          kind="video"
          items={videoItems}
          max={MAX_VIDEOS}
          onPickFiles={handlePickFiles}
          onDelete={handleDelete}
          onPasteLink={isGemini ? openLinkModal : undefined}
          showAddButton={videoLinks.length === 0}
        />
      )}

      {videoLinks.length > 0 && (
        <div className="llm-video-link-list">
          {videoLinks.map(url => (
            <div key={url} className="llm-video-link-chip" title={url}>
              <Link className="llm-video-link-chip-icon" size={12} />
              <span className="llm-video-link-chip-url">{url}</span>
              <Tooltip title="删除">
                <button
                  type="button"
                  className="llm-video-link-chip-del"
                  onClick={() => removeVideoLink(url)}
                  aria-label="删除链接"
                >
                  <X size={12} />
                </button>
              </Tooltip>
            </div>
          ))}
          {isGemini && totalAttachments < MAX_VIDEOS && (
            <button
              type="button"
              className="llm-video-link-add"
              onClick={openLinkModal}
            >
              <Plus size={14} />
              <span>再添加一个 YouTube 链接</span>
            </button>
          )}
        </div>
      )}

      <LlmPromptInput
        variant={variant}
        edges={edges}
        nodeId={node.id}
        value={params.prompt}
        onChange={(text) => onParamsChange({ prompt: text })}
        placeholder="描述你想从视频里理解什么..."
      />

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        extraOptions={extraOptions}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        canRun={canRun}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRun}
        onRequestVariant={onRequestVariant}
      />

      {showAdvanced && (
        <LlmAdvancedSection
          params={params}
          onParamsChange={onParamsChange}
          edges={edges}
          nodeId={node.id}
        />
      )}

      <Modal
        title="粘贴 YouTube 视频链接"
        open={linkModalOpen}
        onOk={submitLink}
        onCancel={() => setLinkModalOpen(false)}
        okText="添加"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          autoFocus
          value={linkInput}
          placeholder="https://www.youtube.com/watch?v=... 或 https://youtu.be/..."
          onChange={(e) => setLinkInput(e.target.value)}
          onPressEnter={submitLink}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ac-text-muted)' }}>
          仅支持公开的 YouTube 视频链接（Gemini 模型原生识别 YouTube URL）。
        </div>
      </Modal>
    </div>
  )
}
