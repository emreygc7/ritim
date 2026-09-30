import { translator } from './i18n'
import { checklistOn, isChecked, occurrencesOn, planFor } from './schedule'
import { dayStat, rangeStats, streak } from './stats'
import { addDays, clockOf, formatDuration, fromDateKey, isoWeekday, startOfWeek, toDateKey } from './time'
import type { AppData, Status } from './types'

/** ISO 8601 week number and week-based year of a date. */
export function isoWeek(dateKey: string): { year: number; week: number } {
  const d = fromDateKey(dateKey)
  d.setDate(d.getDate() + 4 - isoWeekday(dateKey)) // Thursday decides the year
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { year: d.getFullYear(), week }
}

export const dailyFileName = (dateKey: string): string => `${dateKey}.md`

export function weeklyFileName(dateKey: string): string {
  const { year, week } = isoWeek(dateKey)
  return `${year}-W${String(week).padStart(2, '0')}.md`
}

/** Keeps table cells intact: no pipes or line breaks inside a cell. */
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()

const pct = (done: number, planned: number): number => (planned ? Math.round((done / planned) * 100) : 0)

function statusLabel(t: ReturnType<typeof translator>, status: Status | null): string {
  if (status === 'done') return `✅ ${t('status.done')}`
  if (status === 'partial') return `🟡 ${t('status.partial')}`
  if (status === 'skipped') return `⏭️ ${t('status.skipped')}`
  return `⬜ ${t('md.unmarked')}`
}

/** One day as Markdown: front matter for Obsidian properties, blocks table and checklist. */
export function dailyMarkdown(data: AppData, dateKey: string, now: number): string {
  const lang = data.settings.lang
  const t = translator(lang)
  const stat = dayStat(data, dateKey, now)
  const done = pct(stat.doneMin, stat.plannedMin)
  const plan = data.plans.find((p) => p.id === planFor(data, dateKey))
  const title = fromDateKey(dateKey).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const logs = data.logs[dateKey] ?? {}
  const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
  const catName = (id: string): string => data.categories.find((c) => c.id === id)?.name ?? ''

  const lines = [
    '---',
    `date: ${dateKey}`,
    `completion: ${done}`,
    `planned_minutes: ${Math.round(stat.plannedMin)}`,
    `completed_minutes: ${Math.round(stat.doneMin)}`,
    ...(plan ? [`plan: "${plan.name.replace(/"/g, "'")}"`] : []),
    'tags: [ritim]',
    '---',
    '',
    `# ${title}`,
    '',
    `> ${t('md.generated')}`,
    '',
    `**${t('stats.completion')}:** ${t.pct(done)} · ${formatDuration(stat.doneMin, lang)} / ${formatDuration(stat.plannedMin, lang)}` +
      (plan ? ` · ${t('md.plan')}: ${plan.name}` : ''),
    '',
    `## ${t('md.blocks')}`,
    '',
    `| ${t('md.time')} | ${t('editor.title')} | ${t('editor.category')} | ${t('md.status')} | ${t('editor.note')} |`,
    '|---|---|---|---|---|'
  ]
  for (const o of occurrencesOn(data, dateKey)) {
    const log = logs[o.sourceId]
    const status = tracked.has(o.categoryId) ? statusLabel(t, log?.status ?? null) : '·'
    lines.push(
      `| ${clockOf(o.start)}–${clockOf(o.end)} | ${cell(o.title)} | ${cell(catName(o.categoryId))} | ${status} | ${cell(log?.note ?? '')} |`
    )
  }

  const items = checklistOn(data, dateKey)
  if (items.length) {
    lines.push('', `## ${t('checklist.title')}`, '')
    for (const c of items) {
      lines.push(`- [${isChecked(data, dateKey, c.id) ? 'x' : ' '}] ${c.text.replace(/\n/g, ' ')}${c.time ? ` (${c.time})` : ''}`)
    }
  }
  return lines.join('\n') + '\n'
}

