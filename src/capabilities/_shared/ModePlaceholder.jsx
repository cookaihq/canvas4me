/**
 * 未接入 API 的 capability / mode 的面板占位内容。
 * 每个具体 capability 或 mode 仍然各自拥有独立的 jsx 文件（保持三层结构约束），
 * 内部只渲染一行"即将上线"文字。真正的表单在 per-cap 接入时在各自文件内补写。
 */
export default function ModePlaceholder({ label }) {
  return (
    <div style={{ padding: 16, textAlign: 'center', color: '#9998B3' }}>
      <p style={{ margin: 0, fontSize: 13 }}>{label || '该模式'} 即将上线</p>
    </div>
  )
}
