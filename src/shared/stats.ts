import { occurrencesOn } from './schedule'
import { addDays } from './time'
import type { AppData, Status } from './types'

/** Weight of each status when computing completed time. */
const WEIGHT: Record<Status, number> = { done: 1, partial: 0.5, skipped: 0 }

/** A day counts towards the streak when at least this share of planned time is completed. */
export const STREAK_THRESHOLD = 0.6

export interface CategoryStat {
  categoryId: string
  plannedMin: number
  doneMin: number
}

export interface DayStat {
  dateKey: string
  plannedMin: number
  doneMin: number
  marked: number
  total: number
}

/** Days before first use are not counted: the weekly template also "repeats" into the past. */
const beforeStart = (data: AppData, dateKey: string): boolean => !!data.startedOn && dateKey < data.startedOn

function trackedIds(data: AppData): Set<string> {
  return new Set(data.categories.filter((c) => c.track).map((c) => c.id))
}

/**
 * Planned vs completed minutes for one day. For today only blocks that have
 * already started are counted, so the ratio is not dragged down by the future.
 */
export function dayStat(data: AppData, dateKey: string, now: number): DayStat {
  const tracked = trackedIds(data)
  const logs = data.logs[dateKey] ?? {}
  const stat: DayStat = { dateKey, plannedMin: 0, doneMin: 0, marked: 0, total: 0 }
  if (beforeStart(data, dateKey)) return stat
  for (const o of occurrencesOn(data, dateKey)) {
    if (!tracked.has(o.categoryId) || o.start > now) continue
    const minutes = (o.end - o.start) / 60_000
    const log = logs[o.sourceId]
    stat.plannedMin += minutes
    stat.total += 1
    if (log) {
      stat.marked += 1
      stat.doneMin += minutes * WEIGHT[log.status]
    }
  }
  return stat
}

export function rangeStats(data: AppData, fromKey: string, toKey: string, now: number) {
  const tracked = trackedIds(data)
  const byCategory = new Map<string, CategoryStat>()
  const days: DayStat[] = []
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) {
    days.push(dayStat(data, k, now))
    if (beforeStart(data, k)) continue
    const logs = data.logs[k] ?? {}
    for (const o of occurrencesOn(data, k)) {
      if (!tracked.has(o.categoryId) || o.start > now) continue
      const minutes = (o.end - o.start) / 60_000
      const s = byCategory.get(o.categoryId) ?? { categoryId: o.categoryId, plannedMin: 0, doneMin: 0 }
      s.plannedMin += minutes
      const log = logs[o.sourceId]
      if (log) s.doneMin += minutes * WEIGHT[log.status]
      byCategory.set(o.categoryId, s)
    }
  }
  const categories = [...byCategory.values()].sort((a, b) => b.plannedMin - a.plannedMin)
  const plannedMin = days.reduce((s, d) => s + d.plannedMin, 0)
  const doneMin = days.reduce((s, d) => s + d.doneMin, 0)
  return { days, categories, plannedMin, doneMin }
}

/**
 * Consecutive successful days ending today (or yesterday if today is not yet
 * successful). Days without any tracked plan are neutral: they neither break
 * nor extend the streak.
 */
export function streak(data: AppData, todayKey: string, now: number): number {
  const ok = (k: string): boolean | null => {
    const s = dayStat(data, k, now)
    if (s.plannedMin === 0) return null
    return s.doneMin / s.plannedMin >= STREAK_THRESHOLD
  }
  let count = 0
  const today = ok(todayKey)
  if (today === true) count += 1
  let k = addDays(todayKey, -1)
  for (let i = 0; i < 365 && !beforeStart(data, k); i++, k = addDays(k, -1)) {
    const r = ok(k)
    if (r === null) continue
    if (!r) break
    count += 1
  }
  return count
}
