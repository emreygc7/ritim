import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { emptyData, normalizeData } from '@shared/normalize'
import type { AppData, Lang } from '@shared/types'

export const dataPath = (): string => join(app.getPath('userData'), 'data.json')

export function loadData(lang: Lang): AppData {
  const file = dataPath()
  if (!existsSync(file)) return emptyData(lang)
  try {
    return normalizeData(JSON.parse(readFileSync(file, 'utf8')), lang)
  } catch (err) {
    // Keep the unreadable file for manual recovery and start fresh.
    console.error('Could not read data file, starting empty:', err)
    copyFileSync(file, `${file}.corrupt-${Date.now()}`)
    return emptyData(lang)
  }
}

/** Atomic write with a one-step backup. */
export function saveData(data: AppData): void {
  const file = dataPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  if (existsSync(file)) copyFileSync(file, `${file}.bak`)
  renameSync(tmp, file)
}
