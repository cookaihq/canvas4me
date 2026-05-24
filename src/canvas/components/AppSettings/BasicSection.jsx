import { useEffect } from 'react'
import { Form, Switch } from 'antd'
import { useSettings } from '@/platform/provider.jsx'

const APP_ID = 'ai-canvas'

/**
 * AI Canvas 基础设置子区
 */
export default function BasicSection({ form, config }) {
  const settings = useSettings()
  useEffect(() => {
    if (config) {
      form.setFieldsValue({
        newCanvasWithTemplate: config.newCanvasWithTemplate !== false,
        debugMode: config.debugMode === true,
        browseMode: config.browseMode === true,
      })
    }
  }, [config, form])

  const handleChange = (field, value) => {
    settings.updateApp(APP_ID, { [field]: value })
  }

  return (
    <div className="ai-canvas-settings-section">
      <h3 className="ai-canvas-settings-section-title">基础</h3>
      <Form.Item
        name="newCanvasWithTemplate"
        label="新建画布时加载示例模板"
        valuePropName="checked"
      >
        <Switch onChange={(v) => handleChange('newCanvasWithTemplate', v)} />
      </Form.Item>

      <Form.Item
        name="debugMode"
        label="调试模式"
        extra="开启后，结果面板顶部会展示节点完整数据与最近一次轮询结果"
        valuePropName="checked"
      >
        <Switch onChange={(v) => handleChange('debugMode', v)} />
      </Form.Item>

      <Form.Item
        name="browseMode"
        label="浏览模式"
        extra="开启后，选中能力节点时不弹出底部参数面板，适合纯浏览场景"
        valuePropName="checked"
      >
        <Switch onChange={(v) => handleChange('browseMode', v)} />
      </Form.Item>
    </div>
  )
}
