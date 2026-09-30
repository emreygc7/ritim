import { useState } from 'react'
import { rangeStats, streak, STREAK_THRESHOLD } from '@shared/stats'
import { addDays, formatDuration, fromDateKey, isoWeekday, startOfWeek, toDateKey } from '@shared/time'
import { Heatmap } from '../components/Heatmap'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

type Range = 'week' | '7' | '30'

export function StatsPage() {
  const { data, t, now, category } = useStore()
  const [range, setRange] = useState<Range>('week')
  const [hover, setHover] = useState<number | null>(null)
  const lang = data.settings.lang
  const todayKey = toDateKey(new Date(now))
  const from = range === 'week' ? startOfWeek(todayKey) : addDays(todayKey, range === '7' ? -6 : -29)
  const to = range === 'week' ? addDays(from, 6) : todayKey
  const r = rangeStats(data, from, to, now)
  const pct = r.plannedMin ? Math.round((r.doneMin / r.plannedMin) * 100) : 0
  const s = streak(data, todayKey, now)
  const maxCat = Math.max(1, ...r.categories.map((c) => c.plannedMin))
  const dur = (m: number): string => formatDuration(m, lang)
  const dayLabel = (k: string): string =>
    fromDateKey(k).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('stats.title')}</h1>
        <div className="segmented" role="tablist">
          {(
            [
              ['week', 'stats.thisWeek'],
              ['7', 'stats.last7'],
              ['30', 'stats.last30']
            ] as const
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={range === key} className={range === key ? 'on' : ''} onClick={() => setRange(key)}>
              {t(label)}
            </button>
          ))}
        </div>
      </header>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">{t('stats.completion')}</span>
          <span className="tile-value">{t.pct(pct)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('stats.planned')}</span>
          <span className="tile-value">{dur(r.plannedMin)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">{t('stats.done')}</span>
          <span className="tile-value">{dur(r.doneMin)}</span>
        </div>
        <div className="tile" title={t('stats.streakHint', { p: STREAK_THRESHOLD * 100 })}>
          <span className="tile-label">
            <Icon name="flame" size={14} /> {t('stats.streak')}
          </span>
          <span className="tile-value">{t('stats.streakDays', { n: s })}</span>
          <span className="tile-hint">{t('stats.streakHint', { p: STREAK_THRESHOLD * 100 })}</span>
        </div>
      </div>

      {r.plannedMin === 0 ? (
        <p className="empty">{t('stats.empty')}</p>
      ) : (
        <>
          <section className="card">
            <h2>{t('stats.byCategory')}</h2>
            <table className="cat-table">
              <thead className="sr-only">
                <tr>
                  <th>{t('editor.category')}</th>
                  <th>{t('stats.done')} / {t('stats.planned')}</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {r.categories.map((c) => {
                  const cat = category(c.categoryId)
                  return (
                    <tr key={c.categoryId} style={{ ['--cat' as string]: cat?.color ?? '#8b8d98' }}>
                      <th scope="row">
                        <span className="dot" /> {cat?.name ?? '-'}
                      </th>
                      <td className="cat-bar-cell">
                        <div className="cat-track" style={{ width: `${(c.plannedMin / maxCat) * 100}%` }}>
                          <span className="cat-fill" style={{ width: `${(c.doneMin / c.plannedMin) * 100}%` }} />
                        </div>
                        <span className="cat-nums">
                          {dur(c.doneMin)} / {dur(c.plannedMin)}
                        </span>
                      </td>
                      <td className="num">{t.pct(Math.round((c.doneMin / c.plannedMin) * 100))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>{t('stats.daily')}</h2>
            <div className="daily-chart" onMouseLeave={() => setHover(null)}>
              <div className="daily-grid" aria-hidden="true">
                <span style={{ bottom: '100%' }}>
                  <em>{t.pct(100)}</em>
                </span>
                <span style={{ bottom: '50%' }}>
                  <em>{t.pct(50)}</em>
                </span>
                <span style={{ bottom: '0%' }} />
                <span style={{ bottom: `${STREAK_THRESHOLD * 100}%` }} className="threshold" />
              </div>
              <div className="daily-bars">
                {r.days.map((d, i) => {
                  const ratio = d.plannedMin ? d.doneMin / d.plannedMin : 0
                  const future = d.dateKey > todayKey
                  const label = `${dayLabel(d.dateKey)}: ${d.plannedMin ? t.pct(Math.round(ratio * 100)) : '-'} (${dur(d.doneMin)} / ${dur(d.plannedMin)})`
                  return (
                    <div
                      key={d.dateKey}
                      className={`daily-slot${hover === i ? ' hover' : ''}`}
                      onMouseEnter={() => setHover(i)}
                      role="img"
                      aria-label={label}
                    >
                      <div className="daily-bar-area">
                        {!future && d.plannedMin > 0 && (
                          <span className="daily-bar" style={{ height: `${Math.max(ratio * 100, 1.5)}%` }} />
                        )}
                      </div>
                      <span className="daily-x">
                        {r.days.length <= 7 ? t.dayShort[isoWeekday(d.dateKey) - 1] : fromDateKey(d.dateKey).getDate()}
                      </span>
                      {hover === i && (
                        <div className="tooltip" role="tooltip">
                          <strong>{dayLabel(d.dateKey)}</strong>
                          <span>
                            {t('stats.completion')}: {d.plannedMin ? t.pct(Math.round(ratio * 100)) : '-'}
                          </span>
                          <span>
                            {dur(d.doneMin)} / {dur(d.plannedMin)}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </>
      )}
      <Heatmap />
    </div>
  )
}
