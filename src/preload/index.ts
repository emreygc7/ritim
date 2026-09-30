import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type Page, type RitimApi } from '@shared/api'
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
  onDataChanged: (cb) => subscribe<AppData>(IPC.dataChanged, cb),
  onNavigate: (cb) => subscribe<Page>(IPC.navigate, cb)
}

contextBridge.exposeInMainWorld('ritim', api)
