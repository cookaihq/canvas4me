/**
 * 暂不支持的 capability 面板占位 —— 在面板视图替换正式表单。
 *
 * 用于:
 *   - midjourney(上游暂无端点)
 *   - image-upscale(上游暂无端点)
 *   - seedance legacy(建议用 seedance-2 替代)
 *
 * 用法:
 *   import OssUnsupportedPlaceholder from '@/capabilities/_shared/OssUnsupportedPlaceholder'
 *
 *   return (
 *     <OssUnsupportedPlaceholder
 *       label="Midjourney"
 *       reason="上游 API 暂未提供 Midjourney 端点"
 *       alternatives={[
 *         { id: 'nano-banana', label: 'Nano Banana(通用图像生成)' },
 *         { id: 'wan-image',   label: 'Wan Image(高质量图像)' },
 *       ]}
 *     />
 *   )
 */
export default function OssUnsupportedPlaceholder({ label, reason, alternatives }) {
  return (
    <div
      style={{
        padding: 20,
        textAlign: 'center',
        color: '#9998B3',
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#605F77' }}>
        {label || '该能力'} 暂不支持
      </p>
      {reason && (
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>
          {reason}
        </p>
      )}
      {Array.isArray(alternatives) && alternatives.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <p style={{ margin: '0 0 4px', color: '#605F77' }}>建议替代：</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {alternatives.map((alt) => (
              <li key={alt.id} style={{ margin: '2px 0' }}>
                · {alt.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
