import { useEffect, useState } from 'react'
import { newId, newTopic } from '@shared/normalize'
import { nextPresetColor, PRESET_COLORS } from '@shared/palette'
import { sampleData } from '@shared/sample'
import { addDays, atTime, toDateKey } from '@shared/time'
import type { AppData, Category, Settings } from '@shared/types'
import { ReminderFields } from '../components/BlockEditor'
import { Icon } from '../components/Icon'
import { useStore } from '../store'

export function SettingsPage() {
  const { data, update, t, now, dataPath, canAutostart } = useStore()
  const s = data.settings
  const [message, setMessage] = useState('')
  const [armed, setArmed] = useState<'sample' | 'clear' | null>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    update((d) => ({ ...d, settings: { ...d.settings, [key]: value } }))

  const muted = !!s.dndUntil && Date.parse(s.dndUntil) > now
  const todayKey = toDateKey(new Date(now))

  const confirmThen = (kind: 'sample' | 'clear', fn: () => void): void => {
    if (armed !== kind) return setArmed(kind)
    setArmed(null)
    fn()
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t('nav.settings')}</h1>
      </header>

      <section className="card settings">
        <h2>{t('settings.general')}</h2>
        <div className="setting">
          <span>{t('settings.lang')}</span>
          <div className="segmented">
            {(['tr', 'en'] as const).map((l) => (
              <button key={l} className={s.lang === l ? 'on' : ''} onClick={() => set('lang', l)}>
                {l === 'tr' ? 'Türkçe' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span>{t('settings.theme')}</span>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((th) => (
              <button key={th} className={s.theme === th ? 'on' : ''} onClick={() => set('theme', th)}>
                {t(`settings.theme.${th}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="setting">
          <span>{t('settings.autostart')}</span>
          <input
            type="checkbox"
            className="switch"
            checked={s.autostart}
            disabled={!canAutostart}
            onChange={(e) => set('autostart', e.target.checked)}
          />
        </label>
        <label className="setting">
          <span>{t('settings.closeToTray')}</span>
          <input type="checkbox" className="switch" checked={s.closeToTray} onChange={(e) => set('closeToTray', e.target.checked)} />
        </label>
        <div className="setting">
          <span>{t('settings.grid')}</span>
          <div className="inline-inputs">
            <select value={s.gridStartHour} onChange={(e) => set('gridStartHour', Math.min(Number(e.target.value), s.gridEndHour - 1))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            –
            <select value={s.gridEndHour} onChange={(e) => set('gridEndHour', Math.max(Number(e.target.value), s.gridStartHour + 1))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card settings">
        <h2>{t('settings.notifications')}</h2>
        <div className="setting top">
          <span>{t('settings.defaultReminders')}</span>
          <ReminderFields value={s.defaultReminders} onChange={(r) => set('defaultReminders', r)} />
        </div>
        <label className="setting">
          <span>{t('settings.sound')}</span>
          <input type="checkbox" className="switch" checked={s.sound} onChange={(e) => set('sound', e.target.checked)} />
        </label>
        <div className="setting">
          <span>
            {t('settings.dayReview')}
            <small className="muted block">{t('settings.dayReviewHint')}</small>
          </span>
          <div className="inline-inputs">
            <input
              type="checkbox"
              className="switch"
              checked={s.dayReviewTime !== null}
              onChange={(e) => set('dayReviewTime', e.target.checked ? '21:00' : null)}
              aria-label={t('settings.dayReview')}
            />
            {s.dayReviewTime !== null && (
              <input type="time" value={s.dayReviewTime} onChange={(e) => e.target.value && set('dayReviewTime', e.target.value)} />
            )}
          </div>
        </div>
        <div className="setting">
          <span>
            {t('settings.dnd')}
            {muted && (
              <small className="muted block">
                {t('settings.dndActive', {
                  t: new Date(s.dndUntil!).toLocaleString(s.lang, { hour: '2-digit', minute: '2-digit', weekday: 'short' })
                })}
              </small>
            )}
          </span>
          <div className="segmented">
            <button className={!muted ? 'on' : ''} onClick={() => set('dndUntil', null)}>
              {t('settings.dndOff')}
            </button>
            <button onClick={() => set('dndUntil', new Date(now + 3_600_000).toISOString())}>{t('settings.dnd1h')}</button>
            <button onClick={() => set('dndUntil', new Date(atTime(addDays(todayKey, 1), '00:00')).toISOString())}>
              {t('settings.dndToday')}
            </button>
          </div>
        </div>
        <div className="setting">
          <span />
          <button className="btn" onClick={() => window.ritim.testNotification()}>
            <Icon name="bell" size={16} />
            {t('settings.test')}
          </button>
        </div>
      </section>

      <PhoneSection />

      <Categories />

      <section className="card settings">
        <h2>{t('settings.data')}</h2>
        <div className="button-row">
          <button
            className="btn"
            onClick={async () => {
              const r = await window.ritim.exportData()
              setMessage(r === 'ok' ? t('settings.exportDone') : r === 'error' ? t('settings.exportFailed') : '')
            }}
          >
            {t('settings.export')}
          </button>
          <button
            className="btn"
            onClick={async () => {
              const r = await window.ritim.importData()
              setMessage(r === 'ok' ? t('settings.importDone') : r === 'error' ? t('settings.importFailed') : '')
            }}
          >
            {t('settings.import')}
          </button>
          <button
            className={`btn${armed === 'sample' ? ' armed' : ''}`}
            onClick={() => confirmThen('sample', () => update((d) => ({ ...sampleData(d.settings.lang), settings: d.settings })))}
          >
            {armed === 'sample' ? t('settings.clickAgain') : t('settings.loadSample')}
          </button>
          <button
            className={`btn danger${armed === 'clear' ? ' armed' : ''}`}
            onClick={() =>
              confirmThen('clear', () =>
                update((d): AppData => ({ ...d, onboarded: false, categories: [], blocks: [], oneOffs: [], logs: {}, hidden: {} }))
              )
            }
          >
            {armed === 'clear' ? t('settings.clickAgain') : t('settings.clearAll')}
          </button>
        </div>
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
        <p className="muted small">{t('settings.dataPath', { p: dataPath })}</p>
      </section>
    </div>
  )
}

function Categories() {
  const { data, update, t } = useStore()
  const [armedDelete, setArmedDelete] = useState<string | null>(null)

  const edit = (id: string, patch: Partial<Category>): void =>
    update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  const add = (): void =>
    update((d) => ({
      ...d,
      categories: [
        ...d.categories,
        { id: newId(), name: t('settings.newCategory'), color: nextPresetColor(d.categories.map((c) => c.color)), track: true }
      ]
    }))

  const remove = (id: string): void => {
    if (armedDelete !== id) return setArmedDelete(id)
    update((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }))
  }

  return (
    <section className="card settings">
      <h2>{t('settings.categories')}</h2>
      <p className="muted small">{t('settings.trackHint')}</p>
      <ul className="cat-list">
        {data.categories.map((c) => {
          const uses = data.blocks.filter((b) => b.categoryId === c.id).length + data.oneOffs.filter((o) => o.categoryId === c.id).length
          return (
            <li key={c.id}>
              <details className="swatch-picker">
                <summary style={{ background: c.color }} aria-label={c.color} />
                <div className="swatches">
                  {PRESET_COLORS.map((p) => (
                    <button key={p} style={{ background: p }} aria-label={p} className={p === c.color ? 'on' : ''} onClick={() => edit(c.id, { color: p })} />
                  ))}
                  <input type="color" value={c.color} onChange={(e) => edit(c.id, { color: e.target.value })} aria-label="custom color" />
                </div>
              </details>
              <input
                className="cat-name"
                value={c.name}
                maxLength={40}
                placeholder={t('settings.newCategory')}
                aria-label={t('editor.category')}
                onChange={(e) => edit(c.id, { name: e.target.value })}
              />
              <label className="check small">
                <input type="checkbox" checked={c.track} onChange={(e) => edit(c.id, { track: e.target.checked })} />
                {t('settings.track')}
              </label>
              {uses > 0 ? (
                <span className="muted small">{t('settings.categoryInUse', { n: uses })}</span>
              ) : (
                <button className={`icon-btn subtle${armedDelete === c.id ? ' armed' : ''}`} onClick={() => remove(c.id)} title={t('editor.delete')} aria-label={t('editor.delete')}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button className="btn" onClick={add}>
        <Icon name="plus" size={16} />
        {t('settings.addCategory')}
      </button>
    </section>
  )
}

function PhoneSection() {
  const { data, update, t, now } = useStore()
  const [queue, setQueue] = useState<{ scheduled: number; lastSync: number | null; error: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    const load = (): void => void window.ritim.phoneStatus().then((s) => alive && setQueue(s))
    load()
    const id = setTimeout(load, 3_000) // pick up the sync that follows a change
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [now, data])
  const phone = data.settings.phone
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [server, setServer] = useState(phone.server)

  const setPhone = (patch: Partial<typeof phone>): void =>
    update((d) => ({ ...d, settings: { ...d.settings, phone: { ...d.settings.phone, ...patch } } }))

  return (
    <section className="card settings">
      <h2>{t('settings.phone')}</h2>
      <p className="muted small">{t('settings.phoneHint')}</p>
      <label className="setting">
        <span>{t('settings.phoneEnable')}</span>
        <input
          type="checkbox"
          className="switch"
          checked={phone.enabled}
          onChange={(e) => setPhone({ enabled: e.target.checked, topic: phone.topic || newTopic() })}
        />
      </label>
      {phone.enabled && (
        <>
          <ol className="phone-steps">
            <li>{t('settings.phoneStep1')}</li>
            <li>
              {t('settings.phoneStep2')}
              <div className="topic-row">
                <code className="topic">{phone.topic}</code>
                <button
                  className="btn"
                  onClick={async () => {
                    await window.ritim.copyText(phone.topic)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? t('settings.phoneCopied') : t('settings.phoneCopy')}
                </button>
                <button className="link" onClick={() => setPhone({ topic: newTopic() })}>
                  {t('settings.phoneNewTopic')}
                </button>
              </div>
            </li>
            <li>
              {t('settings.phoneStep3')}
              <div className="topic-row">
                <button
                  className="btn"
                  onClick={async () => {
                    setStatus(null)
                    const r = await window.ritim.testPhone()
                    setStatus(r.ok ? { ok: true, text: t('settings.phoneSent') } : { ok: false, text: t('settings.phoneFailed', { e: r.error ?? '' }) })
                  }}
                >
                  <Icon name="bell" size={16} />
                  {t('settings.phoneTest')}
                </button>
              </div>
              {status && (
                <p className={status.ok ? 'hint' : 'error'} role="status">
                  {status.text}
                </p>
              )}
            </li>
          </ol>
          {queue && (
            <p className={queue.error ? 'error' : 'muted small'} role="status">
              {queue.error
                ? t('settings.phoneQueueError', { e: queue.error })
                : t('settings.phoneQueue', {
                    n: queue.scheduled,
                    t: queue.lastSync
                      ? new Date(queue.lastSync).toLocaleTimeString(data.settings.lang, { hour: '2-digit', minute: '2-digit' })
                      : '-'
                  })}
            </p>
          )}
          <label className="setting">
            <span>
              {t('settings.phonePrivate')}
              <small className="muted block">{t('settings.phonePrivateHint')}</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={phone.privateMode}
              onChange={(e) => setPhone({ privateMode: e.target.checked })}
            />
          </label>
          <label className="setting">
            <span>{t('settings.phoneServer')}</span>
            <input
              className="server-input"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              onBlur={() => /^https?:\/\/\S+$/.test(server.trim()) ? setPhone({ server: server.trim().replace(/\/+$/, '') }) : setServer(phone.server)}
            />
          </label>
          <p className="muted small">{t('settings.phonePrivacy')}</p>
        </>
      )}
    </section>
  )
}
