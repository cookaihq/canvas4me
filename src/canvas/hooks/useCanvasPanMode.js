import { useEffect, useState } from 'react'

/**
 * 画布平移模式 hook
 *
 * 两种触发:
 *   - 空格键按住(临时): 按下激活 / 松开恢复
 *   - 工具栏抓手按钮(持久): isHandTool toggle
 *
 * isPanActive = isHandTool || isSpacePressed
 *
 * 在可编辑元素(input/textarea/contenteditable)上按空格不触发,避免影响输入。
 */
export default function useCanvasPanMode() {
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isHandTool, setIsHandTool] = useState(false)
  const isPanActive = isHandTool || isSpacePressed

  useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    const onKeyDown = (e) => {
      if (e.code !== 'Space') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      setIsSpacePressed(true)
    }
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return
      setIsSpacePressed(false)
    }
    const onBlur = () => setIsSpacePressed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return { isHandTool, setIsHandTool, isPanActive }
}
