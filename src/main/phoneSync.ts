import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { checklistMessage, reminderMessage, type ReminderMessage } from '@shared/messages'
import { dueChecklist, dueReminders } from '@shared/schedule'
import { actionTopic, markAction } from '@shared/actions'
import { translator } from '@shared/i18n'
import type { AppData, DueReminder, PhoneSettings, Status } from '@shared/types'
import { cancelOnPhone, pushToPhone, type PhoneAction } from './push'

/**
 * Keeps the phone's upcoming reminders queued on the ntfy server as scheduled
 * messages, so they arrive even while this computer is off.
 *
 * Every reminder has a stable sequence id; the server replaces a scheduled
 * message published again under the same id and cancels it on DELETE. We only
 * send what changed, because ntfy.sh allows ~250 requests per day per IP and
 * cancellations count too.
 */

/** ntfy accepts delays of at most 3 days. */
const WINDOW_MS = 70 * 3_600_000
/** ntfy needs at least 10 s of delay; leave reminders closer than this alone. */
const MIN_LEAD_MS = 30_000
const PERIODIC_MS = 5 * 60_000

interface Entry {
  at: number
  hash: string
}

interface State {
  server: string
  topic: string
  entries: Record<string, Entry>
}

export interface PhoneSyncStatus {
  scheduled: number
  lastSync: number | null
  error: string | null
}

interface Desired extends Entry {
  title: string
  body: string
  actions?: PhoneAction[]
}

const sequenceId = (reminderId: string): string => reminderId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)

export class PhoneSync {
  private state: State
  private running = false
  private again = false
  private debounce: NodeJS.Timeout | null = null
  private timer: NodeJS.Timeout | null = null
  status: PhoneSyncStatus = { scheduled: 0, lastSync: null, error: null }

  constructor(private readonly getData: () => AppData) {
    this.state = this.load()
    this.status.scheduled = Object.keys(this.state.entries).length
  }

  private get file(): string {
    return join(app.getPath('userData'), 'phone-schedule.json')
  }

  private load(): State {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as State
        if (raw && typeof raw.entries === 'object') return raw
      }
    } catch (err) {
      console.error('Could not read phone schedule state:', err)
    }
    return { server: '', topic: '', entries: {} }
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify(this.state))
    this.status.scheduled = Object.keys(this.state.entries).length
  }

  start(): void {
    void this.run()
    this.timer = setInterval(() => void this.run(), PERIODIC_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
  }

  /** Call after any data change; bursts of edits are combined. */
  schedule(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.run(), 2_000)
  }

  async run(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    try {
      await this.sync()
      this.status.error = null
    } catch (err) {
      this.status.error = err instanceof Error ? err.message : String(err)
      console.error('Phone sync failed:', err)
    } finally {
      this.status.lastSync = Date.now()
      this.running = false
      if (this.again) {
        this.again = false
        void this.run()
      }
    }
  }

  private desired(data: AppData, now: number): Map<string, Desired> {
    const out = new Map<string, Desired>()
    const phone = data.settings.phone
    if (!phone.enabled || !phone.topic) return out
    const mutedUntil = data.settings.dndUntil ? Date.parse(data.settings.dndUntil) : 0
    const add = (id: string, at: number, m: ReminderMessage, actions?: PhoneAction[]): void => {
      if (at < mutedUntil) return
      const [title, body] = phone.privateMode ? [m.privateTitle, m.privateBody] : [m.title, m.body]
      out.set(sequenceId(id), { at, title, body, actions, hash: `${at}|${title}|${body}|${actions ? 'a' : ''}` })
    }
    const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
    const t = translator(data.settings.lang)
    const url = `${phone.server.replace(/\/+$/, '')}/${encodeURIComponent(actionTopic(phone.topic))}`
    // Done / Partly / Skip buttons on "started" and "ending soon" reminders of tracked blocks.
    const buttons = (r: DueReminder): PhoneAction[] | undefined => {
      if (!phone.actions || r.type === 'beforeStart' || !tracked.has(r.occurrence.categoryId)) return undefined
      const statuses: [Status, 'status.done' | 'status.partial' | 'status.skipped'][] = [
        ['done', 'status.done'],
        ['partial', 'status.partial'],
        ['skipped', 'status.skipped']
      ]
      return statuses.map(([status, label]) => ({
        action: 'http',
        label: t(label),
        url,
        method: 'POST',
        body: markAction(r.occurrence.dateKey, r.occurrence.sourceId, status),
        clear: true
      }))
    }
    const from = now + MIN_LEAD_MS
    const to = now + WINDOW_MS
    for (const r of dueReminders(data, from, to)) add(r.id, r.at, reminderMessage(data, r), buttons(r))
    // Ticking an item off removes it here, so its queued phone reminder gets cancelled.
    for (const c of dueChecklist(data, from, to)) add(c.id, c.at, checklistMessage(data, c))
    return out
  }

  private async sync(): Promise<void> {
    const data = this.getData()
    const phone = data.settings.phone
    const now = Date.now()

    // Already delivered by the server.
    for (const [sid, e] of Object.entries(this.state.entries)) if (e.at <= now) delete this.state.entries[sid]

    // Moved to another topic/server: cancel everything queued on the old one.
    if (this.state.topic && (this.state.topic !== phone.topic || this.state.server !== phone.server)) {
      const old: PhoneSettings = { ...phone, server: this.state.server, topic: this.state.topic }
      for (const [sid, e] of Object.entries(this.state.entries)) {
        if (e.at > now + MIN_LEAD_MS) await cancelOnPhone(old, sid)
        delete this.state.entries[sid]
        this.save()
      }
    }
    this.state.server = phone.server
    this.state.topic = phone.topic

    const want = this.desired(data, now)

    for (const [sid, e] of Object.entries(this.state.entries)) {
      // Reminders about to fire are left alone (they may be in flight).
      if (want.has(sid) || e.at <= now + MIN_LEAD_MS) continue
      await cancelOnPhone(phone, sid)
      delete this.state.entries[sid]
      this.save()
    }

    for (const [sid, d] of want) {
      if (this.state.entries[sid]?.hash === d.hash) continue
      await pushToPhone(phone, d.title, d.body, { at: d.at, sequenceId: sid, actions: d.actions })
      this.state.entries[sid] = { at: d.at, hash: d.hash }
      this.save()
    }
    this.save()
  }
}
