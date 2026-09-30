import type { Status } from './types'

/**
 * Payload a phone notification button posts back through ntfy. Kept small and
 * without titles so it works in private mode too.
 */
export interface MarkAction {
  v: 1
  type: 'mark'
  date: string
  id: string
  status: Status
}

export const actionTopic = (topic: string): string => `${topic}-act`

export function markAction(date: string, id: string, status: Status): string {
  const a: MarkAction = { v: 1, type: 'mark', date, id, status }
  return JSON.stringify(a)
}

/** Parses an incoming action message; returns null for anything unexpected. */
export function parseMarkAction(text: unknown): MarkAction | null {
  if (typeof text !== 'string' || text.length > 500) return null
  try {
    const a = JSON.parse(text) as Partial<MarkAction>
    if (
      a.v === 1 &&
      a.type === 'mark' &&
      typeof a.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(a.date) &&
      typeof a.id === 'string' &&
      a.id.length > 0 &&
      a.id.length <= 200 &&
      (a.status === 'done' || a.status === 'partial' || a.status === 'skipped')
    ) {
      return { v: 1, type: 'mark', date: a.date, id: a.id, status: a.status }
    }
  } catch {
    // not JSON: ignore
  }
  return null
}
