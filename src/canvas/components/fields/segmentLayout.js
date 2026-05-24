// SegmentControl 标题位置决策：选项 <=3 且都短 -> inline(标题在左)；否则 block(标题在上)。
// 中文字符按 2 计宽，ASCII 按 1 计。
function isShortLabel(label) {
  const str = String(label ?? '')
  let width = 0
  for (const char of str) {
    width += /[一-鿿]/.test(char) ? 2 : 1
  }
  return width <= 4
}
export function resolveSegmentLayout(options = []) {
  const count = options.length
  const allShort = options.every((o) => isShortLabel(o && o.label != null ? o.label : o))
  return count <= 3 && allShort ? 'inline' : 'block'
}
