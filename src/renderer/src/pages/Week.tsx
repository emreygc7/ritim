import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { newId } from '@shared/normalize'
import { formatHM, isoWeekday, parseHM, toDateKey } from '@shared/time'
import type { Block, Weekday } from '@shared/types'
import { BlockEditor, type EditorTarget } from '../components/BlockEditor'
import { ChecklistEditor } from '../components/Checklist'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

const HOUR_PX = 48
const SNAP_MIN = 15
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

interface Drag {
  id: string
  mode: 'move' | 'resize'
  x: number
  y: number
  colWidth: number
  day: Weekday
  canChangeDay: boolean
  start: number
  end: number
  dMin: number
  dDay: number
  moved: boolean
}

/** Where a dragged block would land, snapped to 15 minutes and kept inside the day. */
function dragResult(d: Drag): { start: number; end: number; day: Weekday } {
  if (d.mode === 'resize') return { start: d.start, end: Math.min(1440, Math.max(d.start + SNAP_MIN, d.end + d.dMin)), day: d.day }
  const len = d.end - d.start
  const start = Math.min(1440 - len, Math.max(0, d.start + d.dMin))
  const day = Math.min(7, Math.max(1, d.day + d.dDay)) as Weekday
  return { start, end: start + len, day }
}

export function WeekPage() {
  const { data, update, t, now, category } = useStore()
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false)
  const suppressClick = useRef(false)

  const plan = data.plans.find((p) => p.id === planId) ?? null
  const gs = data.settings.gridStartHour * 60
  const ge = data.settings.gridEndHour * 60
  const hours = Array.from({ length: data.settings.gridEndHour - data.settings.gridStartHour }, (_, i) => data.settings.gridStartHour + i)
  const today = isoWeekday(toDateKey(new Date(now)))
  const d = new Date(now)
  const nowMin = d.getHours() * 60 + d.getMinutes()

  // A day plan is edited as a single day column; its blocks ignore weekdays.
  const blocks = plan
    ? data.blocks.filter((b) => b.planId === plan.id).map((b) => ({ ...b, days: DAYS }))
    : data.blocks.filter((b) => !b.planId)
  const columns: Weekday[] = plan ? [1] : DAYS

  const newBlock = (day: Weekday, start = 9 * 60): void =>
    setEditor({
      mode: 'block',
      block: { days: plan ? [] : [day], start: formatHM(start), end: formatHM(start + 60), ...(plan ? { planId: plan.id } : {}) }
    })

  const onColumnClick = (e: React.MouseEvent<HTMLDivElement>, day: Weekday): void => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    newBlock(day, Math.min(ge - 60, Math.max(gs, gs + Math.floor((y / HOUR_PX) * 4) * SNAP_MIN)))
  }

  const openBlock = (id: string): void => {
    const b = data.blocks.find((x) => x.id === id)
    if (b) setEditor({ mode: 'block', block: b })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, seg: Segment, day: Weekday, mode: Drag['mode']): void => {
    const s = parseHM(seg.block.start)
    const en = parseHM(seg.block.end)
    // Overnight blocks and their continuation are edited in the dialog instead.
    if (e.button !== 0 || seg.continues || en <= s) return
    e.stopPropagation()
    const col = (e.currentTarget.closest('.week-col') as HTMLElement | null)?.getBoundingClientRect().width ?? 120
    try {
      ;(e.currentTarget.closest('.week-block') as HTMLElement | null)?.setPointerCapture(e.pointerId)
    } catch {
      // Capture can fail for synthetic events; dragging still works while the pointer stays on the block.
    }
    const original = data.blocks.find((b) => b.id === seg.block.id)
    setDrag({
      id: seg.block.id,
      mode,
      x: e.clientX,
      y: e.clientY,
      colWidth: col,
      day,
      canChangeDay: !plan && (original?.days.length ?? 0) === 1,
      start: s,
      end: en,
      dMin: 0,
      dDay: 0,
      moved: false
    })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!drag) return
    const dy = e.clientY - drag.y
    const dx = e.clientX - drag.x
    setDrag({
      ...drag,
      dMin: Math.round(((dy / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN,
      dDay: drag.mode === 'move' && drag.canChangeDay ? Math.round(dx / drag.colWidth) : 0,
      moved: drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4
    })
  }

  const onPointerUp = (): void => {
    if (!drag) return
    if (drag.moved) {
      // Swallow the click that follows this pointerup, but never a later one.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      const r = dragResult(drag)
      update((cur) => ({
        ...cur,
        blocks: cur.blocks.map((b) =>
          b.id === drag.id
            ? { ...b, start: formatHM(r.start), end: formatHM(r.end), ...(drag.canChangeDay ? { days: [r.day] } : {}) }
            : b
        )
      }))
    }
    setDrag(null)
  }

  const addPlan = (): void => {
    const id = newId()
    update((cur) => ({ ...cur, plans: [...cur.plans, { id, name: t('plans.newName') }] }))
    setPlanId(id)
  }

  const renamePlan = (name: string): void =>
    update((cur) => ({ ...cur, plans: cur.plans.map((p) => (p.id === planId ? { ...p, name } : p)) }))

  const deletePlan = (): void => {
    if (!confirmDeletePlan) return setConfirmDeletePlan(true)
    const id = planId
    update((cur) => ({
      ...cur,
      plans: cur.plans.filter((p) => p.id !== id),
      blocks: cur.blocks.filter((b) => b.planId !== id),
      dayPlans: Object.fromEntries(Object.entries(cur.dayPlans).filter(([, p]) => p !== id))
    }))
    setConfirmDeletePlan(false)
    setPlanId(null)
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>{plan ? t('plans.title') : t('week.title')}</h1>
          <p className="muted">{plan ? t('plans.hint') : t('week.hint')}</p>
        </div>
        <button className="btn primary" onClick={() => newBlock(today)}>
          <Icon name="plus" size={16} />
          {t('week.add')}
        </button>
      </header>

      <div className="plan-tabs" role="tablist">
        <button role="tab" aria-selected={!plan} className={!plan ? 'on' : ''} onClick={() => setPlanId(null)}>
          {t('plans.template')}
        </button>
        {data.plans.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={planId === p.id}
            className={planId === p.id ? 'on' : ''}
            onClick={() => {
              setPlanId(p.id)
              setConfirmDeletePlan(false)
            }}
          >
            {p.name || t('plans.newName')}
          </button>
        ))}
        <button className="add" onClick={addPlan}>
          <Icon name="plus" size={14} />
          {t('plans.add')}
        </button>
      </div>

      {plan && (
        <div className="plan-bar">
          <input
            value={plan.name}
            maxLength={40}
            aria-label={t('plans.name')}
            placeholder={t('plans.newName')}
            onChange={(e) => renamePlan(e.target.value)}
          />
          <button className={`btn danger${confirmDeletePlan ? ' armed' : ''}`} onClick={deletePlan}>
            {confirmDeletePlan ? t('editor.confirmDelete') : t('plans.delete')}
          </button>
        </div>
      )}

      <div className="week-scroll">
        <div className={`week-grid${plan ? ' single' : ''}`} style={{ ['--hour' as string]: `${HOUR_PX}px` }}>
          <div className="week-corner" />
          {columns.map((day) => (
            <div key={day} className={`week-day-head${!plan && day === today ? ' today' : ''}`}>
              {plan ? plan.name || t('plans.newName') : t.dayShort[day - 1]}
            </div>
          ))}

          <div className="week-gutter">
            {hours.map((h) => (
              <div key={h} className="week-hour-label">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {columns.map((day) => (
            <div
              key={day}
              className={`week-col${!plan && day === today ? ' today' : ''}`}
              style={{ height: hours.length * HOUR_PX }}
              onClick={(e) => onColumnClick(e, day)}
            >
              {!plan && day === today && nowMin >= gs && nowMin <= ge && (
                <div className="now-line" style={{ top: ((nowMin - gs) / 60) * HOUR_PX }} aria-hidden="true" />
              )}
              {layoutDay(blocks, day, gs, ge).map((seg) => {
                const cat = category(seg.block.categoryId)
                const active = drag && drag.moved && drag.id === seg.block.id && !seg.continues ? drag : null
                const r = active ? dragResult(active) : null
                const s = r ? Math.max(gs, r.start) : seg.s
                const e = r ? Math.min(ge, r.end) : seg.e
                const shiftDays = r && active ? r.day - active.day : 0
                const height = ((e - s) / 60) * HOUR_PX
                const movable = !seg.continues && parseHM(seg.block.end) > parseHM(seg.block.start)
                return (
                  <button
                    key={`${seg.block.id}-${seg.continues}`}
                    className={`week-block${height < 30 ? ' tiny' : ''}${active ? ' dragging' : ''}${movable ? ' movable' : ''}`}
                    style={{
                      ['--cat' as string]: cat?.color ?? '#8b8d98',
                      top: ((s - gs) / 60) * HOUR_PX + 1,
                      height: Math.max(height - 2, 8),
                      left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px + ${shiftDays * (active?.colWidth ?? 0)}px)`,
                      width: `calc(${100 / seg.lanes}% - 4px)`
                    }}
                    title={`${seg.block.title} · ${seg.block.start}–${seg.block.end} · ${cat?.name ?? ''}`}
                    onPointerDown={(ev) => onPointerDown(ev, seg, day, 'move')}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false
                        return
                      }
                      openBlock(seg.block.id)
                    }}
                  >
                    <span className="wb-title">{seg.block.title}</span>
                    {height >= 40 && (
                      <span className="wb-time">{r ? `${formatHM(r.start)}–${formatHM(r.end)}` : `${seg.block.start}–${seg.block.end}`}</span>
                    )}
                    {movable && height >= 20 && (
                      <span className="wb-resize" aria-hidden="true" onPointerDown={(ev) => onPointerDown(ev, seg, day, 'resize')} />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {!plan && <ChecklistEditor />}

      {editor && <BlockEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  )
}
