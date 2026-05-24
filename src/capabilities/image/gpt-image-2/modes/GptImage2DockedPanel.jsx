import { useCallback, useMemo, useRef, useState } from 'react'
import { InputNumber, Segmented, Tooltip, message } from 'antd'

import { Upload as UploadIcon, Shuffle, X as XIcon } from '@/canvas/icons'
import { useUploader } from '@/platform/provider.jsx'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import RichPromptEditor from '../_shared/RichPromptEditor'
import DockedReferenceRow from '../_shared/DockedReferenceRow'

/**
 * GPT Image 2 完整版 DockedPanel —— 新规范(eas3Z 原型)
 *
 * 布局:
 *   顶栏 DockedTopBar(图节点有多 capability → 显示能力切换 chip + mode tab + ↗)
 *   参考图行(独立显示)
 *   RichPromptEditor(独立显示)
 *   底栏 DockedBottomBar(参数 chip + 工具区 + Run)
 *   高级区(齿轮展开): MASK / OUTPUT FORMAT / BACKGROUND / SEED
 *
 * 新规范要点:
 *   - aspect_ratio + clarity 进底栏 chip popover (联动 disabled)
 *   - mask 从立柱挪到高级区第一行
 *   - 标签 ALL-CAPS, 左侧固定宽 120
 */

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'png',  label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
]

const BACKGROUND_OPTIONS = [
  { value: 'auto',   label: 'auto' },
  { value: 'opaque', label: 'opaque' },
]

