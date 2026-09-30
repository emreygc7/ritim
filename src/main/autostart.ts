import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

// Electron's setLoginItemSettings is not supported on Linux, so we manage an
// XDG autostart entry ourselves.
const entryPath = (): string =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'ritim.desktop')

function execCommand(): string | null {
  if (process.env.APPIMAGE) return `"${process.env.APPIMAGE}" --hidden`
  // Unpacked per-user installs can't have a setuid chrome-sandbox (see scripts/install-local.mjs).
  if (app.isPackaged) return `"${process.execPath}" --no-sandbox --hidden`
  return null // development build: nothing stable to point at
}

export function setAutostart(enabled: boolean): void {
  const file = entryPath()
  if (!enabled) {
    if (existsSync(file)) rmSync(file)
    return
  }
  const exec = execCommand()
  if (!exec) {
    console.warn('Autostart is only available in packaged builds.')
    return
  }
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Ritim',
      `Exec=${exec}`,
      'Icon=ritim',
      'X-GNOME-Autostart-enabled=true',
      'NoDisplay=false',
      ''
    ].join('\n')
  )
}
