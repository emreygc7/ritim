import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { translator } from '@shared/i18n'
import { activeNotes, noteFileName, noteMarkdown, noteTitle } from '@shared/notes'
import { dailyFileName, dailyMarkdown, weeklyFileName, weeklyMarkdown } from '@shared/markdown'
import { addDays, startOfWeek, toDateKey } from '@shared/time'
import type { AppData } from '@shared/types'

/**
 * Writes daily and weekly Markdown summaries into a folder the user picked.
 * Pointing it at a folder inside an Obsidian vault makes them show up there.
 */
export class MarkdownExporter {
  private timer: NodeJS.Timeout | null = null
  private interval: NodeJS.Timeout | null = null
  lastError: string | null = null

  constructor(private readonly getData: () => AppData) {}

  start(): void {
    this.schedule()
    // Keeps "today" current across midnight and picks up late marks.
    this.interval = setInterval(() => this.run(), 30 * 60_000)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
  }

  /** Call after any data change; edits are combined. */
  schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.run(), 3_000)
  }

  /** Today and yesterday, this week and last week. */
  run(): void {
    const today = toDateKey(new Date())
    this.write([addDays(today, -1), today], [startOfWeek(addDays(today, -7)), startOfWeek(today)])
  }

  /** Writes the last `days` days and their weeks; returns the number of files written. */
  exportHistory(days: number): number {
    const today = toDateKey(new Date())
    const dayKeys: string[] = []
    const weeks = new Set<string>()
    for (let i = days - 1; i >= 0; i--) {
      const k = addDays(today, -i)
      dayKeys.push(k)
      weeks.add(startOfWeek(k))
    }
    return this.write(dayKeys, [...weeks])
  }

  private write(dayKeys: string[], weekKeys: string[]): number {
    const data = this.getData()
    const dir = data.settings.markdownDir
    if (!dir) return 0
    const now = Date.now()
    let written = 0
    try {
      mkdirSync(dir, { recursive: true })
      const start = data.startedOn
      for (const k of dayKeys) {
        if (start && k < start) continue
        written += writeIfChanged(join(dir, dailyFileName(k)), dailyMarkdown(data, k, now))
      }
      for (const k of weekKeys) {
        if (start && addDays(k, 6) < start) continue
        written += writeIfChanged(join(dir, weeklyFileName(k)), weeklyMarkdown(data, k, now))
      }
      written += writeNotes(data, dir)
      this.lastError = null
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      console.error('Markdown export failed:', err)
    }
    return written
  }
}

interface NotesManifest {
  dir: string
  /** relative path → hash of the content Ritim last wrote there */
  files: Record<string, string>
}

const sha = (s: string): string => createHash('sha1').update(s).digest('hex')
const manifestPath = (): string => join(app.getPath('userData'), 'notes-export.json')

function readManifest(): NotesManifest {
  try {
    if (existsSync(manifestPath())) return JSON.parse(readFileSync(manifestPath(), 'utf8')) as NotesManifest
  } catch {
    // corrupt manifest: start over; worst case an old exported note file stays behind
  }
  return { dir: '', files: {} }
}

/**
 * Notes go to a sub-folder, one file per note. Files of deleted or renamed
 * notes are removed, but only while they still hold exactly what Ritim wrote:
 * a note edited in Obsidian is never deleted.
 */
function writeNotes(data: AppData, dir: string): number {
  const t = translator(data.settings.lang)
  const folder = t('notes.folder')
  const untitled = t('notes.untitled')
  const prev = readManifest()
  const files: Record<string, string> = {}
  const taken = new Set<string>()
  let written = 0
  mkdirSync(join(dir, folder), { recursive: true })
  for (const n of activeNotes(data)) {
    const rel = join(folder, noteFileName(noteTitle(n, untitled), taken))
    const content = noteMarkdown(n, untitled)
    written += writeIfChanged(join(dir, rel), content)
    files[rel] = sha(content)
  }
  if (prev.dir === dir) {
    for (const [rel, hash] of Object.entries(prev.files)) {
      if (files[rel]) continue
      const file = join(dir, rel)
      if (existsSync(file) && sha(readFileSync(file, 'utf8')) === hash) rmSync(file)
    }
  }
  writeFileSync(manifestPath(), JSON.stringify({ dir, files }))
  return written
}

/** Avoids touching unchanged files, so sync tools and editors don't see noise. */
function writeIfChanged(file: string, content: string): number {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return 0
  writeFileSync(file, content, 'utf8')
  return 1
}
