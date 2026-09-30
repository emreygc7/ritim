import { spawn } from 'node:child_process'
import { Notification, powerMonitor } from 'electron'
import { translator } from '@shared/i18n'
import { checklistMessage, reminderMessage } from '@shared/messages'
import { dueChecklist, dueReminders, uncheckedOn, unmarkedToday } from '@shared/schedule'
import { atTime, toDateKey } from '@shared/time'
import type { AppData, DueReminder } from '@shared/types'
import { pushToPhone } from './push'

const TICK_MS = 15_000
/** After sleep/suspend we don't replay reminders older than this. */
const MAX_CATCH_UP_MS = 2 * 60_000

interface Options {
  getData: () => AppData
  onNotificationClick: () => void
  /** Called every tick so the tray can refresh its "now / next" line. */
  onTick: () => void
  icon: string
}

function playSound(): void {
  let fellBack = false
  // 'error' and a non-zero 'exit' can both fire for the same failure; play the fallback once.
  const fallback = (): void => {
    if (fellBack) return
    fellBack = true
    spawn('paplay', ['/usr/share/sounds/freedesktop/stereo/message-new-instant.oga'], { stdio: 'ignore' }).on(
      'error',
      () => {}
    )
  }
  const p = spawn('canberra-gtk-play', ['-i', 'message-new-instant'], { stdio: 'ignore' })
  p.on('error', fallback)
  p.on('exit', (code) => code !== 0 && fallback())
}

/** Notifications must stay referenced, otherwise GC can drop them and their click handler. */
const NOTIFICATION_TTL_MS = 30 * 60_000

export function isMuted(data: AppData, now = Date.now()): boolean {
  return !!data.settings.dndUntil && Date.parse(data.settings.dndUntil) > now
}

export class Scheduler {
  private lastCheck = Date.now() - TICK_MS
  private fired = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private live = new Set<Notification>()

  constructor(private readonly opts: Options) {}

  start(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    powerMonitor.on('resume', () => this.tick())
    powerMonitor.on('unlock-screen', () => this.tick())
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /**
   * Shows a desktop notification and, if requested and enabled, sends it to the
   * phone right away. `privateTitle` is what the phone gets in private mode.
   */
  notify(title: string, body: string, phoneOpts: { privateTitle: string; toPhone: boolean }): void {
    const data = this.opts.getData()
    // On Linux we play the sound ourselves (not every notification server does); elsewhere the OS does.
    const linux = process.platform === 'linux'
    const n = new Notification({ title, body, icon: this.opts.icon, silent: linux || !data.settings.sound, urgency: 'normal' })
    const release = (): void => void this.live.delete(n)
    this.live.add(n)
    n.on('click', () => {
      release()
      this.opts.onNotificationClick()
    })
    n.on('close', release)
    setTimeout(release, NOTIFICATION_TTL_MS)
    n.show()
    if (linux && data.settings.sound) playSound()
    const phone = data.settings.phone
    if (phoneOpts.toPhone && phone.enabled && phone.topic) {
      const t = translator(data.settings.lang)
      const [pt, pb] = phone.privateMode ? [phoneOpts.privateTitle, t('notify.private.body')] : [title, body]
      pushToPhone(phone, pt, pb).catch((err) => console.error('Phone notification failed:', err))
    }
  }

  tick(): void {
    const now = Date.now()
    let from = this.lastCheck
    if (now - from > MAX_CATCH_UP_MS) from = now - TICK_MS
    this.lastCheck = now

    const data = this.opts.getData()
    const todayKey = toDateKey(new Date(now))
    const muted = isMuted(data, now)

    for (const r of dueReminders(data, from, now)) {
      if (this.fired.has(r.id)) continue
      this.fired.add(r.id)
      if (!muted) this.fireReminder(data, r)
    }

    for (const c of dueChecklist(data, from, now)) {
      if (this.fired.has(c.id)) continue
      this.fired.add(c.id)
      if (muted) continue
      const m = checklistMessage(data, c)
      // Like block reminders, the phone copy is queued ahead of time by PhoneSync.
      this.notify(m.title, m.body, { privateTitle: m.privateTitle, toPhone: false })
    }

    const review = data.settings.dayReviewTime
    if (review) {
      const at = atTime(todayKey, review)
      const id = `${todayKey}:review`
      if (at > from && at <= now && !this.fired.has(id)) {
        this.fired.add(id)
        const blocks = unmarkedToday(data, todayKey, now).length
        const checks = uncheckedOn(data, todayKey).length
        if ((blocks > 0 || checks > 0) && !muted) {
          const t = translator(data.settings.lang)
          const body = [
            blocks > 0 ? t('notify.reviewBody', { n: blocks }) : '',
            checks > 0 ? t('notify.reviewChecks', { n: checks }) : ''
          ]
            .filter(Boolean)
            .join(' ')
          this.notify(t('notify.review'), body, {
            privateTitle: t('notify.private.review'),
            toPhone: true
          })
        }
      }
    }

    if (this.fired.size > 2000) this.fired = new Set([...this.fired].slice(-500))
    this.opts.onTick()
  }

  private fireReminder(data: AppData, r: DueReminder): void {
    const m = reminderMessage(data, r)
    // The phone copy of block reminders is queued ahead of time by PhoneSync.
    this.notify(m.title, m.body, { privateTitle: m.privateTitle, toPhone: false })
  }
}
