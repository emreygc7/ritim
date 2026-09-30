import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, shell, Tray } from 'electron'
import { IPC, type Page } from '@shared/api'
import { detectLang, translator } from '@shared/i18n'
import { demoData } from '@shared/demo'
import { normalizeData } from '@shared/normalize'
import { nowState } from '@shared/schedule'
import { addDays, atTime, clockOf, formatDuration, isValidHM, toDateKey } from '@shared/time'
import type { AppData } from '@shared/types'
import { setAutostart } from './autostart'
import { pushToPhone } from './push'
import { PhoneSync } from './phoneSync'
import { isMuted, Scheduler } from './scheduler'
import { dataPath, loadData, saveData } from './store'

app.setName('Ritim')
// Lets tests, demos and screenshots run against a separate data directory.
if (process.env.RITIM_USER_DATA) app.setPath('userData', process.env.RITIM_USER_DATA)

const startHidden = process.argv.includes('--hidden')
/**
 * Screenshots only: pretend the clock shows this time today ("HH:MM") so the
 * "now" card is in the middle of a block. Affects the UI clock, not reminders.
 */
const clockOffsetMs = (() => {
  const hm = process.env.RITIM_SCREENSHOT_TIME
  return hm && isValidHM(hm) ? atTime(toDateKey(new Date()), hm) - Date.now() : 0
})()
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let data: AppData
let scheduler: Scheduler
let phoneSync: PhoneSync | null = null

const resource = (...p: string[]): string =>
  app.isPackaged ? join(process.resourcesPath, 'resources', ...p) : join(app.getAppPath(), 'resources', ...p)

const appIcon = (): string => resource('icons', '256x256.png')

function applySettings(prev: AppData | null): void {
  nativeTheme.themeSource = data.settings.theme
  if (!prev || prev.settings.autostart !== data.settings.autostart) {
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

  const muted = isMuted(data, now)
  const tomorrow = new Date(atTime(addDays(today, 1), '00:00'))
  const menu = Menu.buildFromTemplate([
    ...lines.map((label) => ({ label, enabled: false })),
    { type: 'separator' },
    { label: t('tray.open'), click: () => showWindow('today') },
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
  const icon = nativeImage.createFromPath(resource('icons', 'tray.png'))
  tray = new Tray(icon)
  tray.on('click', () => showWindow('today'))
  refreshTray()
}

function registerIpc(): void {
  ipcMain.handle(IPC.getInitial, () => ({
    data,
    dataPath: dataPath(),
    canAutostart: app.isPackaged || !!process.env.APPIMAGE,
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
  for (const theme of ['light', 'dark'] as const) {
    nativeTheme.themeSource = theme
    for (const page of ['today', 'week', 'stats', 'settings'] as Page[]) {
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
  app.on('second-instance', () => {
    if (app.isReady()) showWindow()
  })

  app.whenReady().then(() => {
    const lang = detectLang(process.env.RITIM_LANG ?? app.getLocale())
    data = loadData(lang)
    if (process.env.RITIM_DEMO && data.blocks.length === 0) {
      data = demoData(lang, toDateKey(new Date()), Date.now() + clockOffsetMs)
    }
    if (!data.startedOn) {
      data = { ...data, startedOn: toDateKey(new Date()) }
      persist()
    }
    applySettings(null)
    registerIpc()
    createWindow()
    createTray()
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
      powerMonitor.on('resume', () => void phoneSync?.run())
    }
  })

  app.on('before-quit', () => {
    quitting = true
    scheduler?.stop()
    phoneSync?.stop()
  })

  // Keep running in the tray; only quit explicitly.
  app.on('window-all-closed', () => {
    if (!tray || !data.settings.closeToTray) app.quit()
  })
}
