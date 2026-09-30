import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

/** Whether "start on login" can work for this build. */
export function canAutostart(): boolean {
  if (process.platform === 'linux') return app.isPackaged || !!process.env.APPIMAGE
  return app.isPackaged
}

export function setAutostart(enabled: boolean): void {
  if (process.platform === 'linux') return setLinuxAutostart(enabled)
  if (!app.isPackaged) return
  // Windows and macOS support login items natively. The --hidden argument (tray only)
  // is passed on Windows; macOS login items can't carry arguments, so the window opens there.
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}

// Electron's setLoginItemSettings doesn't cover Linux, so we manage an XDG autostart entry.
const entryPath = (): string =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'ritim.desktop')

function linuxExec(): string | null {
  if (process.env.APPIMAGE) return `"${process.env.APPIMAGE}" --hidden`
  // Per-user unpacked installs can't have a setuid chrome-sandbox (see scripts/install-local.mjs).
  if (app.isPackaged) return `"${process.execPath}" --no-sandbox --hidden`
  return null // development build: nothing stable to point at
}

function setLinuxAutostart(enabled: boolean): void {
  const file = entryPath()
  if (!enabled) {
    if (existsSync(file)) rmSync(file)
    return
  }
  const exec = linuxExec()
  if (!exec) {
    console.warn('Autostart is only available in packaged builds.')
    return
  }
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(
    file,
    ['[Desktop Entry]', 'Type=Application', 'Name=Ritim', `Exec=${exec}`, 'Icon=ritim', 'X-GNOME-Autostart-enabled=true', 'NoDisplay=false', ''].join(
      '\n'
    )
  )
}
