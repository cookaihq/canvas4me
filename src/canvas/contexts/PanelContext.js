import { createContext, useContext } from 'react'

/**
 * 暴露给画布内部组件（能力节点、卡片 chip 等）主动打开右侧面板的能力。
 *
 * value 形如:
 *   - openPanel(nodeId): 打开指定节点的右侧面板
 *
 * 使用场景：
 * - CapabilityCardInitialPicker 点击 chip 选中子能力后，自动打开面板让用户立刻填参
 */
export const PanelContext = createContext({
  openPanel: () => {},
})

export function usePanelContext() {
  return useContext(PanelContext)
}
