import { createContext, useContext } from 'react'

export const CanvasIdContext = createContext(null)

export function useCanvasId() {
  return useContext(CanvasIdContext)
}
