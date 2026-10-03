import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, shell, Tray } from 'electron'
import { IPC, type FocusState, type IcsImportResult, type Page } from '@shared/api'
import type { MarkAction } from '@shared/actions'
import { eventsToOneOffs, parseIcs } from '@shared/ics'
import { nextPresetColor } from '@shared/palette'
import { detectLang, translator } from '@shared/i18n'
import { demoData } from '@shared/demo'
import { normalizeData } from '@shared/normalize'
import { nowState, occurrencesOn } from '@shared/schedule'
import { addDays, atTime, clockOf, formatDuration, isValidHM, toDateKey } from '@shared/time'
import type { AppData, Status } from '@shared/types'
import { canAutostart, setAutostart } from './autostart'
import { pushToPhone } from './push'
import { FocusTimer } from './focus'
import { MarkdownExporter } from './markdownExport'
import { PhoneActions } from './phoneActions'
import { PhoneSync } from './phoneSync'
import { UpdateChecker, githubRepo } from './updates'
import { isMuted, Scheduler } from './scheduler'
import { dataPath, loadData, saveData } from './store'

app.setName('Ritim')
// Windows only shows notifications for apps with an AppUserModelID matching the installer's.
if (process.platform === 'win32') app.setAppUserModelId('app.ritim.desktop')
// Lets tests, demos and screenshots run against a separate data directory.
if (process.env.RITIM_USER_DATA) app.setPath('userData', process.env.RITIM_USER_DATA)

const startHidden = process.argv.includes('--hidden')
/**
 * Screenshots only: pretend the clock shows this time (see below) so the
 * "now" card is in the middle of a block. Affects the UI clock, not reminders.
 */
const clockOffsetMs = (() => {
  // "HH:MM" (today) or "YYYY-MM-DD HH:MM"
  const m = /^(?:(\d{4}-\d{2}-\d{2}) )?(\d{1,2}:\d{2})$/.exec(process.env.RITIM_SCREENSHOT_TIME ?? '')
  return m && isValidHM(m[2]) ? atTime(m[1] ?? toDateKey(new Date()), m[2]) - Date.now() : 0
})()
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let data: AppData
let scheduler: Scheduler
let phoneSync: PhoneSync | null = null
let phoneActions: PhoneActions | null = null
let exporter: MarkdownExporter | null = null
let updates: UpdateChecker | null = null
let focus: FocusTimer | null = null

const resource = (...p: string[]): string =>
  app.isPackaged ? join(process.resourcesPath, 'resources', ...p) : join(app.getAppPath(), 'resources', ...p)

const appIcon = (): string => resource('icons', '256x256.png')

function applySettings(prev: AppData | null): void {
  nativeTheme.themeSource = data.settings.theme
  // The login entry is shared by every profile on this machine: at startup only refresh it
  // (never remove it), change it only when the user toggles the setting, and leave it alone
  // for separate test/demo profiles.
  const toggled = prev !== null && prev.settings.autostart !== data.settings.autostart
  const refresh = prev === null && data.settings.autostart
  if (!process.env.RITIM_USER_DATA && (toggled || refresh)) {
    try {
      setAutostart(data.settings.autostart)
    } catch (err) {
      console.error('Could not update the autostart entry:', err)
    }
  }
  refreshTray()
}

/** Persists without ever throwing into a click handler or IPC call (e.g. when the disk is full). */
function persist(): void {
  try {
    saveData(data)
  } catch (err) {
    console.error('Could not save data:', err)
  }
}

function setData(next: AppData, notifyRenderer: boolean): void {
  const prev = data
  data = next.startedOn ? next : { ...next, startedOn: toDateKey(new Date()) }
  persist()
  applySettings(prev)
  phoneSync?.schedule()
  exporter?.schedule()
  phoneActions?.configure(data.settings.phone)
  if (notifyRenderer) win?.webContents.send(IPC.dataChanged, data)
}

function showWindow(page?: Page): void {
  if (!win) createWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page) win.webContents.send(IPC.navigate, page)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Ritim',
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16161a' : '#f7f7f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    if (!startHidden) win?.show()
  })

  win.on('close', (e) => {
    if (!quitting && data.settings.closeToTray && tray) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => (win = null))

  // Open external links in the browser, never inside the app, and never navigate away from it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function mute(until: Date | null): void {
  setData({ ...data, settings: { ...data.settings, dndUntil: until ? until.toISOString() : null } }, true)
}

