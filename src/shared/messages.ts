import { translator } from './i18n'
import { nowState } from './schedule'
import { clockOf, toDateKey } from './time'
import type { AppData, DueChecklist, DueReminder } from './types'

export interface ReminderMessage {
  title: string
  body: string
  /** Generic text for the phone in private mode: no titles, times, categories or notes */
  privateTitle: string
  privateBody: string
}

/** Notification text for a reminder, shared by desktop notifications and the phone sync. */
export function reminderMessage(data: AppData, r: DueReminder): ReminderMessage {
  const t = translator(data.settings.lang)
  const o = r.occurrence
  const category = data.categories.find((c) => c.id === o.categoryId)?.name ?? ''
  const privateBody = t('notify.private.body')

  if (r.type === 'beforeStart') {
    const n = o.reminders.beforeStart ?? 0
    return {
      title: t('notify.beforeStart', { n, title: o.title }),
      body: `${clockOf(o.start)}–${clockOf(o.end)} · ${category}`,
      privateTitle: t('notify.private.beforeStart', { n }),
      privateBody
    }
  }
  if (r.type === 'atStart') {
    return {
      title: t('notify.atStart', { title: o.title }),
      body: [t('notify.until', { t: clockOf(o.end) }), o.note].filter(Boolean).join(' · '),
      privateTitle: t('notify.private.atStart'),
      privateBody
    }
  }
  const n = o.reminders.beforeEnd ?? 0
  const { next } = nowState(data, o.end - 1, toDateKey(new Date(o.end - 1)))
  const upcoming = next && next.start >= o.end - 60_000 ? next : null
  return {
    title: t('notify.beforeEnd', { n, title: o.title }),
    body: upcoming ? t('notify.nextUp', { title: upcoming.title, t: clockOf(upcoming.start) }) : category,
    privateTitle: t('notify.private.beforeEnd', { n }),
    privateBody
  }
}

export function checklistMessage(data: AppData, c: DueChecklist): ReminderMessage {
  const t = translator(data.settings.lang)
  return {
    title: t('notify.check', { text: c.item.text }),
    body: t('notify.checkBody'),
    privateTitle: t('notify.private.check'),
    privateBody: t('notify.private.body')
  }
}