export default function GptImage2DockedPanel({
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
  const promptEditorRef = useRef(null)
  const maskInputRef = useRef(null)
  const { displayUrl: maskDisplayUrl, markError: maskMarkError } = useMediaSource(params.mask_url, { kind: 'image' })

  // 当前 mode 的 commonParams(从注册器读)
  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // 参考图来自端口连入
  const referenceItems = useMemo(() => {
    return expandPortInputs({
      targetNodeId: node.id,
      targetHandle: 'image',
      edges,
      nodes,
    })
  }, [edges, nodes, node.id])

  const richReferenceImages = useMemo(
    () => referenceItems.map(i => ({ url: i.url, name: i.name })),
    [referenceItems]
  )

  // + 按钮: 在画布上新建 image input 节点 + 连线
  const handlePickFiles = useCallback((files) => {
    if (!node?.id) return
    const remain = 10 - referenceItems.length
    if (remain <= 0) {
      message.warning('参考图最多 10 张')
      return
    }
    const accepted = Array.from(files).slice(0, remain)

    const capX = node.position?.x ?? 0
    const capY = node.position?.y ?? 0
    const NEW_NODE_W = 348
    const NODE_GAP = 60
    const COL_GAP = 30
    const existingImageEdgeCount = edges
      .filter(e => e.target === node.id && e.targetHandle === 'image').length

    accepted.forEach((file, i) => {
      const slotIndex = existingImageEdgeCount + i
      const newNode = createInputNode(
        'image',
        {
          x: capX - NEW_NODE_W - NODE_GAP - slotIndex * (NEW_NODE_W + COL_GAP),
          y: capY,
        },
        {
          content: { uploading: true },
          name: file.name,
        },
      )
      const newEdgeId = `edge-${newNode.id}-${node.id}-image`
      const newEdge = {
        id: newEdgeId,
        source: newNode.id,
        sourceHandle: 'image',
        target: node.id,
        targetHandle: 'image',
        type: 'custom',
      }

      facade.batchUpdateNodes(nds => [
        ...nds.map(n => (n.id === node.id
          ? { ...n, data: addConnection(n.data, 'image', { source: newNode.id, sourceHandle: 'image' }, true) }
          : n)),
        newNode,
      ])
      facade.batchUpdateEdges(eds => [...eds, newEdge])

      uploader.uploadFile(file)
        .then(result => {
          facade.batchUpdateNodes(nds => nds.map(n => (
            n.id === newNode.id
              ? { ...n, data: { ...n.data, content: { url: result.url, fileName: file.name } } }
              : n
          )))
        })
        .catch(err => {
          message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
          facade.batchUpdateNodes(nds => nds
            .filter(n => n.id !== newNode.id)
            .map(n => (n.id === node.id
              ? { ...n, data: removeConnection(n.data, 'image', newNode.id, 'image') }
              : n))
          )
          facade.batchUpdateEdges(eds => eds.filter(e => e.id !== newEdgeId))
        })
    })
  }, [node, edges, referenceItems.length, facade, uploader])

  const handleDeleteReference = useCallback((item) => {
    if (item.source !== 'edge' || !item.edgeId) return
    facade.batchUpdateEdges(eds => eds.filter(e => e.id !== item.edgeId))
    if (item.uploading && item.sourceNodeId) {
      facade.batchUpdateNodes(nds => nds.filter(n => n.id !== item.sourceNodeId))
    }
  }, [facade])

  const handleInsertToken = useCallback((globalIndex) => {
    promptEditorRef.current?.insertToken(globalIndex)
  }, [])

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
    onChange: (val) => onParamsChange({ prompt: val }),
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

  // mask 上传
  const handleMaskClick = useCallback(() => {
    maskInputRef.current?.click()
  }, [])

  const handleMaskFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const result = await uploader.uploadFile(file)
      onParamsChange({ mask_url: result.url })
    } catch (err) {
      message.error(`蒙版上传失败: ${err?.message || '未知错误'}`)
    }
  }, [uploader, onParamsChange])

  const handleMaskDelete = useCallback(() => {
    onParamsChange({ mask_url: null })
  }, [onParamsChange])

  // Run
  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (referenceItems.some(i => i.uploading)) {
      message.warning('参考图还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, referenceItems])

  const isModal = variant === 'modal'
  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body gi2-dp-full">
      {/* 顶栏 */}
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* 参考图行 */}
      <DockedReferenceRow
        items={referenceItems}
        max={10}
        showAddButton
        onPickFiles={handlePickFiles}
        onDelete={handleDeleteReference}
        onInsertToken={handleInsertToken}
      />

      {/* prompt — 支持参考图 @图像N + 文本端口连入 chip 共存 */}
      <div className={`gi2-dp-prompt-wrap${isModal ? ' modal' : ''}`}>
        <RichPromptEditor
          ref={promptEditorRef}
          prompt={params.prompt || ''}
          referenceImages={richReferenceImages}
          onPromptChange={(text) => onParamsChange({ prompt: text })}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          placeholder="描述想要生成的图像，可输入 @图像N 内联引用参考图..."
        />
      </div>

      {/* 底栏 */}
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

      {/* 高级区: MASK + OUTPUT FORMAT + BACKGROUND + SEED (完整版才有) */}
      {showAdvanced && mode === 'gpt-image-2' && (
        <>
          <div className="gi2-dp-divider" />
          <div className="gi2-dp-section-title">高级（capability 私有参数）</div>
          <div className="gi2-dp-advanced">
            <div className="gi2-dp-adv-item gi2-dp-adv-mask">
              <div className="gi2-dp-adv-label">MASK</div>
              {params.mask_url ? (
                <div className="gi2-dp-mask-row has-content">
                  <img src={maskDisplayUrl} alt="mask" onError={maskMarkError} />
                  <span className="gi2-dp-mask-row-text">已上传蒙版图</span>
                  <button
                    type="button"
                    className="gi2-dp-mask-row-x"
                    onClick={handleMaskDelete}
                    aria-label="删除蒙版"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="gi2-dp-mask-row placeholder"
                  onClick={handleMaskClick}
                >
                  <UploadIcon size={14} />
                  <span>上传蒙版图</span>
                </button>
              )}
              <input
                ref={maskInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleMaskFileChange}
              />
            </div>
            <div className="gi2-dp-adv-item">
              <div className="gi2-dp-adv-label">OUTPUT FORMAT</div>
              <Segmented
                size="small"
                value={params.output_format || 'png'}
                onChange={(v) => onParamsChange({ output_format: v })}
                options={OUTPUT_FORMAT_OPTIONS}
              />
            </div>
            <div className="gi2-dp-adv-item">
              <div className="gi2-dp-adv-label">BACKGROUND</div>
              <Segmented
                size="small"
                value={params.background || 'auto'}
                onChange={(v) => onParamsChange({ background: v })}
                options={BACKGROUND_OPTIONS}
              />
            </div>
            <div className="gi2-dp-adv-item gi2-dp-adv-seed">
              <div className="gi2-dp-adv-label">SEED</div>
              <InputNumber
                size="small"
                value={params.seed ?? null}
                onChange={(v) => onParamsChange({ seed: v })}
                style={{ width: 140 }}
                placeholder="随机"
              />
              <Tooltip title="随机种子">
                <button
                  type="button"
                  className="docked-icon-btn"
                  onClick={() => onParamsChange({ seed: Math.floor(Math.random() * 1_000_000) })}
                  aria-label="随机 seed"
                >
                  <Shuffle size={14} />
                </button>
              </Tooltip>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
