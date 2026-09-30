import { useState, type MouseEvent } from 'react'
import { formatHM, isoWeekday, parseHM, toDateKey } from '@shared/time'
import type { Block, Weekday } from '@shared/types'
import { BlockEditor, type EditorTarget } from '../components/BlockEditor'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

const HOUR_PX = 48
const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

interface Segment {
  block: Block
  /** minutes since midnight, clipped to the grid */
  s: number
  e: number
  continues: boolean
  lane: number
  lanes: number
}

/** Splits blocks into per-day segments (overnight blocks continue the next day) and lays out overlaps side by side. */
function layoutDay(blocks: Block[], day: Weekday, gridStart: number, gridEnd: number): Segment[] {
  const prev = (day === 1 ? 7 : day - 1) as Weekday
  const raw: Omit<Segment, 'lane' | 'lanes'>[] = []
  for (const b of blocks) {
    const s = parseHM(b.start)
    const e = parseHM(b.end)
    const overnight = e <= s
    if (b.days.includes(day)) raw.push({ block: b, s, e: overnight ? 1440 : e, continues: false })
    if (overnight && b.days.includes(prev) && e > 0) raw.push({ block: b, s: 0, e, continues: true })
  }
  const clipped = raw
    .map((r) => ({ ...r, s: Math.max(r.s, gridStart), e: Math.min(r.e, gridEnd) }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const out: Segment[] = []
  let cluster: Segment[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []
  const flush = (): void => {
    for (const seg of cluster) seg.lanes = laneEnds.length
    out.push(...cluster)
    cluster = []
    laneEnds = []
  }
  for (const r of clipped) {
    if (r.s >= clusterEnd) {
      flush()
      clusterEnd = -1
    }
    let lane = laneEnds.findIndex((end) => end <= r.s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(r.e)
    } else laneEnds[lane] = r.e
    cluster.push({ ...r, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, r.e)
  }
  flush()
  return out
}

export function WeekPage() {
  const { data, t, now, category } = useStore()
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const gs = data.settings.gridStartHour * 60
  const ge = data.settings.gridEndHour * 60
  const hours = Array.from({ length: data.settings.gridEndHour - data.settings.gridStartHour }, (_, i) => data.settings.gridStartHour + i)
  const today = isoWeekday(toDateKey(new Date(now)))
  const d = new Date(now)
  const nowMin = d.getHours() * 60 + d.getMinutes()

  const onColumnClick = (e: MouseEvent<HTMLDivElement>, day: Weekday): void => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const start = Math.min(ge - 60, Math.max(gs, gs + Math.floor((y / HOUR_PX) * 4) * 15))
    setEditor({ mode: 'block', block: { days: [day], start: formatHM(start), end: formatHM(start + 60) } })
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>{t('week.title')}</h1>
          <p className="muted">{t('week.hint')}</p>
        </div>
        <button className="btn primary" onClick={() => setEditor({ mode: 'block', block: { days: [today] } })}>
          <Icon name="plus" size={16} />
          {t('week.add')}
        </button>
      </header>

      <div className="week-scroll">
        <div className="week-grid" style={{ ['--hour' as string]: `${HOUR_PX}px` }}>
          <div className="week-corner" />
          {DAYS.map((day) => (
            <div key={day} className={`week-day-head${day === today ? ' today' : ''}`}>
              {t.dayShort[day - 1]}
            </div>
          ))}

          <div className="week-gutter">
            {hours.map((h) => (
              <div key={h} className="week-hour-label">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {DAYS.map((day) => (
            <div
              key={day}
              className={`week-col${day === today ? ' today' : ''}`}
              style={{ height: hours.length * HOUR_PX }}
              onClick={(e) => onColumnClick(e, day)}
            >
              {day === today && nowMin >= gs && nowMin <= ge && (
                <div className="now-line" style={{ top: ((nowMin - gs) / 60) * HOUR_PX }} aria-hidden="true" />
              )}
              {layoutDay(data.blocks, day, gs, ge).map((seg) => {
                const cat = category(seg.block.categoryId)
                const height = ((seg.e - seg.s) / 60) * HOUR_PX
                return (
                  <button
                    key={`${seg.block.id}-${seg.continues}`}
                    className={`week-block${height < 30 ? ' tiny' : ''}`}
                    style={{
                      ['--cat' as string]: cat?.color ?? '#8b8d98',
                      top: ((seg.s - gs) / 60) * HOUR_PX + 1,
                      height: height - 2,
                      left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / seg.lanes}% - 4px)`
                    }}
                    title={`${seg.block.title} · ${seg.block.start}–${seg.block.end} · ${cat?.name ?? ''}`}
                    onClick={() => setEditor({ mode: 'block', block: seg.block })}
                  >
                    <span className="wb-title">{seg.block.title}</span>
                    {height >= 40 && (
                      <span className="wb-time">
                        {seg.block.start}–{seg.block.end}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {editor && <BlockEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  )
}
