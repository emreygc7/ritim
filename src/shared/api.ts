import type { AppData } from './types'

export type ImportResult = 'ok' | 'cancel' | 'error'
export type ExportResult = 'ok' | 'cancel' | 'error'
export type Page = 'today' | 'week' | 'stats' | 'settings'

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
  onDataChanged(cb: (data: AppData) => void): () => void
  onNavigate(cb: (page: Page) => void): () => void
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
  dataChanged: 'ritim:data-changed',
  navigate: 'ritim:navigate'
} as const
