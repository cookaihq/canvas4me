import { useEffect, useRef } from 'react'

/**
 * 让滚动容器在 enabled 为 true 时吸附在底部。
 *
 * 行为：
 * - enabled 开启时：每次 trigger 变化，若容器当前处于底部附近则自动滚到底部
 * - 用户向上滚动（离开底部阈值）后，暂停自动滚动
 * - 用户再次滚回底部，恢复自动滚动
 *
 * @param {React.RefObject<HTMLElement>} ref  可滚动容器 ref
 * @param {any}                          trigger 内容变化的触发值（通常传入 text）
 * @param {boolean}                      enabled 是否启用（流式态为 true）
 * @param {number}                       threshold 距底部的像素阈值，默认 24
 */
export default function useStickToBottom(ref, trigger, enabled, threshold = 24) {
  const stickRef = useRef(true)

  // 监听用户滚动，判断是否还在底部
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickRef.current = distance <= threshold
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [enabled, ref, threshold])

  // enabled 由 false 变 true 时，默认吸底
  useEffect(() => {
    if (enabled) stickRef.current = true
  }, [enabled])

  // trigger 变化时，若仍吸底则滚到最底
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [trigger, enabled, ref])
}
