import { useCallback } from 'react'
import { Button, Tag, Collapse } from 'antd'
import { RotateCw } from '@/canvas/icons'
import VideoPanel from '@/canvas/panels/content/VideoPanel'

/**
 * creatify-aurora 输出面板 — debugMode 下点节点上方 "输出" 按钮弹出
 *
 * 复用通用 VideoPanel 渲染视频本体, 加输入参数回溯 + 重新生成按钮.
 */
export default function CreatifyAuroraOutputPanel({ node, onRerun }) {
  const { sourceCapability, inputSnapshot, runStatus } = node.data || {}
  const sourceCapabilityId = node.data?.sourceCapabilityId ?? node.data?.sourceAbilityId

  const handleRerun = useCallback(() => {
    if (sourceCapabilityId && onRerun) onRerun(sourceCapabilityId)
  }, [sourceCapabilityId, onRerun])

  return (
    <div className="panel-output">
      <div className="panel-output-source">
        <Tag>{sourceCapability || 'creatify-aurora'}</Tag>
        {runStatus === 'running' && <Tag color="processing">生成中</Tag>}
        {runStatus === 'polling' && <Tag color="warning">轮询中</Tag>}
        {runStatus === 'done' && <Tag color="success">已完成</Tag>}
        {runStatus === 'error' && <Tag color="error">失败</Tag>}
      </div>

      <div className="panel-output-content">
        <VideoPanel node={node} />
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
