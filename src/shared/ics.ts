import { clockOf, toDateKey } from './time'
import type { OneOff } from './types'

/**
 * Minimal iCalendar (.ics) reader for importing calendar events as one-off
 * blocks. Supports timed, non-recurring events; all-day events, recurring
 * events and events longer than a day are skipped (and counted).
 */

export interface IcsEvent {
  uid: string
  summary: string
  /** epoch ms */
  start: number
  end: number
}

export interface IcsResult {
  events: IcsEvent[]
  skipped: number
}

/** RFC 5545 line unfolding: a line starting with a space or tab continues the previous one. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

/**
 * Parses a DATE-TIME value. "Z" suffix = UTC; otherwise it is treated as local
 * time (TZID parameters are not resolved, which is right when the calendar and
 * the computer share a time zone).
 */
function parseDateTime(v: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s = '0', z] = m
  const args = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const
  return z ? Date.UTC(...args) : new Date(...args).getTime()
}

export function parseIcs(text: string): IcsResult {
  const events: IcsEvent[] = []
  let skipped = 0
  let cur: Record<string, { params: string; value: string }> | null = null

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const start = cur.DTSTART && !/VALUE=DATE(?!-)/.test(cur.DTSTART.params) ? parseDateTime(cur.DTSTART.value) : null
        const end = cur.DTEND ? parseDateTime(cur.DTEND.value) : null
        const ok =
          start !== null &&
          end !== null &&
          end > start &&
          end - start < 24 * 3_600_000 &&
          !cur.RRULE &&
          (cur.STATUS?.value ?? '').toUpperCase() !== 'CANCELLED'
        if (ok) {
          events.push({
            uid: cur.UID?.value || `${start}-${cur.SUMMARY?.value ?? ''}`,
            summary: unescape(cur.SUMMARY?.value ?? '') || '(untitled)',
            start: start!,
            end: end!
          })
        } else skipped++
      }
      cur = null
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    const [name, ...params] = head.split(';')
    cur[name.toUpperCase()] = { params: params.join(';').toUpperCase(), value: line.slice(colon + 1) }
  }
  return { events, skipped }
}

/** Stable id so importing the same calendar twice doesn't duplicate events. */
function eventId(e: IcsEvent): string {
  let h = 2166136261
  for (const ch of `${e.uid}|${e.start}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return `ics-${(h >>> 0).toString(36)}`
}

/** Turns calendar events into one-off blocks, skipping ones already imported. */
export function eventsToOneOffs(existing: OneOff[], events: IcsEvent[], categoryId: string): OneOff[] {
  const have = new Set(existing.map((o) => o.id))
  const out: OneOff[] = []
  for (const e of events) {
    const id = eventId(e)
    const start = clockOf(e.start)
    const end = clockOf(e.end)
    if (have.has(id) || start === end) continue
    have.add(id)
    out.push({ id, title: e.summary.slice(0, 80), categoryId, date: toDateKey(new Date(e.start)), start, end, reminders: null })
  }
  return out
}
