import { useEffect, useRef, useState } from 'react'
import { newId } from '@shared/normalize'
import { findOverlaps } from '@shared/schedule'
import { isValidHM, parseHM } from '@shared/time'
import type { Block, OneOff, Reminders, Weekday } from '@shared/types'
import { useStore } from '../store'

export type EditorTarget =
  | { mode: 'block'; block: Partial<Block> }
  | { mode: 'oneoff'; oneOff: Partial<OneOff> }

const ALL: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export function BlockEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const { data, update, t } = useStore()
  const src = target.mode === 'block' ? target.block : target.oneOff
  const isNew = !src.id
  const [title, setTitle] = useState(src.title ?? '')
  const [categoryId, setCategoryId] = useState(src.categoryId ?? data.categories[0]?.id ?? '')
  const [days, setDays] = useState<Weekday[]>(target.mode === 'block' ? (target.block.days ?? []) : [])
  const [date, setDate] = useState(target.mode === 'oneoff' ? (target.oneOff.date ?? '') : '')
  const [start, setStart] = useState(src.start ?? '09:00')
  const [end, setEnd] = useState(src.end ?? '10:00')
  const [note, setNote] = useState(src.note ?? '')
  const [custom, setCustom] = useState<Reminders | null>(src.reminders ?? null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Parents pass a new onClose on every render (the clock ticks), so keep it in a
  // ref and focus the first field only once.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const validTimes = isValidHM(start) && isValidHM(end) && parseHM(start) !== parseHM(end)
  const overnight = validTimes && parseHM(end) < parseHM(start)
  const overlaps =
    target.mode === 'block' && validTimes && days.length
      ? findOverlaps(data.blocks, { id: src.id ?? '', days, start, end })
      : []

  const toggleDay = (d: Weekday): void =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() as Weekday[]))

  function save(): void {
    if (!title.trim()) return setError(t('editor.errTitle'))
    if (!categoryId) return setError(t('editor.errCategory'))
    if (!validTimes) return setError(t('editor.errTime'))
    if (target.mode === 'block' && days.length === 0) return setError(t('editor.errDays'))
    if (target.mode === 'oneoff' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(t('editor.errDate'))
    const base = {
      id: src.id ?? newId(),
      title: title.trim(),
      categoryId,
      start,
      end,
      reminders: custom,
      ...(note.trim() ? { note: note.trim() } : {})
    }
    update((d) => {
      if (target.mode === 'block') {
        const block: Block = { ...base, days }
        return { ...d, blocks: isNew ? [...d.blocks, block] : d.blocks.map((b) => (b.id === block.id ? block : b)) }
      }
      const one: OneOff = { ...base, date }
      return { ...d, oneOffs: isNew ? [...d.oneOffs, one] : d.oneOffs.map((o) => (o.id === one.id ? one : o)) }
    })
    onClose()
  }

  function remove(): void {
    if (!confirmDelete) return setConfirmDelete(true)
    update((d) =>
      target.mode === 'block'
        ? { ...d, blocks: d.blocks.filter((b) => b.id !== src.id) }
        : { ...d, oneOffs: d.oneOffs.filter((o) => o.id !== src.id) }
    )
    onClose()
  }

  const heading =
    target.mode === 'oneoff' ? t('editor.newOnce') : isNew ? t('editor.newBlock') : t('editor.editBlock')
  const defaults = data.settings.defaultReminders

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" ref={dialogRef}>
        <h2 id="editor-title">{heading}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="field">
            <span>{t('editor.title')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </label>

          <label className="field">
            <span>{t('editor.category')}</span>
            <div className="select-wrap">
              <span className="dot" style={{ background: data.categories.find((c) => c.id === categoryId)?.color }} />
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {target.mode === 'block' ? (
            <div className="field">
              <span>{t('editor.days')}</span>
              <div className="day-picker">
                {ALL.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`chip${days.includes(d) ? ' on' : ''}`}
                    aria-pressed={days.includes(d)}
                    onClick={() => toggleDay(d)}
                  >
                    {t.dayShort[d - 1]}
                  </button>
                ))}
              </div>
              <div className="quick-days">
                <button type="button" className="link" onClick={() => setDays([1, 2, 3, 4, 5])}>
                  {t('editor.weekdays')}
                </button>
                <button type="button" className="link" onClick={() => setDays([6, 7])}>
                  {t('editor.weekend')}
                </button>
                <button type="button" className="link" onClick={() => setDays(ALL)}>
                  {t('editor.everyday')}
                </button>
              </div>
            </div>
          ) : (
            <label className="field">
              <span>{t('editor.date')}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          )}

          <div className="row">
            <label className="field">
              <span>{t('editor.start')}</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <label className="field">
              <span>{t('editor.end')}</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>
          {overnight && <p className="hint">↪ {t('editor.overnight')}</p>}
          {overlaps.length > 0 && (
            <p className="hint warn">{t('editor.overlap', { list: overlaps.map((b) => b.title).join(', ') })}</p>
          )}

          <label className="field">
            <span>{t('editor.note')}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
          </label>

          <fieldset className="field reminders">
            <legend>{t('editor.reminders')}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={custom === null}
                onChange={(e) => setCustom(e.target.checked ? null : { ...defaults })}
              />
              {t('editor.useDefault')}
            </label>
            {custom && <ReminderFields value={custom} onChange={setCustom} />}
          </fieldset>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="modal-actions">
            {!isNew && (
              <button type="button" className={`btn danger${confirmDelete ? ' armed' : ''}`} onClick={remove}>
                {confirmDelete ? t('editor.confirmDelete') : t('editor.delete')}
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              {t('editor.cancel')}
            </button>
            <button type="submit" className="btn primary">
              {t('editor.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ReminderFields({ value, onChange }: { value: Reminders; onChange: (r: Reminders) => void }) {
  const { t } = useStore()
  const minutes = (v: string): number | null => {
    const n = Number(v)
    return v === '' || !Number.isFinite(n) || n <= 0 ? null : Math.min(Math.round(n), 720)
  }
  return (
    <div className="reminder-fields">
      <label className="inline">
        <input
          type="number"
          min={0}
          max={720}
          value={value.beforeStart ?? ''}
          placeholder={t('editor.off')}
          onChange={(e) => onChange({ ...value, beforeStart: minutes(e.target.value) })}
        />
        {t('editor.beforeStart')}
      </label>
      <label className="check">
        <input type="checkbox" checked={value.atStart} onChange={(e) => onChange({ ...value, atStart: e.target.checked })} />
        {t('editor.atStart')}
      </label>
      <label className="inline">
        <input
          type="number"
          min={0}
          max={720}
          value={value.beforeEnd ?? ''}
          placeholder={t('editor.off')}
          onChange={(e) => onChange({ ...value, beforeEnd: minutes(e.target.value) })}
        />
        {t('editor.beforeEnd')}
      </label>
    </div>
  )
}
