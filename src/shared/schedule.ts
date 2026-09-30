import { addDays, atTime, isoWeekday, parseHM, toDateKey } from './time'
import type { AppData, Block, DueReminder, OneOff, Occurrence, Reminders } from './types'

function toOccurrence(
  data: AppData,
  src: Block | OneOff,
  kind: Occurrence['kind'],
  dateKey: string
): Occurrence {
  const start = atTime(dateKey, src.start)
  let end = atTime(dateKey, src.end)
  if (parseHM(src.end) <= parseHM(src.start)) end = atTime(addDays(dateKey, 1), src.end)
  return {
    key: `${dateKey}:${src.id}`,
    sourceId: src.id,
    kind,
    dateKey,
    title: src.title,
    categoryId: src.categoryId,
    note: src.note,
    start,
    end,
    reminders: src.reminders ?? data.settings.defaultReminders
  }
}

/** All occurrences that start on the given date, sorted by start time. */
export function occurrencesOn(data: AppData, dateKey: string): Occurrence[] {
  const weekday = isoWeekday(dateKey)
  const hidden = new Set(data.hidden[dateKey] ?? [])
  const list: Occurrence[] = []
  for (const b of data.blocks) {
    if (b.days.includes(weekday) && !hidden.has(b.id)) list.push(toOccurrence(data, b, 'block', dateKey))
  }
  for (const o of data.oneOffs) {
    if (o.date === dateKey && !hidden.has(o.id)) list.push(toOccurrence(data, o, 'oneoff', dateKey))
  }
  return list.sort((a, b) => a.start - b.start || a.end - b.end)
}

/** Occurrences starting between the two dates (inclusive). */
export function occurrencesBetween(data: AppData, fromKey: string, toKey: string): Occurrence[] {
  const out: Occurrence[] = []
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(...occurrencesOn(data, k))
  return out
}

export interface NowState {
  current: Occurrence[]
  next: Occurrence | null
}

/** What is happening right now (overlaps allowed) and what comes next. */
export function nowState(data: AppData, now: number, todayKey: string): NowState {
  const occs = occurrencesBetween(data, addDays(todayKey, -1), addDays(todayKey, 1))
  const current = occs.filter((o) => o.start <= now && now < o.end)
  const next = occs.find((o) => o.start > now) ?? null
  return { current, next }
}

function reminderTimes(r: Reminders, o: Occurrence): { type: DueReminder['type']; at: number }[] {
  const out: { type: DueReminder['type']; at: number }[] = []
  if (r.beforeStart && r.beforeStart > 0) out.push({ type: 'beforeStart', at: o.start - r.beforeStart * 60_000 })
  if (r.atStart) out.push({ type: 'atStart', at: o.start })
  if (r.beforeEnd && r.beforeEnd > 0) {
    const at = o.end - r.beforeEnd * 60_000
    if (at > o.start) out.push({ type: 'beforeEnd', at })
  }
  return out
}

/**
 * Reminders whose trigger time falls in (from, to]. Works for any window:
 * a day is added on both sides so overnight blocks and reminders that fire
 * before midnight for the next day are found.
 */
export function dueReminders(data: AppData, from: number, to: number): DueReminder[] {
  const occs = occurrencesBetween(data, addDays(toDateKey(new Date(from)), -1), addDays(toDateKey(new Date(to)), 1))
  const due: DueReminder[] = []
  for (const o of occs) {
    for (const { type, at } of reminderTimes(o.reminders, o)) {
      if (at > from && at <= to) due.push({ id: `${o.key}:${type}`, type, at, occurrence: o })
    }
  }
  return due.sort((a, b) => a.at - b.at)
}

/** Blocks of tracked categories that already ended today and are not marked yet. */
export function unmarkedToday(data: AppData, todayKey: string, now: number): Occurrence[] {
  const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
  const logs = data.logs[todayKey] ?? {}
  return occurrencesOn(data, todayKey).filter(
    (o) => tracked.has(o.categoryId) && o.end <= now && !logs[o.sourceId]
  )
}

/** Titles of other blocks that overlap with the candidate on any shared weekday. */
export function findOverlaps(
  blocks: Block[],
  candidate: Pick<Block, 'id' | 'days' | 'start' | 'end'>
): Block[] {
  const range = (b: Pick<Block, 'start' | 'end'>): [number, number] => {
    const s = parseHM(b.start)
    const e = parseHM(b.end)
    return [s, e > s ? e : e + 1440]
  }
  const [cs, ce] = range(candidate)
  return blocks.filter((b) => {
    if (b.id === candidate.id) return false
    if (!b.days.some((d) => candidate.days.includes(d))) return false
    const [bs, be] = range(b)
    return cs < be && bs < ce
  })
}
