import { describe, expect, it } from 'vitest'
import { newTopic, normalizeData } from './normalize'
import { checklistOn, dueChecklist, dueReminders, findOverlaps, nowState, occurrencesOn, uncheckedOn, unmarkedToday } from './schedule'
import { streak, dayStat, rangeStats } from './stats'
import { addDays, atTime, durationMinutes, isoWeekday, parseHM, startOfWeek } from './time'
import type { AppData, Block, Weekday } from './types'

// 2026-10-05 is a Monday
const MON = '2026-10-05'

function data(blocks: Partial<Block>[], extra: Partial<AppData> = {}): AppData {
  const d = normalizeData(
    {
      categories: [
        { id: 'work', name: 'Work', color: '#ff0000', track: true },
        { id: 'rest', name: 'Rest', color: '#00ff00', track: false }
      ],
      blocks: blocks.map((b, i) => ({
        id: `b${i}`,
        title: `Block ${i}`,
        categoryId: 'work',
        days: [1, 2, 3, 4, 5, 6, 7],
        start: '09:00',
        end: '10:00',
        reminders: null,
        ...b
      }))
    },
    'en'
  )
  return { ...d, ...extra }
}

describe('time', () => {
  it('parses and validates HH:MM', () => {
    expect(parseHM('08:30')).toBe(510)
    expect(parseHM('24:00')).toBe(1440)
    expect(parseHM('24:01')).toBeNaN()
    expect(parseHM('8:5')).toBeNaN()
  })
  it('computes weekdays and week start', () => {
    expect(isoWeekday(MON)).toBe(1)
    expect(isoWeekday('2026-10-11')).toBe(7)
    expect(startOfWeek('2026-10-11')).toBe(MON)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('handles overnight durations', () => {
    expect(durationMinutes('23:30', '07:30')).toBe(480)
    expect(durationMinutes('09:00', '10:15')).toBe(75)
  })
})

describe('occurrences', () => {
  it('only includes blocks on matching weekdays', () => {
    const d = data([{ days: [1] as Weekday[] }, { days: [2] as Weekday[] }])
    expect(occurrencesOn(d, MON).map((o) => o.sourceId)).toEqual(['b0'])
  })

  it('ends overnight blocks on the next day', () => {
    const d = data([{ start: '23:30', end: '07:30' }])
    const [o] = occurrencesOn(d, MON)
    expect(o.end).toBe(atTime(addDays(MON, 1), '07:30'))
  })

  it('respects blocks hidden for a single day', () => {
    const d = data([{}], { hidden: { [MON]: ['b0'] } })
    expect(occurrencesOn(d, MON)).toHaveLength(0)
    expect(occurrencesOn(d, addDays(MON, 1))).toHaveLength(1)
  })

  it('finds the current overnight block after midnight', () => {
    const d = data([{ start: '23:30', end: '07:30', days: [1] as Weekday[] }])
    const tue = addDays(MON, 1)
    const state = nowState(d, atTime(tue, '02:00'), tue)
    expect(state.current.map((o) => o.key)).toEqual([`${MON}:b0`])
  })
})

describe('reminders', () => {
  it('fires each reminder type once inside the window', () => {
    const d = data([{ start: '09:00', end: '10:00', reminders: { beforeStart: 5, atStart: true, beforeEnd: 10 } }])
    const from = atTime(MON, '08:00')
    const to = atTime(MON, '10:00')
    const due = dueReminders(d, from, to)
    expect(due.map((r) => r.type)).toEqual(['beforeStart', 'atStart', 'beforeEnd'])
    expect(due[0].at).toBe(atTime(MON, '08:55'))
    // a later window must not repeat them
    expect(dueReminders(d, to, to + 60_000)).toHaveLength(0)
  })

  it('uses default reminders when a block has none', () => {
    const d = data([{ reminders: null }])
    const due = dueReminders(d, atTime(MON, '08:00'), atTime(MON, '09:00'))
    expect(due.map((r) => r.type)).toEqual(['beforeStart', 'atStart'])
  })

  it('fires a reminder for tomorrow early morning just before midnight', () => {
    const d = data([{ start: '00:05', end: '01:00', reminders: { beforeStart: 10, atStart: false, beforeEnd: null } }])
    const due = dueReminders(d, atTime(MON, '23:50'), atTime(MON, '23:56'))
    expect(due).toHaveLength(1)
    expect(due[0].occurrence.dateKey).toBe(addDays(MON, 1))
  })

  it('finds reminders across a multi-day window', () => {
    const d = data([{ start: '09:00', end: '10:00', reminders: { beforeStart: null, atStart: true, beforeEnd: null } }])
    const due = dueReminders(d, atTime(MON, '10:00'), atTime(addDays(MON, 3), '08:00'))
    expect(due.map((r) => r.occurrence.dateKey)).toEqual([addDays(MON, 1), addDays(MON, 2)])
  })

  it('skips a before-end reminder longer than the block', () => {
    const d = data([{ start: '09:00', end: '09:05', reminders: { beforeStart: null, atStart: false, beforeEnd: 10 } }])
    expect(dueReminders(d, atTime(MON, '08:00'), atTime(MON, '10:00'))).toHaveLength(0)
  })
})

describe('checklist', () => {
  const withChecklist = (extra: Partial<AppData> = {}): AppData =>
    data([], {
      checklist: [
        { id: 'late', text: 'Late', days: [1, 2, 3, 4, 5, 6, 7], time: '21:00' },
        { id: 'free', text: 'Anytime', days: [1, 2, 3, 4, 5, 6, 7], time: null },
        { id: 'early', text: 'Early', days: [1], time: '08:00' }
      ],
      ...extra
    })

  it('lists the day\'s items with timed ones first, by time', () => {
    expect(checklistOn(withChecklist(), MON).map((c) => c.id)).toEqual(['early', 'late', 'free'])
    expect(checklistOn(withChecklist(), addDays(MON, 1)).map((c) => c.id)).toEqual(['late', 'free'])
  })

  it('reminds only for timed items that are not ticked off', () => {
    const d = withChecklist({ checks: { [MON]: ['early'] } })
    const due = dueChecklist(d, atTime(MON, '00:00'), atTime(addDays(MON, 1), '23:59'))
    expect(due.map((c) => c.id)).toEqual([`${MON}:check:late`, `${addDays(MON, 1)}:check:late`])
  })

  it('reports unchecked items for the review', () => {
    const d = withChecklist({ checks: { [MON]: ['free'] } })
    expect(uncheckedOn(d, MON).map((c) => c.id)).toEqual(['early', 'late'])
  })

  it('validates checklist data', () => {
    const d = normalizeData(
      {
        checklist: [
          { id: 'a', text: 'ok', days: [1, 1, 8], time: '25:00' },
          { id: 'b', text: 'no days', days: [] }
        ],
        checks: { [MON]: ['a', 'a', 3], nonsense: ['a'] }
      },
      'en'
    )
    expect(d.checklist).toEqual([{ id: 'a', text: 'ok', days: [1], time: null }])
    expect(d.checks).toEqual({ [MON]: ['a'] })
  })
})

describe('overlaps', () => {
  it('detects overlaps on shared days, including overnight blocks', () => {
    const blocks = data([
      { start: '09:00', end: '10:00', days: [1] as Weekday[] },
      { start: '22:00', end: '01:00', days: [1] as Weekday[] }
    ]).blocks
    expect(findOverlaps(blocks, { id: 'x', days: [1], start: '09:30', end: '11:00' }).map((b) => b.id)).toEqual(['b0'])
    expect(findOverlaps(blocks, { id: 'x', days: [2], start: '09:30', end: '11:00' })).toHaveLength(0)
    expect(findOverlaps(blocks, { id: 'x', days: [1], start: '23:00', end: '23:30' }).map((b) => b.id)).toEqual(['b1'])
  })
})

describe('stats', () => {
  const now = atTime(addDays(MON, 3), '23:59')

  it('counts partial as half and ignores untracked categories', () => {
    const d = data([{}, { categoryId: 'rest', start: '12:00', end: '13:00' }], {
      logs: { [MON]: { b0: { status: 'partial', at: '' } } }
    })
    const s = dayStat(d, MON, now)
    expect(s.plannedMin).toBe(60)
    expect(s.doneMin).toBe(30)
    expect(s.total).toBe(1)
  })

  it('ignores blocks that have not started yet today', () => {
    const d = data([{ start: '09:00', end: '10:00' }, { start: '15:00', end: '16:00' }])
    expect(dayStat(d, MON, atTime(MON, '12:00')).total).toBe(1)
  })

  it('counts a streak and breaks it on a failed day', () => {
    const logs: AppData['logs'] = {}
    for (const k of [MON, addDays(MON, 2), addDays(MON, 3)]) logs[k] = { b0: { status: 'done', at: '' } }
    const d = data([{}], { logs })
    // Tue failed, Wed + Thu succeeded
    expect(streak(d, addDays(MON, 3), now)).toBe(2)
  })

  it('treats days without a tracked plan as neutral', () => {
    const d = data([{ days: [1, 3] as Weekday[] }], {
      logs: { [MON]: { b0: { status: 'done', at: '' } }, [addDays(MON, 2)]: { b0: { status: 'done', at: '' } } }
    })
    expect(streak(d, addDays(MON, 2), now)).toBe(2)
  })

  it('ignores days before the user started', () => {
    const d = data([{}], { startedOn: addDays(MON, 2), logs: { [addDays(MON, 2)]: { b0: { status: 'done', at: '' } } } })
    expect(dayStat(d, MON, now).plannedMin).toBe(0)
    expect(rangeStats(d, MON, addDays(MON, 2), now).plannedMin).toBe(60)
    // Mon/Tue are before the start date, so they neither break nor extend the streak
    expect(streak(d, addDays(MON, 2), now)).toBe(1)
  })

  it('aggregates per category', () => {
    const d = data([{}], { logs: { [MON]: { b0: { status: 'done', at: '' } } } })
    const r = rangeStats(d, MON, addDays(MON, 1), now)
    expect(r.categories).toEqual([{ categoryId: 'work', plannedMin: 120, doneMin: 60 }])
  })

  it('lists unmarked tracked blocks that already ended', () => {
    const d = data([{ start: '09:00', end: '10:00' }, { start: '11:00', end: '12:00' }], {
      logs: { [MON]: { b1: { status: 'done', at: '' } } }
    })
    expect(unmarkedToday(d, MON, atTime(MON, '13:00')).map((o) => o.sourceId)).toEqual(['b0'])
  })
})

describe('newTopic', () => {
  it('creates long, valid, unique topics', () => {
    const a = newTopic()
    expect(a).toMatch(/^ritim-[a-z2-9]{12}$/)
    expect(newTopic()).not.toBe(a)
  })
})

describe('normalizeData', () => {
  it('drops invalid entries instead of failing', () => {
    const d = normalizeData(
      {
        categories: [{ id: 'c', name: 'C', color: 'red' }],
        blocks: [
          { id: 'ok', title: 'ok', categoryId: 'c', days: [1, 9, 1], start: '09:00', end: '10:00' },
          { id: 'bad-time', title: 'x', categoryId: 'c', days: [1], start: '9am', end: '10:00' },
          { id: 'bad-cat', title: 'x', categoryId: 'nope', days: [1], start: '09:00', end: '10:00' }
        ],
        settings: { lang: 'tr', gridStartHour: 20, gridEndHour: 5 }
      },
      'en'
    )
    expect(d.blocks.map((b) => b.id)).toEqual(['ok'])
    expect(d.blocks[0].days).toEqual([1])
    expect(d.categories[0].color).toBe('#8b8d98')
    expect(d.settings.lang).toBe('tr')
    expect(d.settings.gridStartHour).toBe(6)
  })

  it('validates phone settings', () => {
    const ok = normalizeData(
      { settings: { phone: { enabled: true, server: 'https://ntfy.example.com/', topic: 'ritim-abc', privateMode: true } } },
      'en'
    )
    expect(ok.settings.phone).toEqual({ enabled: true, server: 'https://ntfy.example.com', topic: 'ritim-abc', privateMode: true, actions: true })
    const bad = normalizeData({ settings: { phone: { enabled: true, server: 'javascript:x', topic: 'a b/c' } } }, 'en')
    expect(bad.settings.phone).toEqual({ enabled: true, server: 'https://ntfy.sh', topic: '', privateMode: false, actions: true })
  })
})
