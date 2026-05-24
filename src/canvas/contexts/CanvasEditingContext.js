import { createContext, useContext } from 'react'

/**
 * 暴露给画布内部组件的只读态判定。
 *
 * value: { isEditing: boolean }
 *   - true:  画布处于编辑模式,可修改节点(包括改名、删除、连线等)
 *   - false: 画布处于只读模式,所有修改类交互必须禁用
 *
 * 节点级 `data.locked`(运行后的单节点锁)不在此范围内,由各渲染器自行处理。
 */
export const CanvasEditingContext = createContext({
  isEditing: true,
})

export function useCanvasEditing() {
  return useContext(CanvasEditingContext)
}
