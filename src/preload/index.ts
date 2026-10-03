import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type FocusState, type Page, type RitimApi } from '@shared/api'
import type { AppData } from '@shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RitimApi = {
  getInitial: () => ipcRenderer.invoke(IPC.getInitial),
  save: (data) => ipcRenderer.invoke(IPC.save, data),
  exportData: () => ipcRenderer.invoke(IPC.exportData),
  importData: () => ipcRenderer.invoke(IPC.importData),
  testNotification: () => ipcRenderer.invoke(IPC.testNotification),
  testPhone: () => ipcRenderer.invoke(IPC.testPhone),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  phoneStatus: () => ipcRenderer.invoke(IPC.phoneStatus),
  chooseMarkdownDir: () => ipcRenderer.invoke(IPC.chooseMarkdownDir),
  exportMarkdownHistory: (days) => ipcRenderer.invoke(IPC.exportMarkdownHistory, days),
  importIcs: () => ipcRenderer.invoke(IPC.importIcs),
  focusStart: () => ipcRenderer.invoke(IPC.focusStart),
  focusStop: () => ipcRenderer.invoke(IPC.focusStop),
  focusState: () => ipcRenderer.invoke(IPC.focusState),
  onFocus: (cb) => subscribe<FocusState>(IPC.focus, cb),
  updateInfo: () => ipcRenderer.invoke(IPC.updateInfo),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  onDataChanged: (cb) => subscribe<AppData>(IPC.dataChanged, cb),
  onNavigate: (cb) => subscribe<Page>(IPC.navigate, cb),
  onNewNote: (cb) => subscribe<void>(IPC.newNote, () => cb())
}

contextBridge.exposeInMainWorld('ritim', api)
