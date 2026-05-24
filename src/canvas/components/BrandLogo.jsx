/**
 * 左上角品牌浮层 — accent 色魔杖 icon + "AI Canvas" 文字。
 * 通过 extra slot 可以在 logo 右边挂载额外浮层(如 GitHub 链接)。
 *
 * @param {{ extra?: React.ReactNode }} props
 */

const WandSparklesIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
    <path d="m14 7 3 3" />
    <path d="M5 6v4" />
    <path d="M19 14v4" />
    <path d="M10 2v2" />
    <path d="M7 8H3" />
    <path d="M21 16h-4" />
    <path d="M11 3H9" />
  </svg>
)

export default function BrandLogo({ extra }) {
  return (
    <div className="ai-canvas-brand-logo">
      <span className="ai-canvas-brand-logo-mark">
        <WandSparklesIcon />
        <span className="ai-canvas-brand-logo-name">Canvas4me</span>
      </span>
      {extra}
    </div>
  )
}
