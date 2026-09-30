import { useMemo, useState } from 'react'
import { dayStat } from '@shared/stats'
import { addDays, fromDateKey, startOfWeek, toDateKey } from '@shared/time'
import { useStore } from '../store'

/** Completion level: -1 no plan, 0 nothing done, 1..4 increasing share of the plan done. */
function level(planned: number, done: number): number {
  if (planned === 0) return -1
  const r = done / planned
  if (r === 0) return 0
  if (r < 0.4) return 1
  if (r < 0.7) return 2
  if (r < 0.9) return 3
  return 4
}

/** GitHub-style year view: one square per day, one column per week (Monday on top). */
export function Heatmap() {
  const { data, t, now } = useStore()
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)
  const lang = data.settings.lang
  const today = toDateKey(new Date(now))
  const first = startOfWeek(addDays(today, -364))

  const weeks = useMemo(() => {
    const out: { key: string; lvl: number; pct: number; future: boolean }[][] = []
    for (let k = first; k <= today; k = addDays(k, 7)) {
      const week = []
      for (let i = 0; i < 7; i++) {
        const key = addDays(k, i)
        const s = dayStat(data, key, now)
        week.push({ key, lvl: level(s.plannedMin, s.doneMin), pct: s.plannedMin ? Math.round((s.doneMin / s.plannedMin) * 100) : 0, future: key > today })
      }
      out.push(week)
    }
    return out
    // `now` changes every 15 s; recomputing a year of stats that often isn't needed.
  }, [data, today, first])

  // Label a column when a new month starts; skip the partial first month if the next label follows too closely.
  const monthOf = (i: number): number => fromDateKey(weeks[i][0].key).getMonth()
  const months = weeks.map((w, i) => {
    if (i > 0 && monthOf(i) === monthOf(i - 1)) return ''
    if (i === 0 && weeks.length > 2 && (monthOf(1) !== monthOf(0) || monthOf(2) !== monthOf(0))) return ''
    return fromDateKey(w[0].key).toLocaleDateString(lang, { month: 'short' })
  })
  const cell = hover ? weeks.flat().find((c) => c.key === hover.key) : null

  return (
    <section className="card">
      <h2>{t('stats.heatmap')}</h2>
      <div className="heatmap-scroll" onMouseLeave={() => setHover(null)}>
        <div className="heatmap" role="img" aria-label={t('stats.heatmap')}>
          <div className="hm-months" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="hm-days" aria-hidden="true">
            {[0, 2, 4].map((d) => (
              <span key={d} style={{ gridRow: d + 1 }}>
                {t.dayShort[d]}
              </span>
            ))}
          </div>
          <div className="hm-grid">
            {weeks.map((w, wi) => (
              <div key={wi} className="hm-week">
                {w.map((c) =>
                  c.future ? (
                    <span key={c.key} className="hm-cell future" />
                  ) : (
                    <span
                      key={c.key}
                      className={`hm-cell l${c.lvl}`}
                      onMouseEnter={(e) => {
                        const box = (e.currentTarget.closest('.heatmap') as HTMLElement).getBoundingClientRect()
                        const r = e.currentTarget.getBoundingClientRect()
                        setHover({ key: c.key, x: r.left - box.left + r.width / 2, y: r.top - box.top })
                      }}
                    />
                  )
                )}
              </div>
            ))}
          </div>
          {hover && cell && (
            <div className="tooltip hm-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">
              <strong>{fromDateKey(cell.key).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long' })}</strong>
              <span>{cell.lvl === -1 ? t('stats.noPlan') : `${t('stats.completion')}: ${t.pct(cell.pct)}`}</span>
            </div>
          )}
        </div>
      </div>
      <div className="hm-legend" aria-hidden="true">
        <span className="hm-cell l-1" /> {t('stats.noPlan')}
        <span className="spacer" />
        {t('stats.less')}
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`hm-cell l${l}`} />
        ))}
        {t('stats.more')}
      </div>
    </section>
  )
}
