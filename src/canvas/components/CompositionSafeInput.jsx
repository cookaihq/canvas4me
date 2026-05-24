import { useState, useRef, useEffect, memo } from 'react'
import { Input } from 'antd'

const { TextArea } = Input

/**
 * IME 安全的 TextArea — 解决中文/日文/韩文输入法在 React 受控组件中被打断的问题
 *
 * 原理：IME 组合期间只更新本地 state，组合结束后再调用外部 onChange。
 * 避免每次击键都触发 setNodes → React Flow 重渲染 → 打断 IME。
 */
function CompositionSafeTextArea({ value, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const composingRef = useRef(false)

  // 外部 value 变化时同步（非组合状态下）
  useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value ?? '')
    }
  }, [value])

  const handleChange = (e) => {
    const val = e.target.value
    setLocalValue(val)
    // 非 IME 组合期间，立即同步到外部
    if (!composingRef.current) {
      onChange?.(val)
    }
  }

  const handleCompositionStart = () => {
    composingRef.current = true
  }

  const handleCompositionEnd = (e) => {
    composingRef.current = false
    // 组合结束，同步最终值到外部
    onChange?.(e.target.value)
  }

  return (
    <TextArea
      {...props}
      value={localValue}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
}

/**
 * IME 安全的 Input（单行输入框）
 */
function CompositionSafeInputInner({ value, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const composingRef = useRef(false)

  useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value ?? '')
    }
  }, [value])

  const handleChange = (e) => {
    const val = e.target.value
    setLocalValue(val)
    if (!composingRef.current) {
      onChange?.(val)
    }
  }

  const handleCompositionStart = () => {
    composingRef.current = true
  }

  const handleCompositionEnd = (e) => {
    composingRef.current = false
    onChange?.(e.target.value)
  }

  return (
    <Input
      {...props}
      value={localValue}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
}

export const SafeTextArea = memo(CompositionSafeTextArea)
export const SafeInput = memo(CompositionSafeInputInner)
