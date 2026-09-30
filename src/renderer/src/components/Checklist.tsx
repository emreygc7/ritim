import { useState } from 'react'
import { newId } from '@shared/normalize'
import { checklistOn, isChecked } from '@shared/schedule'
import { checklistStreak } from '@shared/stats'
import type { AppData, ChecklistItem, Weekday } from '@shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'

const ALL: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/** Today page: the day's checklist with tick boxes. */
export function ChecklistCard({ dayKey }: { dayKey: string }) {
  const { data, update, t } = useStore()
  const items = checklistOn(data, dayKey)
  if (items.length === 0) return null
  const done = items.filter((c) => isChecked(data, dayKey, c.id)).length

  const toggle = (id: string): void =>
    update((d): AppData => {
      const day = new Set(d.checks[dayKey] ?? [])
      if (day.has(id)) day.delete(id)
      else day.add(id)
      const checks = { ...d.checks }
      if (day.size) checks[dayKey] = [...day]
      else delete checks[dayKey]
      return { ...d, checks }
    })

  return (
    <section className="card checklist-card">
      <div className="checklist-head">
        <h2>{t('checklist.title')}</h2>
        <span className="muted small">{t('checklist.progress', { m: done, n: items.length })}</span>
      </div>
      <ul className="checklist">
        {items.map((c) => {
          const checked = isChecked(data, dayKey, c.id)
          return (
            <li key={c.id} className={checked ? 'checked' : ''}>
              <label className="check">
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                <span className="checklist-text">{c.text || t('checklist.placeholder')}</span>
              </label>
              <span className="checklist-meta">
                {(() => {
                  const n = checklistStreak(data, c.id, dayKey)
                  return n >= 2 ? (
                    <span className="streak" title={t('checklist.streak', { n })}>
                      <Icon name="flame" size={13} />
                      {n}
                    </span>
                  ) : null
                })()}
                {c.time && <span className="checklist-time">{c.time}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Week page: create and edit checklist items. */
export function ChecklistEditor() {
  const { data, update, t } = useStore()
  const [armed, setArmed] = useState<string | null>(null)

  const edit = (id: string, patch: Partial<ChecklistItem>): void =>
    update((d) => ({ ...d, checklist: d.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  const add = (): void =>
    update((d) => ({ ...d, checklist: [...d.checklist, { id: newId(), text: '', days: ALL, time: null }] }))

  const remove = (id: string): void => {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    update((d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== id) }))
  }

  const toggleDay = (c: ChecklistItem, day: Weekday): void => {
    const days = c.days.includes(day) ? c.days.filter((x) => x !== day) : ([...c.days, day].sort() as Weekday[])
    // An item needs at least one day; ignore unticking the last one.
    if (days.length) edit(c.id, { days })
  }

  return (
    <section className="card checklist-editor">
      <h2>{t('checklist.title')}</h2>
      <p className="muted small">{t('checklist.hint')}</p>
      {data.checklist.length === 0 && <p className="muted">{t('checklist.empty')}</p>}
      <ul>
        {data.checklist.map((c) => (
          <li key={c.id}>
            <input
              className="checklist-input"
              value={c.text}
              maxLength={160}
              placeholder={t('checklist.placeholder')}
              aria-label={t('checklist.title')}
              onChange={(e) => edit(c.id, { text: e.target.value })}
            />
            <div className="day-picker small">
              {ALL.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip${c.days.includes(d) ? ' on' : ''}`}
                  aria-pressed={c.days.includes(d)}
                  onClick={() => toggleDay(c, d)}
                >
                  {t.dayShort[d - 1]}
                </button>
              ))}
            </div>
            <input
              type="time"
              className="checklist-time-input"
              value={c.time ?? ''}
              title={t('checklist.time')}
              aria-label={t('checklist.time')}
              onChange={(e) => edit(c.id, { time: e.target.value || null })}
            />
            <button
              className={`icon-btn subtle${armed === c.id ? ' armed' : ''}`}
              onClick={() => remove(c.id)}
              title={armed === c.id ? t('editor.confirmDelete') : t('editor.delete')}
              aria-label={armed === c.id ? t('editor.confirmDelete') : t('editor.delete')}
            >
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={add}>
        <Icon name="plus" size={16} />
        {t('checklist.add')}
      </button>
    </section>
  )
}
