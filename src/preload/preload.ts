import { contextBridge, ipcRenderer } from 'electron'
import type { DisplayInfo, MapBerryLibrary, MapScene, PlayerMapState, PlayerMeasure, PlayerPointer, PlayerViewport } from '../shared/mapberry'

export interface MapBerryAPI {
  loadLibrary: () => Promise<MapBerryLibrary>
  saveLibrary: (library: MapBerryLibrary) => Promise<boolean>
  saveLibrarySync: (library: MapBerryLibrary) => boolean
  importMap: () => Promise<MapScene | null>
  confirm: (message: string, detail?: string) => Promise<boolean>
  getAssetDataUrl: (assetPath: string) => Promise<string | null>
  revealData: () => Promise<string>
  openExternal: (url: string) => Promise<boolean>
  getMonitors: () => Promise<DisplayInfo[]>
  setPlayerMonitor: (displayId: number) => Promise<boolean>
  openPlayerWindow: () => Promise<boolean>
  closePlayerWindow: () => Promise<boolean>
  sendPlayerSync: (state: PlayerMapState) => void
  sendPointer: (pointer: PlayerPointer) => void
  sendMeasure: (measure: PlayerMeasure | null) => void
  sendPlayerViewport: (viewport: PlayerViewport | null) => void
  onPlayerWindowClosed: (cb: () => void) => () => void
  onPlayerSyncRequest: (cb: () => void) => () => void
  onPlayerWindowSize: (cb: (size: { w: number; h: number }) => void) => () => void
}

export interface MapBerryPlayerAPI {
  getAssetDataUrl: (assetPath: string) => Promise<string | null>
  onFullSync: (cb: (state: PlayerMapState) => void) => () => void
  onPointer: (cb: (pointer: PlayerPointer) => void) => () => void
  onMeasure: (cb: (measure: PlayerMeasure | null) => void) => () => void
  onViewport: (cb: (viewport: PlayerViewport | null) => void) => () => void
  requestFullSync: () => void
  reportWindowSize: (size: { w: number; h: number }) => void
  closeSelf: () => Promise<boolean>
}

const dmApi: MapBerryAPI = {
  loadLibrary: () => ipcRenderer.invoke('mapberry:library-load'),
  saveLibrary: (library) => ipcRenderer.invoke('mapberry:library-save', library),
  saveLibrarySync: (library) => Boolean(ipcRenderer.sendSync('mapberry:library-save-sync', library)),
  importMap: () => ipcRenderer.invoke('mapberry:import-map'),
  confirm: (message, detail) => ipcRenderer.invoke('mapberry:confirm', message, detail),
  getAssetDataUrl: (assetPath) => ipcRenderer.invoke('mapberry:get-asset-data-url', assetPath),
  revealData: () => ipcRenderer.invoke('mapberry:reveal-data'),
  openExternal: (url) => ipcRenderer.invoke('mapberry:open-external', url),
  getMonitors: () => ipcRenderer.invoke('mapberry:get-monitors'),
  setPlayerMonitor: (displayId) => ipcRenderer.invoke('mapberry:set-player-monitor', displayId),
  openPlayerWindow: () => ipcRenderer.invoke('mapberry:open-player-window'),
  closePlayerWindow: () => ipcRenderer.invoke('mapberry:close-player-window'),
  sendPlayerSync: (state) => ipcRenderer.send('mapberry:player-sync', state),
  sendPointer: (pointer) => ipcRenderer.send('mapberry:player-pointer', pointer),
  sendMeasure: (measure) => ipcRenderer.send('mapberry:player-measure', measure),
  sendPlayerViewport: (viewport) => ipcRenderer.send('mapberry:player-viewport', viewport),
  onPlayerWindowClosed: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('mapberry:player-window-closed', handler)
    return () => ipcRenderer.removeListener('mapberry:player-window-closed', handler)
  },
  onPlayerSyncRequest: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('mapberry:dm-request-sync', handler)
    return () => ipcRenderer.removeListener('mapberry:dm-request-sync', handler)
  },
  onPlayerWindowSize: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, size: { w: number; h: number }) => cb(size)
    ipcRenderer.on('mapberry:dm-player-window-size', handler)
    return () => ipcRenderer.removeListener('mapberry:dm-player-window-size', handler)
  }
}

const playerApi: MapBerryPlayerAPI = {
  getAssetDataUrl: (assetPath) => ipcRenderer.invoke('mapberry:get-asset-data-url', assetPath),
  onFullSync: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PlayerMapState) => cb(state)
    ipcRenderer.on('mapberry:player-sync', handler)
    return () => ipcRenderer.removeListener('mapberry:player-sync', handler)
  },
  onPointer: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, pointer: PlayerPointer) => cb(pointer)
    ipcRenderer.on('mapberry:player-pointer', handler)
    return () => ipcRenderer.removeListener('mapberry:player-pointer', handler)
  },
  onMeasure: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, measure: PlayerMeasure | null) => cb(measure)
    ipcRenderer.on('mapberry:player-measure', handler)
    return () => ipcRenderer.removeListener('mapberry:player-measure', handler)
  },
  onViewport: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, viewport: PlayerViewport | null) => cb(viewport)
    ipcRenderer.on('mapberry:player-viewport', handler)
    return () => ipcRenderer.removeListener('mapberry:player-viewport', handler)
  },
  requestFullSync: () => ipcRenderer.send('mapberry:player-request-sync'),
  reportWindowSize: (size) => ipcRenderer.send('mapberry:player-window-size', size),
  closeSelf: () => ipcRenderer.invoke('mapberry:close-player-window')
}

const isPlayerWindow = window.location.pathname.endsWith('/player.html')
if (isPlayerWindow) {
  contextBridge.exposeInMainWorld('mapberryPlayer', playerApi)
} else {
  contextBridge.exposeInMainWorld('mapberry', dmApi)
}
