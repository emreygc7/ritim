import type { AppData } from './types'

export type ImportResult = 'ok' | 'cancel' | 'error'
export type ExportResult = 'ok' | 'cancel' | 'error'
export type Page = 'today' | 'week' | 'notes' | 'stats' | 'settings'

export type FocusState = { phase: 'focus' | 'break'; endsAt: number; cycle: number; minutes: number } | null

export interface UpdateInfo {
  current: string
  latest: string | null
  url: string | null
  /** false until GitHub answered at least once (e.g. no release published yet) */
  checked: boolean
}

export interface IcsImportResult {
  status: 'ok' | 'cancel' | 'error'
  added: number
  skipped: number
}

/** The API the preload script exposes to the renderer as `window.ritim`. */
export interface RitimApi {
  getInitial(): Promise<{ data: AppData; dataPath: string; canAutostart: boolean; clockOffsetMs: number }>
  save(data: AppData): Promise<void>
  exportData(): Promise<ExportResult>
  importData(): Promise<ImportResult>
  testNotification(): Promise<void>
  /** Sends a test message to the configured ntfy topic. */
  testPhone(): Promise<{ ok: boolean; error?: string }>
  copyText(text: string): Promise<void>
  phoneStatus(): Promise<{ scheduled: number; lastSync: number | null; error: string | null }>
  chooseMarkdownDir(): Promise<string | null>
  exportMarkdownHistory(days: number): Promise<{ written: number; error: string | null }>
  importIcs(): Promise<IcsImportResult>
  focusStart(): Promise<void>
  focusStop(): Promise<void>
  focusState(): Promise<FocusState>
  onFocus(cb: (s: FocusState) => void): () => void
  updateInfo(): Promise<UpdateInfo & { repoConfigured: boolean }>
  openExternal(url: string): Promise<void>
  onDataChanged(cb: (data: AppData) => void): () => void
  onNavigate(cb: (page: Page) => void): () => void
  /** Tray "New note" */
  onNewNote(cb: () => void): () => void
}

export const IPC = {
  getInitial: 'ritim:get-initial',
  save: 'ritim:save',
  exportData: 'ritim:export',
  importData: 'ritim:import',
  testNotification: 'ritim:test-notification',
  testPhone: 'ritim:test-phone',
  copyText: 'ritim:copy-text',
  phoneStatus: 'ritim:phone-status',
  chooseMarkdownDir: 'ritim:choose-markdown-dir',
  exportMarkdownHistory: 'ritim:export-markdown-history',
  importIcs: 'ritim:import-ics',
  focusStart: 'ritim:focus-start',
  focusStop: 'ritim:focus-stop',
  focusState: 'ritim:focus-state',
  focus: 'ritim:focus',
  updateInfo: 'ritim:update-info',
  openExternal: 'ritim:open-external',
  dataChanged: 'ritim:data-changed',
  navigate: 'ritim:navigate',
  newNote: 'ritim:new-note'
} as const