/** Marks a block of a date (from the tray or a phone button). Unknown blocks are ignored. */
function markBlock(date: string, id: string, status: Status): void {
  if (!occurrencesOn(data, date).some((o) => o.sourceId === id)) return
  const day = { ...(data.logs[date] ?? {}) }
  const prevNote = day[id]?.note
  day[id] = { status, at: new Date().toISOString(), ...(prevNote ? { note: prevNote } : {}) }
  setData({ ...data, logs: { ...data.logs, [date]: day } }, true)
}

function onPhoneAction(a: MarkAction): void {
  markBlock(a.date, a.id, a.status)
}

function refreshTray(): void {
  if (!tray) return
  const t = translator(data.settings.lang)
  const now = Date.now()
  const today = toDateKey(new Date(now))
  const { current, next } = nowState(data, now, today)
  const lines: string[] = []
  for (const c of current) {
    lines.push(t('tray.now', { title: c.title, d: formatDuration((c.end - now) / 60_000, data.settings.lang) }))
  }
  if (current.length === 0) lines.push(t('tray.free'))
  if (next) lines.push(t('tray.next', { title: next.title, t: clockOf(next.start) }))

  const f = focus?.current
  if (f) {
    const left = formatDuration(Math.max(0, f.endsAt - now) / 60_000, data.settings.lang)
    lines.push(t(f.phase === 'focus' ? 'tray.focusing' : 'tray.onBreak', { d: left }))
  }

  // Quick marking of the tracked blocks that are running right now.
  const tracked = new Set(data.categories.filter((c) => c.track).map((c) => c.id))
  const markItems: Electron.MenuItemConstructorOptions[] = current
    .filter((c) => tracked.has(c.categoryId))
    .map((c) => {
      const status = data.logs[c.dateKey]?.[c.sourceId]?.status
      const item = (s: Status, label: 'status.done' | 'status.partial' | 'status.skipped'): Electron.MenuItemConstructorOptions => ({
        label: t(label),
        type: 'radio',
        checked: status === s,
        click: () => markBlock(c.dateKey, c.sourceId, s)
      })
      return {
        label: t('tray.mark', { title: c.title }),
        submenu: [item('done', 'status.done'), item('partial', 'status.partial'), item('skipped', 'status.skipped')]
      }
    })

  const muted = isMuted(data, now)
  const tomorrow = new Date(atTime(addDays(today, 1), '00:00'))
  const menu = Menu.buildFromTemplate([
    ...lines.map((label) => ({ label, enabled: false })),
    { type: 'separator' },
    ...markItems,
    f
      ? { label: t('tray.focusStop'), click: () => focus?.stop() }
      : { label: t('tray.focusStart', { n: data.settings.focusMinutes }), click: () => focus?.start() },
    { type: 'separator' },
    { label: t('tray.open'), click: () => showWindow('today') },
    {
      label: t('tray.newNote'),
      click: () => {
        showWindow('notes')
        win?.webContents.send(IPC.newNote)
      }
    },
    { type: 'separator' },
    muted
      ? { label: t('tray.dndOff'), click: () => mute(null) }
      : { label: t('tray.dnd1h'), click: () => mute(new Date(now + 3_600_000)) },
    ...(muted ? [] : [{ label: t('tray.dndToday'), click: () => mute(tomorrow) }]),
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(lines.join('\n'))
}

function createTray(): void {
  let icon = nativeImage.createFromPath(resource('icons', 'tray.png'))
  // The macOS menu bar and the Windows tray expect small icons.
  if (process.platform === 'darwin') icon = icon.resize({ width: 18, height: 18 })
  if (process.platform === 'win32') icon = icon.resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.on('click', () => showWindow('today'))
  refreshTray()
}

function registerIpc(): void {
  ipcMain.handle(IPC.getInitial, () => ({
    data,
    dataPath: dataPath(),
    canAutostart: canAutostart(),
    clockOffsetMs
  }))

  ipcMain.handle(IPC.save, (_e, raw: unknown) => {
    setData(normalizeData(raw, data.settings.lang), false)
  })

  ipcMain.handle(IPC.exportData, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts = { defaultPath: `ritim-${toDateKey(new Date())}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] }
    const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return 'cancel'
    try {
      writeFileSync(res.filePath, JSON.stringify(data, null, 2))
      return 'ok'
    } catch (err) {
      console.error('Export failed:', err)
      return 'error'
    }
  })

  ipcMain.handle(IPC.importData, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] }
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return 'cancel'
    try {
      const raw = JSON.parse(readFileSync(res.filePaths[0], 'utf8'))
      const imported = normalizeData(raw, data.settings.lang)
      if (imported.categories.length === 0 && imported.blocks.length === 0) return 'error'
      // Keep machine-specific settings from this installation.
      imported.settings.autostart = data.settings.autostart
      imported.settings.phone = data.settings.phone
      imported.onboarded = true
      // History in the file keeps its own start date; a fresh plan starts today.
      imported.startedOn = imported.startedOn ?? toDateKey(new Date())
      setData(imported, true)
      return 'ok'
    } catch {
      return 'error'
    }
  })

  ipcMain.handle(IPC.testPhone, async () => {
    const t = translator(data.settings.lang)
    try {
      const phone = data.settings.phone
      if (phone.privateMode) await pushToPhone(phone, t('notify.private.test'), t('notify.private.body'))
      else await pushToPhone(phone, t('notify.test'), t('notify.testBody'))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.phoneStatus, () => phoneSync?.status ?? { scheduled: 0, lastSync: null, error: null })

  ipcMain.handle(IPC.chooseMarkdownDir, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.exportMarkdownHistory, (_e, days: unknown) => {
    const n = typeof days === 'number' && days >= 1 && days <= 366 ? Math.floor(days) : 30
    const written = exporter?.exportHistory(n) ?? 0
    return { written, error: exporter?.lastError ?? null }
  })

  ipcMain.handle(IPC.importIcs, async (e): Promise<IcsImportResult> => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'iCalendar', extensions: ['ics'] }] }
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return { status: 'cancel', added: 0, skipped: 0 }
    try {
      const { events, skipped } = parseIcs(readFileSync(res.filePaths[0], 'utf8'))
      const t = translator(data.settings.lang)
      let categories = data.categories
      if (!categories.some((c) => c.id === 'calendar')) {
        const color = nextPresetColor(categories.map((c) => c.color))
        categories = [...categories, { id: 'calendar', name: t('ics.category'), color, track: false }]
      }
      const added = eventsToOneOffs(data.oneOffs, events, 'calendar')
      if (added.length) setData({ ...data, categories, oneOffs: [...data.oneOffs, ...added] }, true)
      return { status: 'ok', added: added.length, skipped: skipped + (events.length - added.length) }
    } catch (err) {
      console.error('Calendar import failed:', err)
      return { status: 'error', added: 0, skipped: 0 }
    }
  })

  ipcMain.handle(IPC.focusStart, () => focus?.start())
  ipcMain.handle(IPC.focusStop, () => focus?.stop())
  ipcMain.handle(IPC.focusState, () => focus?.current ?? null)

  ipcMain.handle(IPC.updateInfo, async () => ({
    ...(updates ? await updates.check() : { current: app.getVersion(), latest: null, url: null, checked: false }),
    repoConfigured: githubRepo() !== null
  }))

  ipcMain.handle(IPC.openExternal, (_e, url: unknown) => {
    if (typeof url === 'string' && url.startsWith('https://')) void shell.openExternal(url)
  })

  ipcMain.handle(IPC.copyText, (_e, text: string) => clipboard.writeText(String(text)))

  ipcMain.handle(IPC.testNotification, () => {
    const t = translator(data.settings.lang)
    scheduler.notify(t('notify.test'), t('notify.testBody'), { privateTitle: t('notify.private.test'), toPhone: true })
  })
}

/** Renders every page in both themes to PNG files, then quits. Used for docs and visual checks. */
async function captureScreenshots(dir: string): Promise<void> {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const WIDTH = 1280
  mkdirSync(dir, { recursive: true })
  const w = win!
  await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()))
  w.show()
  // Interaction checks: run a script in the page, then capture the result and quit.
  const script = process.env.RITIM_E2E_SCRIPT
  if (script) {
    w.setContentSize(WIDTH, 900)
    await wait(600)
    const result: unknown = await w.webContents.executeJavaScript(readFileSync(script, 'utf8'))
    await wait(800)
    writeFileSync(join(dir, 'e2e.png'), (await w.webContents.capturePage()).toPNG())
    writeFileSync(join(dir, 'e2e.json'), JSON.stringify(result ?? null, null, 2))
    quitting = true
    app.quit()
    return
  }
  for (const theme of ['light', 'dark'] as const) {
    nativeTheme.themeSource = theme
    for (const page of ['today', 'week', 'notes', 'stats', 'settings'] as Page[]) {
      w.setContentSize(WIDTH, 800)
      w.webContents.send(IPC.navigate, page)
      await wait(600)
      // Grow the window to the page's full height so nothing is cut off.
      const height: number = await w.webContents.executeJavaScript(
        "document.querySelector('.content')?.scrollHeight ?? 800"
      )
      w.setContentSize(WIDTH, Math.min(Math.max(height, 720), 2400))
      await wait(600)
      const img = await w.webContents.capturePage()
      writeFileSync(join(dir, `${theme}-${page}.png`), img.toPNG())
    }
  }
  quitting = true
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // macOS: clicking the Dock icon reopens the window.
  app.on('activate', () => {
    if (app.isReady()) showWindow()
  })

  app.on('second-instance', () => {
    if (app.isReady()) showWindow()
  })

  app.whenReady().then(() => {
    const lang = detectLang(process.env.RITIM_LANG ?? app.getLocale())
    data = loadData(lang)
    if (process.env.RITIM_DEMO && data.blocks.length === 0) {
      data = demoData(lang, toDateKey(new Date()), Date.now() + clockOffsetMs)
    }
    // Notes stay in the trash for 30 days.
    const purgeBefore = Date.now() - 30 * 86_400_000
    if (data.notes.some((n) => n.deletedAt && Date.parse(n.deletedAt) < purgeBefore)) {
      data = { ...data, notes: data.notes.filter((n) => !n.deletedAt || Date.parse(n.deletedAt) >= purgeBefore) }
      persist()
    }
    if (!data.startedOn) {
      data = { ...data, startedOn: toDateKey(new Date()) }
      persist()
    }
    applySettings(null)
    registerIpc()
    createWindow()
    createTray()
    focus = new FocusTimer({
      minutes: () => ({ focus: data.settings.focusMinutes, rest: data.settings.breakMinutes }),
      onPhaseEnd: (ended, next) => {
        const t = translator(data.settings.lang)
        const title = ended === 'focus' ? t('notify.focusDone', { n: next.minutes }) : t('notify.breakDone', { n: next.minutes })
        scheduler.notify(title, t('notify.focusBody'), { privateTitle: title, toPhone: false })
      },
      onChange: (s: FocusState) => {
        win?.webContents.send(IPC.focus, s)
        refreshTray()
      }
    })
    scheduler = new Scheduler({
      getData: () => data,
      onNotificationClick: () => showWindow('today'),
      onTick: refreshTray,
      icon: appIcon()
    })
    if (process.env.RITIM_SCREENSHOT_DIR) void captureScreenshots(process.env.RITIM_SCREENSHOT_DIR)
    else {
      scheduler.start()
      phoneSync = new PhoneSync(() => data)
      phoneSync.start()
      phoneActions = new PhoneActions(onPhoneAction)
      phoneActions.configure(data.settings.phone)
      exporter = new MarkdownExporter(() => data)
      exporter.start()
      updates = new UpdateChecker(
        () => data.settings.checkUpdates,
        (info) => {
          const t = translator(data.settings.lang)
          scheduler.notify(t('notify.update', { v: info.latest ?? '' }), t('notify.updateBody'), {
            privateTitle: '',
            toPhone: false
          })
        }
      )
      updates.start()
      powerMonitor.on('resume', () => {
        void phoneSync?.run()
        exporter?.run()
      })
    }
  })

  app.on('before-quit', () => {
    quitting = true
    scheduler?.stop()
    phoneSync?.stop()
    phoneActions?.stop()
    exporter?.stop()
    updates?.stop()
    focus?.stop()
  })

  // Keep running in the tray; only quit explicitly.
  app.on('window-all-closed', () => {
    if (!tray || !data.settings.closeToTray) app.quit()
  })
}
