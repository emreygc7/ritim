import { useEffect, useRef, useState } from 'react'
import { nowState, occurrencesOn } from '@shared/schedule'
import { dayStat } from '@shared/stats'
import { addDays, clockOf, formatDuration, fromDateKey, isoWeekday, toDateKey } from '@shared/time'
import type { AppData, Occurrence, Status } from '@shared/types'
import { BlockEditor, type EditorTarget } from '../components/BlockEditor'
import { Icon, type IconName } from '../components/Icon'
import { useStore } from '../store'

const STATUSES: { status: Status; icon: IconName; label: 'status.done' | 'status.partial' | 'status.skipped' }[] = [
  { status: 'done', icon: 'check', label: 'status.done' },
  { status: 'partial', icon: 'half', label: 'status.partial' },
  { status: 'skipped', icon: 'x', label: 'status.skipped' }
]

export function TodayPage() {
  const { data, update, t, now, category } = useStore()
  const todayKey = toDateKey(new Date(now))
  const [dayKey, setDayKey] = useState(todayKey)
  // If today was on screen when the date changed (app left open overnight), move along with it.
  const shownToday = useRef(todayKey)
  useEffect(() => {
    setDayKey((k) => (k === shownToday.current ? todayKey : k))
    shownToday.current = todayKey
  }, [todayKey])
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [openNote, setOpenNote] = useState<string | null>(null)
  const lang = data.settings.lang

  const occs = occurrencesOn(data, dayKey)
  const logs = data.logs[dayKey] ?? {}
  const hidden = data.hidden[dayKey] ?? []
  const stat = dayStat(data, dayKey, dayKey === todayKey ? now : Number.MAX_SAFE_INTEGER)
  const isToday = dayKey === todayKey

  const setLog = (id: string, status: Status | null, note?: string): void =>
    update((d): AppData => {
      const day = { ...(d.logs[dayKey] ?? {}) }
      if (status === null) delete day[id]
      else day[id] = { status, at: new Date().toISOString(), ...(note ? { note } : {}) }
      return { ...d, logs: { ...d.logs, [dayKey]: day } }
    })

  const hide = (id: string): void =>
    update((d) => ({ ...d, hidden: { ...d.hidden, [dayKey]: [...(d.hidden[dayKey] ?? []), id] } }))

  const restore = (): void =>
    update((d) => {
      const next = { ...d.hidden }
      delete next[dayKey]
      return { ...d, hidden: next }
    })

  const openEditor = (o: Occurrence): void => {
    if (o.kind === 'block') {
      const block = data.blocks.find((b) => b.id === o.sourceId)
      if (block) setEditor({ mode: 'block', block })
    } else {
      const one = data.oneOffs.find((x) => x.id === o.sourceId)
      if (one) setEditor({ mode: 'oneoff', oneOff: one })
    }
  }

  const date = fromDateKey(dayKey)
  const dateLabel = date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t.dayLong[isoWeekday(dayKey) - 1]}</h1>
          <p className="muted">{dateLabel}</p>
        </div>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => setDayKey(addDays(dayKey, -1))} aria-label={t('today.prev')} title={t('today.prev')}>
            <Icon name="left" />
          </button>
          <button className="btn" onClick={() => setDayKey(todayKey)} disabled={isToday}>
            {t('today.goToday')}
          </button>
          <button className="icon-btn" onClick={() => setDayKey(addDays(dayKey, 1))} aria-label={t('today.nextDay')} title={t('today.nextDay')}>
            <Icon name="right" />
          </button>
        </div>
      </header>

      {isToday && <NowCard />}

      <div className="list-head">
        {stat.total > 0 ? (
          <div className="progress-line">
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${stat.plannedMin ? (stat.doneMin / stat.plannedMin) * 100 : 0}%` }} />
            </div>
            <span className="muted">{t('today.progress', { m: stat.marked, t: stat.total })}</span>
          </div>
        ) : (
          <span />
        )}
        <button className="btn" onClick={() => setEditor({ mode: 'oneoff', oneOff: { date: dayKey } })}>
          <Icon name="plus" size={16} />
          {t('today.addOnce')}
        </button>
      </div>

      {occs.length === 0 && <p className="empty">{t('today.empty')}</p>}

      <ol className="timeline">
        {occs.map((o) => {
          const cat = category(o.categoryId)
          const log = logs[o.sourceId]
          const current = o.start <= now && now < o.end
          const past = o.end <= now
          const tracked = cat?.track ?? false
          return (
            <li
              key={o.key}
              className={`occ${current ? ' current' : ''}${past ? ' past' : ''}${log ? ` s-${log.status}` : ''}`}
              style={{ ['--cat' as string]: cat?.color ?? '#8b8d98' }}
            >
              <div className="occ-time">
                <span>{clockOf(o.start)}</span>
                <span className="muted">{clockOf(o.end)}</span>
              </div>
              <div className="occ-body">
                <button className="occ-title" onClick={() => openEditor(o)}>
                  {o.title}
                </button>
                <div className="occ-meta">
                  <span className="dot" />
                  {cat?.name}
                  <span className="sep">·</span>
                  {formatDuration((o.end - o.start) / 60_000, lang)}
                  {o.kind === 'oneoff' && <span className="tag">{t('today.oneOff')}</span>}
                </div>
                {o.note && <p className="occ-note">{o.note}</p>}
                {openNote === o.sourceId && log && (
                  <textarea
                    className="log-note"
                    autoFocus
                    rows={2}
                    defaultValue={log.note ?? ''}
                    placeholder={t('today.notePlaceholder')}
                    onBlur={(e) => {
                      setLog(o.sourceId, log.status, e.target.value.trim())
                      setOpenNote(null)
                    }}
                  />
                )}
                {openNote !== o.sourceId && log?.note && <p className="log-note-text">“{log.note}”</p>}
              </div>
              <div className="occ-actions">
                {tracked && (
                  <div className="status-group" role="group">
                    {STATUSES.map((s) => (
                      <button
                        key={s.status}
                        className={`status-btn ${s.status}${log?.status === s.status ? ' on' : ''}`}
                        aria-pressed={log?.status === s.status}
                        title={t(s.label)}
                        aria-label={t(s.label)}
                        onClick={() => setLog(o.sourceId, log?.status === s.status ? null : s.status, log?.note)}
                      >
                        <Icon name={s.icon} size={16} />
                      </button>
                    ))}
                  </div>
                )}
                {tracked && log && (
                  <button className="icon-btn subtle" title={t('today.notePlaceholder')} aria-label={t('today.notePlaceholder')} onClick={() => setOpenNote(o.sourceId)}>
                    <Icon name="note" size={16} />
                  </button>
                )}
                <button className="icon-btn subtle" title={t('today.hide')} aria-label={t('today.hide')} onClick={() => hide(o.sourceId)}>
                  <Icon name="eyeOff" size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      {hidden.length > 0 && (
        <button className="link restore" onClick={restore}>
          {t('today.restore', { n: hidden.length })}
        </button>
      )}

      {editor && <BlockEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  )
}

function NowCard() {
  const { data, t, now, category } = useStore()
  const lang = data.settings.lang
  const { current, next } = nowState(data, now, toDateKey(new Date(now)))

  return (
    <section className="now-card" aria-live="polite">
      <div className="now-main">
        <span className="eyebrow">{t('today.now')}</span>
        {current.length === 0 && <h2>{t('today.free')}</h2>}
        {current.map((c) => {
          const pct = Math.min(100, ((now - c.start) / (c.end - c.start)) * 100)
          const cat = category(c.categoryId)
          return (
            <div key={c.key} className="now-item" style={{ ['--cat' as string]: cat?.color ?? '#8b8d98' }}>
              <h2>{c.title}</h2>
              <div className="now-meta">
                <span className="dot" /> {cat?.name} · {clockOf(c.start)}–{clockOf(c.end)}
              </div>
              <div className="bar big" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="now-left">{t('today.left', { d: formatDuration((c.end - now) / 60_000, lang) })}</div>
              {c.note && <p className="muted">{c.note}</p>}
            </div>
          )
        })}
      </div>
      <div className="now-next">
        <span className="eyebrow">{t('today.next')}</span>
        {next ? (
          <>
            <strong>{next.title}</strong>
            <span className="muted">
              {clockOf(next.start)} · {t('today.startsIn', { d: formatDuration((next.start - now) / 60_000, lang) })}
            </span>
          </>
        ) : (
          <span className="muted">{t('today.nothingNext')}</span>
        )}
      </div>
    </section>
  )
}
