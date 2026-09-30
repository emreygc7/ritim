import { isValidHM } from './time'
import type { AppData, Block, Category, ChecklistItem, Lang, OneOff, Reminders, Settings, Weekday } from './types'

export function defaultSettings(lang: Lang): Settings {
  return {
    lang,
    theme: 'system',
    defaultReminders: { beforeStart: 5, atStart: true, beforeEnd: null },
    sound: true,
    dndUntil: null,
    dayReviewTime: null,
    autostart: false,
    closeToTray: true,
    gridStartHour: 6,
    gridEndHour: 24,
    phone: { enabled: false, server: 'https://ntfy.sh', topic: '', privateMode: false, actions: true },
    markdownDir: null,
    focusMinutes: 25,
    breakMinutes: 5,
    checkUpdates: true
  }
}

export function emptyData(lang: Lang): AppData {
  return {
    version: 1,
    onboarded: false,
    startedOn: null,
    categories: [],
    blocks: [],
    oneOffs: [],
    logs: {},
    hidden: {},
    checklist: [],
    checks: {},
    plans: [],
    dayPlans: {},
    settings: defaultSettings(lang)
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

function reminders(v: unknown): Reminders | null {
  if (!isObj(v)) return null
  return { beforeStart: num(v.beforeStart), atStart: v.atStart === true, beforeEnd: num(v.beforeEnd) }
}

function base(v: Record<string, unknown>) {
  const note = str(v.note)
  return {
    id: str(v.id),
    title: str(v.title),
    categoryId: str(v.categoryId),
    start: str(v.start),
    end: str(v.end),
    ...(note ? { note } : {}),
    reminders: reminders(v.reminders)
  }
}

const weekdays = (v: unknown): Weekday[] =>
  Array.isArray(v)
    ? ([...new Set(v.filter((d): d is Weekday => Number.isInteger(d) && d >= 1 && d <= 7))].sort() as Weekday[])
    : []

const validBase = (b: { id: string; start: string; end: string; title: string }): boolean =>
  b.id !== '' && b.title !== '' && isValidHM(b.start) && isValidHM(b.end) && b.start !== b.end

/**
 * Turns untrusted JSON (from disk or an import) into valid AppData.
 * Invalid entries are dropped instead of failing the whole file.
 */
export function normalizeData(raw: unknown, lang: Lang): AppData {
  const data = emptyData(lang)
  if (!isObj(raw)) return data

  data.onboarded = raw.onboarded === true
  if (typeof raw.startedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.startedOn)) data.startedOn = raw.startedOn

  if (Array.isArray(raw.categories)) {
    data.categories = raw.categories.filter(isObj).map(
      (c): Category => ({
        id: str(c.id),
        // An empty name (e.g. mid-edit) must not drop the category and its blocks.
        name: str(c.name).trim(),
        color: /^#[0-9a-f]{6}$/i.test(str(c.color)) ? str(c.color) : '#8b8d98',
        track: c.track !== false
      })
    ).filter((c) => c.id)
  }
  const catIds = new Set(data.categories.map((c) => c.id))

  if (Array.isArray(raw.plans)) {
    data.plans = raw.plans
      .filter(isObj)
      .map((p) => ({ id: str(p.id), name: str(p.name).trim().slice(0, 40) }))
      .filter((p) => p.id)
  }
  const planIds = new Set(data.plans.map((p) => p.id))

  if (Array.isArray(raw.blocks)) {
    data.blocks = raw.blocks.filter(isObj).map(
      (b): Block => ({
        ...base(b),
        days: weekdays(b.days),
        ...(typeof b.planId === 'string' && b.planId ? { planId: b.planId } : {})
      })
    ).filter(
      (b) =>
        validBase(b) &&
        catIds.has(b.categoryId) &&
        (b.planId ? planIds.has(b.planId) : b.days.length > 0)
    )
  }

  if (Array.isArray(raw.oneOffs)) {
    data.oneOffs = raw.oneOffs.filter(isObj).map(
      (o): OneOff => ({ ...base(o), date: str(o.date) })
    ).filter((o) => validBase(o) && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && catIds.has(o.categoryId))
  }

  if (isObj(raw.logs)) {
    for (const [day, entries] of Object.entries(raw.logs)) {
      if (!isObj(entries)) continue
      const out: AppData['logs'][string] = {}
      for (const [id, e] of Object.entries(entries)) {
        if (!isObj(e) || !['done', 'partial', 'skipped'].includes(str(e.status))) continue
        const note = str(e.note)
        out[id] = { status: e.status as 'done', at: str(e.at, new Date(0).toISOString()), ...(note ? { note } : {}) }
      }
      if (Object.keys(out).length) data.logs[day] = out
    }
  }

  if (Array.isArray(raw.checklist)) {
    data.checklist = raw.checklist
      .filter(isObj)
      .map(
        (c): ChecklistItem => ({
          id: str(c.id),
          // Kept even when empty (mid-edit); the UI shows a placeholder.
          text: str(c.text).slice(0, 160),
          days: weekdays(c.days),
          time: typeof c.time === 'string' && isValidHM(c.time) ? c.time : null
        })
      )
      .filter((c) => c.id && c.days.length > 0)
  }

  if (isObj(raw.checks)) {
    for (const [day, ids] of Object.entries(raw.checks)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(ids)) continue
      const clean = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
      if (clean.length) data.checks[day] = clean
    }
  }

  if (isObj(raw.dayPlans)) {
    for (const [day, planId] of Object.entries(raw.dayPlans)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof planId === 'string' && planIds.has(planId)) data.dayPlans[day] = planId
    }
  }

  if (isObj(raw.hidden)) {
    for (const [day, ids] of Object.entries(raw.hidden)) {
      if (Array.isArray(ids)) data.hidden[day] = ids.filter((x): x is string => typeof x === 'string')
    }
  }

  if (isObj(raw.settings)) {
    const s = raw.settings
    const d = data.settings
    if (s.lang === 'tr' || s.lang === 'en') d.lang = s.lang
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') d.theme = s.theme
    d.defaultReminders = reminders(s.defaultReminders) ?? d.defaultReminders
    d.sound = s.sound !== false
    d.dndUntil = typeof s.dndUntil === 'string' ? s.dndUntil : null
    d.dayReviewTime = typeof s.dayReviewTime === 'string' && isValidHM(s.dayReviewTime) ? s.dayReviewTime : null
    d.autostart = s.autostart === true
    d.closeToTray = s.closeToTray !== false
    if (isObj(s.phone)) {
      const server = str(s.phone.server).trim()
      d.phone = {
        enabled: s.phone.enabled === true,
        server: /^https?:\/\/\S+$/.test(server) ? server.replace(/\/+$/, '') : d.phone.server,
        topic: /^[\w-]{1,64}$/.test(str(s.phone.topic)) ? str(s.phone.topic) : '',
        privateMode: s.phone.privateMode === true,
        actions: s.phone.actions !== false
      }
    }
    // Absolute paths only: "/home/..." on Linux/macOS, "C:\\..." or "\\\\server\\share" on Windows.
    d.markdownDir =
      typeof s.markdownDir === 'string' && /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(s.markdownDir) ? s.markdownDir : null
    const minutes = (v: unknown, fallback: number): number => {
      const n = num(v)
      return n !== null && n >= 1 && n <= 180 ? Math.round(n) : fallback
    }
    d.focusMinutes = minutes(s.focusMinutes, d.focusMinutes)
    d.breakMinutes = minutes(s.breakMinutes, d.breakMinutes)
    d.checkUpdates = s.checkUpdates !== false
    const gs = num(s.gridStartHour)
    const ge = num(s.gridEndHour)
    if (gs !== null && ge !== null && gs < ge && ge <= 24) {
      d.gridStartHour = Math.floor(gs)
      d.gridEndHour = Math.floor(ge)
    }
  }
  return data
}

/** Long random topic name: the topic is the only thing protecting messages on a public ntfy server. */
export function newTopic(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return 'ritim-' + Array.from(bytes, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
