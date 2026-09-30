import { describe, expect, it } from 'vitest'
import { markAction, parseMarkAction } from './actions'
import { eventsToOneOffs, parseIcs } from './ics'
import { dailyMarkdown, isoWeek, weeklyFileName, weeklyMarkdown } from './markdown'
import { normalizeData } from './normalize'
import { dueReminders, findOverlaps, occurrencesOn } from './schedule'
import { checklistStreak } from './stats'
import { addDays, atTime } from './time'
import type { AppData } from './types'
import { compareVersions } from './version'

const MON = '2026-10-05'

function base(extra: Record<string, unknown> = {}): AppData {
  return normalizeData(
    {
      categories: [{ id: 'work', name: 'Work', color: '#2a78d6', track: true }],
      plans: [{ id: 'light', name: 'Light day' }],
      blocks: [
        { id: 'deep', title: 'Deep work', categoryId: 'work', days: [1, 2, 3, 4, 5], start: '09:00', end: '11:00', reminders: null },
        { id: 'min', title: 'Minimum', categoryId: 'work', days: [], planId: 'light', start: '10:00', end: '10:30', reminders: null }
      ],
      ...extra
    },
    'en'
  )
}

describe('day plans', () => {
  it('uses the weekly template unless the date has a plan', () => {
    expect(occurrencesOn(base(), MON).map((o) => o.sourceId)).toEqual(['deep'])
    const d = base({ dayPlans: { [MON]: 'light' } })
    expect(occurrencesOn(d, MON).map((o) => o.sourceId)).toEqual(['min'])
    expect(occurrencesOn(d, addDays(MON, 1)).map((o) => o.sourceId)).toEqual(['deep'])
  })

  it('drops plan blocks and day plans that point to missing plans', () => {
    const d = normalizeData(
      {
        categories: [{ id: 'c', name: 'C', color: '#2a78d6' }],
        blocks: [{ id: 'x', title: 'x', categoryId: 'c', days: [], planId: 'gone', start: '09:00', end: '10:00' }],
        dayPlans: { [MON]: 'gone' }
      },
      'en'
    )
    expect(d.blocks).toEqual([])
    expect(d.dayPlans).toEqual({})
  })

  it('only reports overlaps within the same plan', () => {
    const d = base()
    expect(findOverlaps(d.blocks, { id: 'n', days: [1], start: '10:00', end: '10:15' }).map((b) => b.id)).toEqual(['deep'])
    expect(findOverlaps(d.blocks, { id: 'n', days: [], start: '10:00', end: '10:15', planId: 'light' }).map((b) => b.id)).toEqual(['min'])
  })
})

describe('markdown folder', () => {
  it('accepts absolute Linux, macOS and Windows paths only', () => {
    const dir = (markdownDir: string): string | null => normalizeData({ settings: { markdownDir } }, 'en').settings.markdownDir
    expect(dir('/home/me/vault/Ritim')).toBe('/home/me/vault/Ritim')
    expect(dir('C:\\Users\\me\\Vault')).toBe('C:\\Users\\me\\Vault')
    expect(dir('D:/Notes')).toBe('D:/Notes')
    expect(dir('\\\\server\\share')).toBe('\\\\server\\share')
    expect(dir('relative/path')).toBeNull()
  })
})

describe('reminders for marked blocks', () => {
  it('stops reminding once a block is marked', () => {
    const d = base({ logs: { [MON]: { deep: { status: 'skipped', at: '' } } } })
    expect(dueReminders(d, atTime(MON, '08:00'), atTime(MON, '12:00'))).toHaveLength(0)
  })
})

describe('checklist streak', () => {
  it('counts scheduled days only and continues through today', () => {
    const d = base({
      checklist: [{ id: 'c', text: 'x', days: [1, 3, 5], time: null }],
      checks: { [MON]: ['c'], [addDays(MON, 2)]: ['c'] }
    })
    // Tue is not scheduled, so Mon and Wed count; Fri (today) is still open.
    expect(checklistStreak(d, 'c', addDays(MON, 4))).toBe(2)
    expect(checklistStreak({ ...d, checks: { ...d.checks, [addDays(MON, 4)]: ['c'] } }, 'c', addDays(MON, 4))).toBe(3)
  })
})

describe('phone actions', () => {
  it('round-trips and rejects anything unexpected', () => {
    expect(parseMarkAction(markAction(MON, 'deep', 'done'))).toEqual({ v: 1, type: 'mark', date: MON, id: 'deep', status: 'done' })
    expect(parseMarkAction('{"v":1,"type":"mark","date":"x","id":"a","status":"done"}')).toBeNull()
    expect(parseMarkAction('{"v":1,"type":"mark","date":"2026-10-05","id":"a","status":"hacked"}')).toBeNull()
    expect(parseMarkAction('not json')).toBeNull()
  })
})

describe('versions', () => {
  it('compares semver-like strings', () => {
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0)
  })
})

describe('ics import', () => {
  it('reads timed events, unfolds lines and skips all-day, recurring and cancelled ones', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:1',
      'SUMMARY:Team sync\\, weekly',
      'DTSTART:20261005T090000',
      'DTEND:20261005T093000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2',
      'SUMMARY:Long ',
      ' title',
      'DTSTART:20261005T120000Z',
      'DTEND:20261005T130000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Holiday',
      'DTSTART;VALUE=DATE:20261006',
      'DTEND;VALUE=DATE:20261007',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Standup',
      'DTSTART:20261005T100000',
      'DTEND:20261005T101500',
      'RRULE:FREQ=DAILY',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Cancelled',
      'STATUS:CANCELLED',
      'DTSTART:20261005T150000',
      'DTEND:20261005T160000',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const r = parseIcs(ics)
    expect(r.events.map((e) => e.summary)).toEqual(['Team sync, weekly', 'Longtitle'.replace('Longtitle', 'Long title')])
    expect(r.events[0].start).toBe(atTime(MON, '09:00'))
    expect(r.events[1].start).toBe(Date.UTC(2026, 9, 5, 12, 0))
    expect(r.skipped).toBe(3)

    const blocks = eventsToOneOffs([], r.events, 'cal')
    expect(blocks[0]).toMatchObject({ title: 'Team sync, weekly', date: MON, start: '09:00', end: '09:30', categoryId: 'cal' })
    // Importing the same file again adds nothing.
    expect(eventsToOneOffs(blocks, r.events, 'cal')).toEqual([])
  })
})

describe('markdown', () => {
  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeek('2026-10-05')).toEqual({ year: 2026, week: 41 })
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    expect(weeklyFileName('2026-10-07')).toBe('2026-W41.md')
  })

  it('writes a daily note with front matter, a block table and the checklist', () => {
    const d = base({
      logs: { [MON]: { deep: { status: 'done', at: '', note: 'a | b' } } },
      checklist: [{ id: 'c', text: 'Water', days: [1], time: null }],
      checks: { [MON]: ['c'] }
    })
    const md = dailyMarkdown(d, MON, atTime(addDays(MON, 1), '00:00'))
    expect(md).toContain('date: 2026-10-05')
    expect(md).toContain('completion: 100')
    expect(md).toContain('| 09:00–11:00 | Deep work | Work | ✅ Done | a \\| b |')
    expect(md).toContain('- [x] Water')
  })

  it('writes a weekly note with links to the daily notes', () => {
    const md = weeklyMarkdown(base(), addDays(MON, 2), atTime(addDays(MON, 7), '00:00'))
    expect(md).toContain('week: 2026-W41')
    expect(md).toContain('(2026-10-05.md)')
    expect(md).toContain('Deep work: 5 times')
  })
})
