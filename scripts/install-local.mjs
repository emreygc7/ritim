// Installs the unpacked Linux build for the current user (no sudo):
// ~/.local/share/ritim + a desktop entry + icons.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const home = homedir()
const src = 'dist/linux-unpacked'
const dest = join(home, '.local/share/ritim')
if (!existsSync(src)) {
  console.error('Build first: electron-builder --linux dir')
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const dir = join(home, `.local/share/icons/hicolor/${size}x${size}/apps`)
  mkdirSync(dir, { recursive: true })
  cpSync(`resources/icons/${size}x${size}.png`, join(dir, 'ritim.png'))
}

const apps = join(home, '.local/share/applications')
mkdirSync(apps, { recursive: true })
writeFileSync(
  join(apps, 'ritim.desktop'),
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Ritim',
    'Comment=Weekly routine planner with reminders',
    // A per-user install can't make chrome-sandbox setuid root, so Chromium would abort
    // at startup. The app only loads its own bundled files, so run without it.
    `Exec="${join(dest, 'ritim')}" --no-sandbox %U`,
    'Icon=ritim',
    'Terminal=false',
    'Categories=Utility;Office;',
    'StartupWMClass=Ritim',
    ''
  ].join('\n')
)
console.log(`Installed to ${dest}. Find "Ritim" in your app launcher.`)
