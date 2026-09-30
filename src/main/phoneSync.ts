import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { reminderMessage } from '@shared/messages'
import { dueReminders } from '@shared/schedule'
import type { AppData, PhoneSettings } from '@shared/types'
import { cancelOnPhone, pushToPhone } from './push'

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
    for (const r of dueReminders(data, now + MIN_LEAD_MS, now + WINDOW_MS)) {
      if (r.at < mutedUntil) continue
      const m = reminderMessage(data, r)
      const [title, body] = phone.privateMode ? [m.privateTitle, m.privateBody] : [m.title, m.body]
      out.set(sequenceId(r.id), { at: r.at, title, body, hash: `${r.at}|${title}|${body}` })
    }
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
      await pushToPhone(phone, d.title, d.body, { at: d.at, sequenceId: sid })
      this.state.entries[sid] = { at: d.at, hash: d.hash }
      this.save()
    }
    this.save()
  }
}
