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

/** Repeats every week on the given weekdays, or belongs to an alternative day plan. */
export interface Block extends BlockBase {
  days: Weekday[]
  /** Absent: part of the weekly template. Set: part of that alternative day plan (days are ignored). */
  planId?: string
}

/** An alternative day, e.g. "Light day" or "Vacation", that can replace the template on a date. */
export interface Plan {
  id: string
  name: string
}

/** Happens once on a specific date. */
export interface OneOff extends BlockBase {
  /** "YYYY-MM-DD" */
  date: string
}

/** Something to do every (selected) day, optionally with a reminder time. */
export interface ChecklistItem {
  id: string
  text: string
  days: Weekday[]
  /** "HH:MM" to get a reminder, or null */
  time: string | null
}

/** A free-form Markdown note. Tags come from #hashtags in the body. */
export interface Note {
  id: string
  title: string
  /** Markdown */
  body: string
  pinned: boolean
  /** Blocks or one-offs this note belongs to; shown next to them on the Today page */
  blockIds: string[]
  /** ISO timestamps */
  createdAt: string
  updatedAt: string
  /** Set when moved to the trash */
  deletedAt: string | null
  /** Folder the note lives in; null = top level */
  folderId: string | null
}

/** A notes folder. Folders nest through parentId (null = top level). */
export interface NoteFolder {
  id: string
  name: string
  parentId: string | null
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
  /** Add Done / Partly / Skip buttons to phone notifications */
  actions: boolean
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
  /** Folder that receives daily and weekly Markdown summaries, or null */
  markdownDir: string | null
  focusMinutes: number
  breakMinutes: number
  /** Check GitHub releases for a newer version once a day */
  checkUpdates: boolean
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
  checklist: ChecklistItem[]
  /** checks[dateKey] = checklist item ids ticked off that day */
  checks: Record<string, string[]>
  plans: Plan[]
  /** dayPlans[dateKey] = plan used instead of the weekly template on that date */
  dayPlans: Record<string, string>
  notes: Note[]
  noteFolders: NoteFolder[]
  settings: Settings
}

export interface DueChecklist {
  /** Unique id used to avoid firing twice */
  id: string
  dateKey: string
  at: number
  item: ChecklistItem
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
