import { isValidHM } from './time'
import type { AppData, Block, Category, Lang, OneOff, Reminders, Settings, Weekday } from './types'

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
    phone: { enabled: false, server: 'https://ntfy.sh', topic: '', privateMode: false }
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

  if (Array.isArray(raw.blocks)) {
    data.blocks = raw.blocks.filter(isObj).map(
      (b): Block => ({
        ...base(b),
        days: Array.isArray(b.days)
          ? ([...new Set(b.days.filter((d): d is Weekday => Number.isInteger(d) && d >= 1 && d <= 7))].sort() as Weekday[])
          : []
      })
    ).filter((b) => validBase(b) && b.days.length > 0 && catIds.has(b.categoryId))
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
        privateMode: s.phone.privateMode === true
      }
    }
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
