import type { PhoneSettings } from '@shared/types'

const base = (cfg: PhoneSettings): string => cfg.server.replace(/\/+$/, '')

async function check(res: Response): Promise<void> {
  if (res.ok) return
  if (res.status === 429) throw new Error('ntfy rate limit reached (429); will retry later')
  throw new Error(`ntfy responded ${res.status}`)
}

/**
 * Publishes a notification to an ntfy topic. JSON publishing is used (instead
 * of headers) so titles with non-ASCII characters arrive intact.
 * With `at` the server holds the message and delivers it at that time
 * (max. 3 days ahead); `sequenceId` lets a later publish replace it.
 */
export async function pushToPhone(
  cfg: PhoneSettings,
  title: string,
  message: string,
  opts: { at?: number; sequenceId?: string } = {}
): Promise<void> {
  if (!cfg.topic) throw new Error('No topic configured')
  const res = await fetch(base(cfg) + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: cfg.topic,
      title,
      message: message || title,
      tags: ['alarm_clock'],
      // A unix timestamp: ntfy's JSON API ignores duration strings like "2h".
      ...(opts.at ? { delay: String(Math.floor(opts.at / 1000)) } : {}),
      ...(opts.sequenceId ? { sequence_id: opts.sequenceId } : {})
    }),
    signal: AbortSignal.timeout(10_000)
  })
  await check(res)
}

/** Cancels a scheduled message that has not been delivered yet. */
export async function cancelOnPhone(cfg: PhoneSettings, sequenceId: string): Promise<void> {
  const res = await fetch(`${base(cfg)}/${encodeURIComponent(cfg.topic)}/${encodeURIComponent(sequenceId)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000)
  })
  // Already delivered or never existed: nothing left to cancel.
  if (res.status === 404) return
  await check(res)
}
