import { Eye, Play, Film } from '@/canvas/icons'
import { Field } from './Field.jsx'
import { resolveMediaForm } from './mediaForm.js'

function Card({ item, onRemove, onView }) {
  const { type, uploading } = item
  const canView = onView && !uploading
  let thumb
  if (type === 'audio') thumb = (
    <span className="ac-media__thumb ac-media__thumb--audio">
      ♪
      {canView && <button type="button" className="ac-media__view" aria-label="试听" onClick={onView}><Play size={14} /></button>}
    </span>
  )
  else if (type === 'video') thumb = (
    <span className="ac-media__thumb">
      {item.thumb ? <video src={item.thumb} muted preload="metadata" playsInline /> : null}
      <span className="ac-media__film"><Film size={11} /></span>
      {canView && <button type="button" className="ac-media__view" aria-label="预览" onClick={onView}><Play size={14} /></button>}
    </span>
  )
  else if (type === 'file') thumb = <span className="ac-media__thumb" />
  else thumb = (
    <span className="ac-media__thumb">
      {item.thumb ? <img src={item.thumb} alt="" /> : null}
      {canView && item.thumb && (
        <button type="button" className="ac-media__view" aria-label="查看" onClick={onView}><Eye size={14} /></button>
      )}
    </span>
  )
  return (
    <div className={type === 'audio' ? 'ac-media ac-media--audio' : 'ac-media'} data-loading={uploading || undefined}>
      {thumb}
      <div>
        <div className="ac-media__name">{item.name}</div>
        {uploading
          ? <div className="ac-media__meta"><span className="ac-spinner ac-spinner--sm" />上传中…</div>
          : (item.meta && <div className="ac-media__meta">{item.meta}</div>)}
      </div>
      <button type="button" className="ac-media__remove" aria-label="删除" onClick={onRemove}>✕</button>
    </div>
  )
}

function Thumb({ item, onRemove, onView, onReplace }) {
  return (
    <span className="ac-thumb" data-loading={item.uploading || undefined}>
      {item.thumb ? <img src={item.thumb} alt="" /> : null}
      {item.uploading && <span className="ac-spinner ac-thumb__spinner" />}
      <button type="button" className="ac-thumb__remove" aria-label="删除" onClick={onRemove}>✕</button>
      <span className="ac-thumb__overlay">
        {onReplace && <button type="button" className="ac-thumb__action" aria-label="替换" onClick={onReplace}>↺</button>}
        {onView && <button type="button" className="ac-thumb__action ac-thumb__action--view" aria-label="查看" onClick={onView}><Eye size={14} /></button>}
      </span>
    </span>
  )
}

export function MediaInputField({
  label, required, badge, help, type = 'image', maxCount = 1, form,
  value, uploadText = '上传文件', onAdd, onRemove, onView, onReplace,
}) {
  const resolved = resolveMediaForm({ maxCount, form })
  const items = Array.isArray(value) ? value : value ? [value] : []

  if (resolved === 'thumb') {
    return (
      <Field label={label} required={required} badge={badge} help={help} full>
        <div className="ac-thumbs">
          {items.map((item, i) => (
            <Thumb
              key={item.id ?? i}
              item={item}
              onRemove={() => onRemove && onRemove(item, i)}
              onView={onView && (() => onView(item, i))}
              onReplace={onReplace && (() => onReplace(item, i))}
            />
          ))}
          {items.length < maxCount && (
            <button type="button" className="ac-thumb ac-thumb--add" aria-label="添加" onClick={onAdd}>＋</button>
          )}
        </div>
      </Field>
    )
  }

  return (
    <Field label={label} required={required} badge={badge} help={help}>
      {items[0] ? (
        <Card
          item={{ ...items[0], type }}
          onRemove={() => onRemove && onRemove(items[0], 0)}
          onView={onView && (() => onView(items[0], 0))}
        />
      ) : (
        <button type="button" className="ac-media-empty" onClick={onAdd}>⬆ {uploadText}</button>
      )}
    </Field>
  )
}
