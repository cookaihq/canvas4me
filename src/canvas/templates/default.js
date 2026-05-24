/**
 * 默认示例模板
 * 新建画布时，如果用户开启了"示例模板"设置，会预填这些节点
 */
export const defaultTemplate = {
  nodes: [
    {
      id: 'tpl-input-text-1',
      type: 'input',
      position: { x: 80, y: 120 },
      data: {
        subType: 'text',
        label: '提示词',
        content: { text: '请帮我写一首关于春天的诗' },
        locked: false,
      },
      style: { width: 200, height: 100 },
    },
    {
      id: 'tpl-capability-llm-1',
      type: 'capability',
      position: { x: 380, y: 100 },
      data: {
        nodeType: 'llm',
        capability: 'llm',
        mode: 'llm-custom',
        label: '大语言模型',
        modeParams: {},
        portConnections: {
          prompt: { source: 'tpl-input-text-1', sourceHandle: 'text' },
        },
        runStatus: 'idle',
        locked: false,
      },
      style: { width: 220, height: 176 },
    },
  ],
  edges: [
    {
      id: 'tpl-edge-1',
      source: 'tpl-input-text-1',
      sourceHandle: 'text',
      target: 'tpl-capability-llm-1',
      targetHandle: 'prompt',
      type: 'custom',
    },
  ],
}
