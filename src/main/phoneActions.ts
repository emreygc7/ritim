import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { actionTopic, parseMarkAction, type MarkAction } from '@shared/actions'
import type { PhoneSettings } from '@shared/types'

/**
 * Listens for Done / Partly / Skip taps from phone notifications. The buttons
 * post to a companion ntfy topic; we stream that topic, so no port has to be
 * opened on this computer. Taps made while the computer was off are kept by
 * the server for ~12 hours and picked up on the next start (`since=<last id>`).
 */
export class PhoneActions {
  private abort: AbortController | null = null
  private key = ''
  private backoff = 5_000
  private retry: NodeJS.Timeout | null = null

  constructor(private readonly onMark: (a: MarkAction) => void) {}

  private get file(): string {
    return join(app.getPath('userData'), 'phone-actions.json')
  }

  private lastId(): string | null {
    try {
      if (existsSync(this.file)) return (JSON.parse(readFileSync(this.file, 'utf8')) as { lastId?: string }).lastId ?? null
    } catch {
      // unreadable state: start from the server's cache window
    }
    return null
  }

  private saveLastId(id: string): void {
    try {
      writeFileSync(this.file, JSON.stringify({ lastId: id }))
    } catch (err) {
      console.error('Could not save phone action state:', err)
    }
  }

  /** (Re)connects when the configuration changed; disconnects when disabled. */
  configure(phone: PhoneSettings): void {
    const want = phone.enabled && phone.actions && phone.topic ? `${phone.server}|${phone.topic}` : ''
    if (want === this.key) return
    this.stop()
    this.key = want
    if (want) void this.connect(phone)
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
  }

  private async connect(phone: PhoneSettings): Promise<void> {
    const key = this.key
    const abort = new AbortController()
    this.abort = abort
    const since = this.lastId() ?? '12h'
    const url = `${phone.server.replace(/\/+$/, '')}/${encodeURIComponent(actionTopic(phone.topic))}/json?since=${encodeURIComponent(since)}`
    try {
      const res = await fetch(url, { signal: abort.signal })
      if (!res.ok || !res.body) throw new Error(`ntfy responded ${res.status}`)
      this.backoff = 5_000
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) this.handle(line)
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return
      console.error('Phone action stream failed:', err)
    }
    // Stream ended or failed: reconnect unless the configuration changed meanwhile.
    if (this.key !== key || abort.signal.aborted) return
    this.retry = setTimeout(() => void this.connect(phone), this.backoff)
    this.backoff = Math.min(this.backoff * 2, 5 * 60_000)
  }

  private handle(line: string): void {
    let event: { event?: string; id?: string; message?: string }
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.event !== 'message' || !event.id) return
    const action = parseMarkAction(event.message)
    if (action) this.onMark(action)
    this.saveLastId(event.id)
  }
}
