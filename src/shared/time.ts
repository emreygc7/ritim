import type { Weekday } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local date → "YYYY-MM-DD" */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" → local midnight */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function isoWeekday(key: string): Weekday {
  const day = fromDateKey(key).getDay()
  return (day === 0 ? 7 : day) as Weekday
}

/** Monday of the week containing the given date */
export function startOfWeek(key: string): string {
  return addDays(key, 1 - isoWeekday(key))
}

/** "HH:MM" → minutes since midnight; returns NaN when invalid */
export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return NaN
  return h * 60 + min
}

export function isValidHM(hm: string): boolean {
  return !Number.isNaN(parseHM(hm))
}

export function formatHM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Epoch ms for a date key + "HH:MM" (local time) */
export function atTime(key: string, hm: string): number {
  const d = fromDateKey(key)
  const mins = parseHM(hm)
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d.getTime()
}

export function clockOf(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Block duration in minutes; end <= start means it crosses midnight */
export function durationMinutes(start: string, end: string): number {
  const s = parseHM(start)
  const e = parseHM(end)
  return e > s ? e - s : e + 1440 - s
}

/** Human readable duration, e.g. "1 sa 25 dk" / "1h 25m" */
export function formatDuration(minutes: number, lang: 'tr' | 'en'): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  const H = lang === 'tr' ? ' sa' : 'h'
  const M = lang === 'tr' ? ' dk' : 'm'
  if (h === 0) return `${m}${M}`
  if (m === 0) return `${h}${H}`
  return `${h}${H} ${m}${M}`
}
