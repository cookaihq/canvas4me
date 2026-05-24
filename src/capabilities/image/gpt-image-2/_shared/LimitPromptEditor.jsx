import { useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Popover } from 'antd'
import { Pencil, Eraser, HelpCircle } from '@/canvas/icons'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import './rich-prompt-editor.css'

const HELP_CONTENT = (
  <div className="gi2-prompt-help">
    <div className="gi2-prompt-help-title">limit 模式 Prompt 推荐写法</div>
    <pre className="gi2-prompt-help-code">
{`[第一张图的<描述特征>]
[第二张图的<描述特征>]
[第三张图的<描述特征>]
+ 动作/关系语义（"X 在 Y 上"，"把 X 替换成 Y"）`}
    </pre>
    <div className="gi2-prompt-help-tip">
      点击参考图上的 <b>+</b> 可在光标位置插入「第X张图片&lt;图片描述&gt;」占位文本，再把尖括号里的内容替换成具体描述即可。
    </div>
  </div>
)

/**
 * Limit Prompt 输入区:用 TextInputWithEdges (支持文本端口连入 chip + 手输混排),
 * 不再用 textarea。
 * 参考图 token 在此 mode 是字面文本("第N张图片<图片描述>"),不是富文本 chip,
 * 通过 insertText ref API 插到光标处。
 */
const LimitPromptEditor = forwardRef(function LimitPromptEditor({
  prompt,
  onPromptChange,
  nodes,
  onChipDelete,
  disabled = false,
  placeholder = '描述想要生成的图像，每张参考图一段描述特征，最后加一句动作/关系语义...',
}, ref) {
  const editorRef = useRef(null)

  const handleClear = useCallback(() => {
    onPromptChange('')
    editorRef.current?.focus()
  }, [onPromptChange])

  useImperativeHandle(ref, () => ({
    insertText: (text) => editorRef.current?.insertText(text),
  }), [])

  const isEmpty = !prompt?.trim()

  return (
    <div className="gi2-prompt-section">
      <div className="gi2-prompt-header">
        <span className="gi2-prompt-title">
          <Pencil size={13} style={{ marginRight: 6 }} />
          Prompt
          <Popover
            content={HELP_CONTENT}
            trigger="click"
            placement="rightTop"
            overlayClassName="gi2-prompt-help-popover"
          >
            <button
              type="button"
              className="gi2-prompt-help-btn"
              aria-label="Prompt 写法帮助"
            >
              <HelpCircle size={14} />
            </button>
          </Popover>
        </span>
        {!isEmpty && !disabled && (
          <button type="button" className="gi2-prompt-clear" onClick={handleClear}>
            <Eraser size={13} style={{ marginRight: 4 }} />
            清空
          </button>
        )}
      </div>
      <div className={`gi2-prompt-box${disabled ? ' disabled' : ''}`}>
        <TextInputWithEdges
          ref={editorRef}
          value={prompt || ''}
          onChange={onPromptChange}
          nodes={nodes}
          onChipDelete={onChipDelete}
          disabled={disabled}
          placeholder={placeholder}
          variant="inline"
        />
      </div>
    </div>
  )
})

export default LimitPromptEditor
