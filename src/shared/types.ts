/** ISO weekday: 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Lang = 'tr' | 'en'
export type Theme = 'system' | 'light' | 'dark'

export interface Category {
  id: string
  name: string
  color: string
  /** Tracked categories count towards stats, streaks and the end-of-day review. */
  track: boolean
}

export interface Reminders {
  /** Minutes before start; null or 0 = off */
  beforeStart: number | null
  atStart: boolean
  /** Minutes before end; null or 0 = off */
  beforeEnd: number | null
}

interface BlockBase {
  id: string
  title: string
  categoryId: string
  /** "HH:MM" */
  start: string
  /** "HH:MM"; if end <= start the block ends on the next day */
  end: string
  note?: string
  /** null = use the default reminders from settings */
  reminders: Reminders | null
}

/** Repeats every week on the given weekdays. */
export interface Block extends BlockBase {
  days: Weekday[]
}

/** Happens once on a specific date. */
export interface OneOff extends BlockBase {
  /** "YYYY-MM-DD" */
  date: string
}

export type Status = 'done' | 'partial' | 'skipped'

export interface LogEntry {
  status: Status
  note?: string
  /** ISO timestamp of when it was marked */
  at: string
}

/** Forwarding reminders to a phone through an ntfy server (https://ntfy.sh). */
export interface PhoneSettings {
  enabled: boolean
  /** e.g. "https://ntfy.sh" */
  server: string
  /** Secret-ish topic the phone subscribes to */
  topic: string
  /** Send only generic text (no titles, times, categories or notes) to the phone */
  privateMode: boolean
}

export interface Settings {
  lang: Lang
  theme: Theme
  defaultReminders: Reminders
  sound: boolean
  /** ISO timestamp; notifications are muted until then */
  dndUntil: string | null
  /** "HH:MM" or null; reminds to review unmarked blocks of the day */
  dayReviewTime: string | null
  autostart: boolean
  closeToTray: boolean
  /** Visible hour range of the week grid */
  gridStartHour: number
  gridEndHour: number
  phone: PhoneSettings
}

export interface AppData {
  version: 1
  onboarded: boolean
  /** "YYYY-MM-DD" of first use; stats ignore earlier days because the template repeats into the past */
  startedOn: string | null
  categories: Category[]
  blocks: Block[]
  oneOffs: OneOff[]
  /** logs[dateKey][sourceId] */
  logs: Record<string, Record<string, LogEntry>>
  /** hidden[dateKey] = sourceIds removed for that day only */
  hidden: Record<string, string[]>
  settings: Settings
}

export interface Occurrence {
  /** `${dateKey}:${sourceId}` */
  key: string
  sourceId: string
  kind: 'block' | 'oneoff'
  /** Date the occurrence starts on */
  dateKey: string
  title: string
  categoryId: string
  note?: string
  /** epoch ms */
  start: number
  end: number
  reminders: Reminders
}

export type ReminderType = 'beforeStart' | 'atStart' | 'beforeEnd'

export interface DueReminder {
  /** Unique id used to avoid firing twice */
  id: string
  type: ReminderType
  at: number
  occurrence: Occurrence
}