/** One ISO week as Markdown: totals vs last week, categories, days, most missed blocks, checklist. */
export function weeklyMarkdown(data: AppData, anyDayKey: string, now: number): string {
  const lang = data.settings.lang
  const t = translator(lang)
  const from = startOfWeek(anyDayKey)
  const to = addDays(from, 6)
  const r = rangeStats(data, from, to, now)
  const prev = rangeStats(data, addDays(from, -7), addDays(from, -1), now)
  const done = pct(r.doneMin, r.plannedMin)
  const prevDone = pct(prev.doneMin, prev.plannedMin)
  const { year, week } = isoWeek(from)
  const fmt = (k: string, o: Intl.DateTimeFormatOptions): string => fromDateKey(k).toLocaleDateString(lang, o)
  const dur = (m: number): string => formatDuration(m, lang)

  const lines = [
    '---',
    `week: ${year}-W${String(week).padStart(2, '0')}`,
    `start: ${from}`,
    `end: ${to}`,
    `completion: ${done}`,
    'tags: [ritim, ritim-weekly]',
    '---',
    '',
    `# ${t('md.week', { n: week })} · ${fmt(from, { day: 'numeric', month: 'long' })}–${fmt(to, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    '',
    `> ${t('md.generated')}`,
    '',
    `- **${t('stats.completion')}:** ${t.pct(done)} · ${dur(r.doneMin)} / ${dur(r.plannedMin)}`
  ]
  if (prev.plannedMin > 0) {
    const diff = done - prevDone
    lines.push(`- **${t('md.lastWeek')}:** ${t.pct(prevDone)} (${diff >= 0 ? '+' : ''}${diff})`)
  }
  lines.push(`- **${t('stats.streak')}:** ${t('stats.streakDays', { n: streak(data, to, now) })}`)

  if (r.categories.length) {
    lines.push('', `## ${t('stats.byCategory')}`, '', `| ${t('editor.category')} | ${t('stats.done')} | ${t('stats.planned')} | % |`, '|---|---|---|---|')
    for (const c of r.categories) {
      const name = data.categories.find((x) => x.id === c.categoryId)?.name ?? ''
      lines.push(`| ${cell(name)} | ${dur(c.doneMin)} | ${dur(c.plannedMin)} | ${t.pct(pct(c.doneMin, c.plannedMin))} |`)
    }
  }

  lines.push('', `## ${t('stats.daily')}`, '', `| ${t('md.day')} | ${t('stats.completion')} | ${t('stats.done')} |`, '|---|---|---|')
  const todayKey = toDateKey(new Date(now))
  for (const d of r.days) {
    const label = fmt(d.dateKey, { weekday: 'long', day: 'numeric', month: 'short' })
    // Only days that have (or will get) a daily note are linked.
    const exported = d.dateKey <= todayKey && !(data.startedOn && d.dateKey < data.startedOn)
    const name = exported ? `[${label}](${dailyFileName(d.dateKey)})` : label
    const values = exported ? `${d.plannedMin ? t.pct(pct(d.doneMin, d.plannedMin)) : '-'} | ${dur(d.doneMin)} / ${dur(d.plannedMin)}` : '- | -'
    lines.push(`| ${name} | ${values} |`)
  }

  // Blocks most often skipped or left unmarked this week (tracked, already started).
  const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
  const missed = new Map<string, { title: string; n: number }>()
  for (let k = from; k <= to; k = addDays(k, 1)) {
    if (data.startedOn && k < data.startedOn) continue
    for (const o of occurrencesOn(data, k)) {
      if (!tracked.has(o.categoryId) || o.end > now) continue
      const s = data.logs[k]?.[o.sourceId]?.status
      if (s === 'done' || s === 'partial') continue
      const m = missed.get(o.title) ?? { title: o.title, n: 0 }
      m.n += 1
      missed.set(o.title, m)
    }
  }
  const top = [...missed.values()].sort((a, b) => b.n - a.n).slice(0, 3)
  if (top.length) {
    lines.push('', `## ${t('md.missed')}`, '')
    for (const m of top) lines.push(`- ${m.title.replace(/\n/g, ' ')}: ${t('md.times', { n: m.n })}`)
  }

  if (data.checklist.length) {
    lines.push('', `## ${t('checklist.title')}`, '')
    for (const c of data.checklist) {
      let scheduled = 0
      let ticked = 0
      for (let k = from; k <= to && k <= todayKey; k = addDays(k, 1)) {
        if (data.startedOn && k < data.startedOn) continue
        if (!c.days.includes(isoWeekday(k))) continue
        scheduled++
        if (isChecked(data, k, c.id)) ticked++
      }
      if (scheduled) lines.push(`- ${c.text.replace(/\n/g, ' ')}: ${ticked}/${scheduled}`)
    }
  }
  return lines.join('\n') + '\n'
}
