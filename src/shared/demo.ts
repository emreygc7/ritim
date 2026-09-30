import { sampleData } from './sample'
import { occurrencesOn } from './schedule'
import { addDays } from './time'
import type { AppData, Lang, Status } from './types'

/** Sample week plus a believable, deterministic history. Used for screenshots and demos. */
export function demoData(lang: Lang, todayKey: string, now: number): AppData {
  const data = { ...sampleData(lang), startedOn: addDays(todayKey, -20) }
  const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
  let seed = 7
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 20; i >= 0; i--) {
    const key = addDays(todayKey, -i)
    const day: AppData['logs'][string] = {}
    for (const o of occurrencesOn(data, key)) {
      if (!tracked.has(o.categoryId) || o.end > now) continue
      const r = rand()
      const status: Status = r < 0.68 ? 'done' : r < 0.86 ? 'partial' : 'skipped'
      day[o.sourceId] = { status, at: new Date(o.end).toISOString() }
    }
    if (Object.keys(day).length) data.logs[key] = day
  }
  return data
}
