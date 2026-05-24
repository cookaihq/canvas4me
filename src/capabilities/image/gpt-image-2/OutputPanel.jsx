import { useCallback } from 'react'
import { Button, Tag, Collapse } from 'antd'
import { RotateCw } from '@/canvas/icons'
import ImagePanel from '@/canvas/panels/content/ImagePanel'
import './_shared/rich-prompt-editor.css'

/**
 * GPT Image 2 输出面板
 *
 * 一节点一图: 用 ImagePanel 直接展示. num_outputs > 1 由 expandRuns 拆到多个独立产物节点,
 * 此处不再做 thumbnails gallery (画布上每个节点已经是独立的一张图).
 */
export default function GptImage2OutputPanel({ node, onRerun }) {
  const { sourceCapability, inputSnapshot, runStatus } = node.data || {}
  const sourceCapabilityId = node.data?.sourceCapabilityId ?? node.data?.sourceAbilityId

  const handleRerun = useCallback(() => {
    if (sourceCapabilityId && onRerun) onRerun(sourceCapabilityId)
  }, [sourceCapabilityId, onRerun])

  return (
    <div className="panel-output">
      <div className="panel-output-source">
        <Tag>{sourceCapability || 'gpt-image-2'}</Tag>
        {runStatus === 'running' && <Tag color="processing">生成中</Tag>}
        {runStatus === 'polling' && <Tag color="warning">轮询中</Tag>}
        {runStatus === 'done' && <Tag color="success">已完成</Tag>}
        {runStatus === 'error' && <Tag color="error">失败</Tag>}
      </div>

      <div className="panel-output-content">
        <ImagePanel node={node} />
      </div>

      {inputSnapshot && (
        <Collapse
          size="small"
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'snapshot',
              label: '输入参数回溯',
              children: (
                <div className="panel-llm-snapshot">
                  {inputSnapshot.params && (
                    <div className="panel-llm-snapshot-section">
                      <div className="panel-llm-snapshot-label">面板配置</div>
                      <pre className="panel-llm-snapshot-pre">
                        {JSON.stringify(inputSnapshot.params, null, 2)}
                      </pre>
                    </div>
                  )}
                  {inputSnapshot.inputs && Object.keys(inputSnapshot.inputs).length > 0 && (
                    <div className="panel-llm-snapshot-section">
                      <div className="panel-llm-snapshot-label">连线输入</div>
                      {Object.entries(inputSnapshot.inputs).map(([key, val]) => (
                        <div key={key} className="panel-llm-snapshot-item">
                          <Tag>{key}</Tag>
                          <span className="panel-llm-snapshot-value">
                            {Array.isArray(val)
                              ? val.map(v => v.label || v.nodeId).join(', ')
                              : val?.label || val?.nodeId || '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {sourceCapabilityId && (
        <div className="panel-output-rerun">
          <Button
            icon={<RotateCw size={14} />}
            onClick={handleRerun}
            disabled={runStatus === 'running' || runStatus === 'polling'}
          >
            重新生成
          </Button>
        </div>
      )}
    </div>
  )
}
