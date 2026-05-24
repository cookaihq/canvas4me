/**
 * llm-custom DockedPanel — 混合模式：一行混排 图片/视频/音频/文件，跑一次出文本。
 * 复用 LLM 顶栏/底栏/高级区；主体是 MixedAttachmentRow + prompt。
 */
import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import LlmPromptInput from '../_shared/LlmPromptInput'
import LlmAdvancedSection from '../_shared/LlmAdvancedSection'
import MixedAttachmentRow from '../_shared/MixedAttachmentRow'
import useEdgeAttachments from '../_shared/useEdgeAttachments'
import { resolveModelConstraints } from '../_shared/modelConstraints'
import { validateAttachments } from '../_shared/validateAttachments'
import { useLlmModels, getModelsForCapability } from '../_shared/useLlmModels'
import { getRequiredCapabilities, getModelMissingCapabilities } from '../_shared/llmModelCatalog'
import useModelForMode from '../_shared/useModelForMode'
import { MAX_IMAGES, MAX_VIDEOS, MAX_AUDIOS, MAX_FILES } from '../builder'

// 能力 → 连入素材的中文类型名（拼置灰原因文案用）
const CAP_LABEL = { vision: '图片', video: '视频', audio: '音频', file: '文件' }

export default function LlmCustomDockedPanel({
  node, capability, mode, params, edges, nodes, isDone,
  paramsUnchanged = false, variant = 'default',
  onCapabilityChange, onModeChange, onParamsChange, onRun, onRequestVariant,
}) {
  const constraints = useMemo(() => resolveModelConstraints(params.model || ''), [params.model])
  const maxOf = (kind, fb) => constraints[kind]?.maxCount ?? fb
  const makeValidateFile = useCallback((kind) => (f) => {
    const c = constraints[kind]
    if (!c) return { ok: true }
    if (c.maxSizeMB != null && f.size > c.maxSizeMB * 1024 * 1024) return { ok: false, reason: `超出 ${c.maxSizeMB}MB 上限` }
    if (Array.isArray(c.mime) && c.mime.length && f.type && !c.mime.includes(f.type)) return { ok: false, reason: '格式不支持' }
    return { ok: true }
  }, [constraints])

  const image = useEdgeAttachments({ nodeId: node.id, capabilityNode: node, edges, nodes, portId: 'image', inputSubType: 'image', max: maxOf('image', MAX_IMAGES), validateFile: makeValidateFile('image') })
  const video = useEdgeAttachments({ nodeId: node.id, capabilityNode: node, edges, nodes, portId: 'video', inputSubType: 'video', max: maxOf('video', MAX_VIDEOS), validateFile: makeValidateFile('video') })
  const audio = useEdgeAttachments({ nodeId: node.id, capabilityNode: node, edges, nodes, portId: 'audio', inputSubType: 'audio', max: maxOf('audio', MAX_AUDIOS), validateFile: makeValidateFile('audio') })
  const file  = useEdgeAttachments({ nodeId: node.id, capabilityNode: node, edges, nodes, portId: 'file',  inputSubType: 'file',  max: maxOf('file', MAX_FILES),  validateFile: makeValidateFile('file') })

  const groups = useMemo(() => ({
    image: image.items, video: video.items, audio: audio.items, file: file.items,
  }), [image.items, video.items, audio.items, file.items])

  const validationGroups = useMemo(() => {
    const yt = Array.isArray(params.videoLinks) ? params.videoLinks : []
    return {
      image: image.items,
      video: [...video.items, ...yt.map(url => ({ url, isExternal: true }))],
      audio: audio.items,
      file: file.items,
    }
  }, [image.items, video.items, audio.items, file.items, params.videoLinks])
  const validation = useMemo(() => validateAttachments({ constraints, groups: validationGroups }), [constraints, validationGroups])
  const getInvalidReason = useCallback((kind, item) => {
    const hit = validation.invalid.find(v => v.kind === kind && v.item === item)
    return hit ? hit.reason : null
  }, [validation])

  const { loading: modelsLoading, models: modelCatalog } = useLlmModels()
  const modeModels = useMemo(() => getModelsForCapability(modelCatalog, mode), [modelCatalog, mode])
  useModelForMode({ mode, models: modeModels, loading: modelsLoading, params, onParamsChange })

  // 连入的素材类型 → 模型需要具备的能力（图片→vision/视频→video/音频→audio/文件→file，视频链接也算 video）
  const requiredCaps = useMemo(
    () => getRequiredCapabilities(groups, params.videoLinks),
    [groups, params.videoLinks],
  )

  const commonParams = useMemo(() => CAPABILITIES[capability]?.modes?.[mode]?.commonParams || [], [capability, mode])
  const modelOptions = useMemo(() => modeModels.map(m => {
    const missing = getModelMissingCapabilities(m, requiredCaps)
    const disabled = missing.length > 0
    return {
      value: m.name, name: m.name, label: m.label || m.name, shortLabel: m.label || m.name,
      badge: m.badge || '', description: m.description || '',
      disabled,
      disabledReason: disabled
        ? `不支持${missing.map(c => CAP_LABEL[c] || c).join('/')}输入`
        : '',
    }
  }), [modeModels, requiredCaps])
  const extraOptions = useMemo(() => ({
    model: { options: modelOptions, control: modelOptions.length > 6 ? 'select' : 'buttons' },
  }), [modelOptions])

  const [runCount, setRunCount] = useState(1)
  const promptText = params.prompt || ''
  const anyAttachment = [image, video, audio, file].some(g => g.items.some(i => !i.uploading && i.url))
  const isClaude = (params.model || '').startsWith('claude')
  const claudeNeedsTokens = isClaude && (params.maxTokens == null || params.maxTokens === '')
  // 当前选中模型若不支持已连入的素材类型 → 拦截 Run（不偷偷换模型，由用户手动改）
  const currentModelGated = useMemo(
    () => !!params?.model && modelOptions.some(o => o.value === params.model && o.disabled),
    [params?.model, modelOptions],
  )
  const canRun = !!params?.model && (!!promptText.trim() || anyAttachment) && !claudeNeedsTokens && !currentModelGated && validation.ok

  const handlePickFiles = useCallback((kind, files) => {
    const g = { image, video, audio, file }[kind]
    g?.handlePickFiles(files)
  }, [image, video, audio, file])
  const handleDelete = useCallback((kind, item) => {
    const g = { image, video, audio, file }[kind]
    g?.handleDelete(item)
  }, [image, video, audio, file])
  const handlePasteLink = useCallback(() => {
    const url = window.prompt('粘贴 YouTube 视频链接')
    if (!url || !url.trim()) return
    const links = Array.isArray(params.videoLinks) ? params.videoLinks : []
    onParamsChange({ videoLinks: [...links, url.trim()] })
  }, [params.videoLinks, onParamsChange])

  const handleRun = useCallback(() => {
    if (!node?.id || !canRun) return
    if ([image, video, audio, file].some(g => g.items.some(i => i.uploading))) {
      message.warning('附件还在上传中，请稍候'); return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, canRun, runCount, onRun, image, video, audio, file])

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body llm-dp" data-mode={mode}>
      <DockedTopBar capability={capability} mode={mode} variant={variant}
        onCapabilityChange={onCapabilityChange} onModeChange={onModeChange} onRequestVariant={onRequestVariant} />

      <MixedAttachmentRow groups={groups} getInvalidReason={getInvalidReason} onPickFiles={handlePickFiles} onDelete={handleDelete} onPasteLink={handlePasteLink} />

      <LlmPromptInput variant={variant} edges={edges} nodeId={node.id}
        value={params.prompt} onChange={(text) => onParamsChange({ prompt: text })}
        placeholder="输入你想问的内容，可引用上方任意素材..." />

      <DockedBottomBar capability={capability} mode={mode} commonParams={commonParams} params={params}
        onParamsChange={onParamsChange} extraOptions={extraOptions} variant={variant} isDone={isDone}
        paramsUnchanged={paramsUnchanged} canRun={canRun} runCount={runCount}
        onRunCountChange={setRunCount} onRun={handleRun} onRequestVariant={onRequestVariant} />

      {showAdvanced && (
        <LlmAdvancedSection params={params} onParamsChange={onParamsChange} edges={edges} nodeId={node.id} />
      )}
    </div>
  )
}
