import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, session, shell } from 'electron'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'fs'
import { promises as fsPromises } from 'fs'
import { basename, extname, join, relative, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { GRID_WHITE, normalizeGridColor } from './shared/mapberry'
import type { DisplayInfo, MapBerryLibrary, MapScene, PlayerMapState, PlayerMeasure, PlayerPointer, PlayerViewport } from './shared/mapberry'

const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5176'
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_IMAGE_SIZE = 100 * 1024 * 1024
const MAX_HANDOUT_IMAGE_SIZE = 10 * 1024 * 1024
const DEMO_MAP_ID = 'mapberry-demo-map'
const DEMO_MAP_FILE = 'demo-map.png'

let dmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null
let playerDisplayId: number | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { stream: true, supportFetchAPI: true, standard: false, secure: false } }
])

app.setName('MapBerry')
if (process.env.MAPBERRY_E2E_USER_DATA) {
  app.setPath('userData', resolve(process.env.MAPBERRY_E2E_USER_DATA))
}

function appRoot(): string {
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'dist/renderer')) || existsSync(join(cwd, 'package.json'))) return cwd
  return app.getAppPath()
}

function userDataPath(): string {
  return app.getPath('userData')
}

function dataDir(): string {
  const dir = join(userDataPath(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function assetsDir(): string {
  const dir = join(userDataPath(), 'assets', 'maps')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function handoutAssetsDir(): string {
  const dir = join(userDataPath(), 'assets', 'handouts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function libraryPath(): string {
  return join(dataDir(), 'mapberry-library.json')
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultLibrary(): MapBerryLibrary {
  return { version: 1, maps: [], activeMapId: null }
}

function bundledDemoMapPath(): string | null {
  const candidates = [
    join(appRoot(), 'resources', DEMO_MAP_FILE),
    join(process.resourcesPath, DEMO_MAP_FILE),
    join(process.resourcesPath, 'resources', DEMO_MAP_FILE)
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function ensureDemoMapAsset(): string | null {
  const source = bundledDemoMapPath()
  if (!source) return null
  const dest = join(assetsDir(), DEMO_MAP_FILE)
  if (!existsSync(dest)) writeFileSync(dest, readFileSync(source))
  return relative(userDataPath(), dest).replace(/\\/g, '/')
}

function createDemoMap(): MapScene | null {
  const imagePath = ensureDemoMapAsset()
  if (!imagePath) return null
  const now = new Date().toISOString()
  return {
    id: DEMO_MAP_ID,
    name: 'Demo Map',
    imagePath,
    width: 1536,
    height: 1024,
    gridType: 'square',
    gridSize: 64,
    ftPerUnit: 5,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridVisible: true,
    gridThickness: 1,
    gridColor: GRID_WHITE,
    rotation: 0,
    rotationPlayer: 0,
    cameraX: null,
    cameraY: null,
    cameraScale: null,
    fogBitmap: null,
    drawings: [],
    rooms: [],
    walls: [],
    pins: [],
    handouts: [],
    createdAt: now,
    updatedAt: now
  }
}

function withDemoMap(library: MapBerryLibrary): MapBerryLibrary {
  if (library.maps.length > 0) return library
  const demo = createDemoMap()
  return demo ? { version: 1, maps: [demo], activeMapId: demo.id } : library
}

function normalizeScene(input: Partial<MapScene>): MapScene | null {
  if (!input || typeof input.id !== 'string' || typeof input.imagePath !== 'string') return null
  const now = new Date().toISOString()
  return {
    id: input.id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : 'Neue Karte',
    imagePath: input.imagePath,
    width: finite(input.width, 0),
    height: finite(input.height, 0),
    gridType: input.gridType === 'none' || input.gridType === 'hex' ? input.gridType : 'square',
    gridSize: clamp(finite(input.gridSize, 50), 8, 400),
    ftPerUnit: clamp(finite(input.ftPerUnit, 5), 0.5, 500),
    gridOffsetX: finite(input.gridOffsetX, 0),
    gridOffsetY: finite(input.gridOffsetY, 0),
    gridVisible: input.gridVisible !== false,
    gridThickness: clamp(finite(input.gridThickness, 1), 0.25, 5),
    gridColor: normalizeGridColor(input.gridColor),
    rotation: normalizeRotation(input.rotation),
    rotationPlayer: normalizeRotation(input.rotationPlayer),
    cameraX: nullableFinite(input.cameraX),
    cameraY: nullableFinite(input.cameraY),
    cameraScale: nullableFinite(input.cameraScale),
    fogBitmap: typeof input.fogBitmap === 'string' && input.fogBitmap.startsWith('data:image/png;base64,') ? input.fogBitmap : null,
    drawings: Array.isArray(input.drawings) ? input.drawings.filter((d) => d && typeof d.id === 'string') as MapScene['drawings'] : [],
    rooms: Array.isArray(input.rooms) ? input.rooms.filter((r) => r && typeof r.id === 'string') as MapScene['rooms'] : [],
    walls: Array.isArray(input.walls) ? input.walls.filter((w) => w && typeof w.id === 'string') as MapScene['walls'] : [],
    pins: Array.isArray(input.pins) ? input.pins.filter((p) => p && typeof p.id === 'string') as MapScene['pins'] : [],
    handouts: Array.isArray(input.handouts) ? input.handouts
      .filter((h) => h && typeof h.id === 'string')
      .map((h) => {
        const handout = h as Partial<MapScene['handouts'][number]>
        return {
          id: String(handout.id),
          title: typeof handout.title === 'string' && handout.title.trim() ? handout.title.trim().slice(0, 160) : 'Handout',
          body: typeof handout.body === 'string' ? handout.body.slice(0, 12000) : '',
          imagePath: typeof handout.imagePath === 'string' && handout.imagePath ? handout.imagePath : null,
          createdAt: typeof handout.createdAt === 'string' ? handout.createdAt : now,
          updatedAt: typeof handout.updatedAt === 'string' ? handout.updatedAt : now
        }
      }) : [],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : now
  }
}

function normalizeLibrary(value: unknown): MapBerryLibrary {
  if (!value || typeof value !== 'object') return defaultLibrary()
  const parsed = value as Partial<MapBerryLibrary>
  const maps = Array.isArray(parsed.maps)
    ? parsed.maps.map((m) => normalizeScene(m)).filter((m): m is MapScene => Boolean(m))
    : []
  const activeMapId = typeof parsed.activeMapId === 'string' && maps.some((m) => m.id === parsed.activeMapId)
    ? parsed.activeMapId
    : maps[0]?.id ?? null
  return { version: 1, maps, activeMapId }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeRotation(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const snapped = Math.round(n / 90) * 90
  return ((snapped % 360) + 360) % 360
}

function loadLibrary(): MapBerryLibrary {
  const path = libraryPath()
  if (!existsSync(path)) {
    const library = withDemoMap(defaultLibrary())
    writeFileSync(path, JSON.stringify(library, null, 2), 'utf8')
    return library
  }
  try {
    const library = withDemoMap(normalizeLibrary(JSON.parse(readFileSync(path, 'utf8'))))
    writeFileSync(path, JSON.stringify(library, null, 2), 'utf8')
    return library
  } catch {
    const library = withDemoMap(defaultLibrary())
    writeFileSync(path, JSON.stringify(library, null, 2), 'utf8')
    return library
  }
}

function saveLibrary(library: MapBerryLibrary): boolean {
  writeFileSync(libraryPath(), JSON.stringify(normalizeLibrary({ ...library, version: 1 }), null, 2), 'utf8')
  return true
}

function hasValidImageMagic(buf: Buffer, ext: string): boolean {
  switch (ext.toLowerCase()) {
    case '.png': return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    case '.jpg':
    case '.jpeg': return buf[0] === 0xff && buf[1] === 0xd8
    case '.webp': return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    default: return false
  }
}

async function isValidImageImportSource(srcPath: string, ext: string, maxSize = MAX_IMAGE_SIZE): Promise<boolean> {
  const stat = await fsPromises.stat(srcPath)
  if (!stat.isFile() || stat.size > maxSize) return false
  const handle = await fsPromises.open(srcPath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return hasValidImageMagic(buf.subarray(0, bytesRead), ext)
  } finally {
    await handle.close()
  }
}

async function importImageAsset(event: Electron.IpcMainInvokeEvent, options: {
  title: string
  destDir: string
  maxSize: number
}): Promise<{ assetPath: string; sourcePath: string } | null> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showOpenDialog(win, {
      title: options.title,
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    : await dialog.showOpenDialog({
      title: options.title,
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
  if (result.canceled || !result.filePaths[0]) return null

  const srcPath = result.filePaths[0]
  const ext = extname(srcPath).toLowerCase()
  if (!IMAGE_EXT.has(ext) || !await isValidImageImportSource(srcPath, ext, options.maxSize)) return null

  const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
  const destPath = join(options.destDir, destName)
  try {
    await fsPromises.copyFile(srcPath, destPath)
    return { assetPath: relative(userDataPath(), destPath).replace(/\\/g, '/'), sourcePath: srcPath }
  } catch {
    try { if (existsSync(destPath)) unlinkSync(destPath) } catch { /* best effort */ }
    return null
  }
}

async function importMapFile(event: Electron.IpcMainInvokeEvent): Promise<MapScene | null> {
  const imported = await importImageAsset(event, { title: 'Karte importieren', destDir: assetsDir(), maxSize: MAX_IMAGE_SIZE })
  if (!imported) return null

  const now = new Date().toISOString()
  return {
    id: makeId(),
    name: basename(imported.sourcePath, extname(imported.sourcePath)),
    imagePath: imported.assetPath,
    width: 0,
    height: 0,
    gridType: 'square',
    gridSize: 50,
    ftPerUnit: 5,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridVisible: true,
    gridThickness: 1,
    gridColor: GRID_WHITE,
    rotation: 0,
    rotationPlayer: 0,
    cameraX: null,
    cameraY: null,
    cameraScale: null,
    fogBitmap: null,
    drawings: [],
    rooms: [],
    walls: [],
    pins: [],
    handouts: [],
    createdAt: now,
    updatedAt: now
  }
}

function assetFullPath(assetPath: string): string | null {
  if (!assetPath || assetPath.includes('\0')) return null
  const root = resolve(userDataPath())
  const full = resolve(root, assetPath)
  if (!full.startsWith(root + sep) && full !== root) return null
  if (!existsSync(full)) return null
  const real = realpathSync(full)
  const realRoot = realpathSync(root)
  if (!real.startsWith(realRoot + sep) && real !== realRoot) return null
  if (lstatSync(full).isSymbolicLink()) return null
  return real
}

function installRuntimeCsp(): void {
  const dev = "default-src 'self' http://localhost:5176 ws://localhost:5176; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5176; style-src 'self' 'unsafe-inline' http://localhost:5176; img-src 'self' data: local-asset: http://localhost:5176; connect-src 'self' local-asset: ws://localhost:5176 http://localhost:5176; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
  const prod = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-asset:; connect-src 'self' local-asset:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders ?? {}),
        'Content-Security-Policy': [isDev ? dev : prod],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY']
      }
    })
  })
}

function registerLocalAssetProtocol(): void {
  protocol.handle('local-asset', (request) => {
    try {
      const rawPath = decodeURIComponent(new URL(request.url).pathname)
      const assetPath = rawPath.replace(/^[/\\]+/, '')
      const full = assetFullPath(assetPath)
      if (!full) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(full).href)
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

function displayInfos(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: `Display ${display.id}${display.id === primary ? ' (Primär)' : ''}`,
    bounds: display.bounds,
    isPrimary: display.id === primary
  }))
}

function safeSendToPlayer(channel: string, payload: unknown): void {
  if (!playerWindow || playerWindow.isDestroyed()) return
  try { playerWindow.webContents.send(channel, payload) } catch { /* window is going away */ }
}

function safeSendToDM(channel: string, payload?: unknown): void {
  if (!dmWindow || dmWindow.isDestroyed()) return
  try { dmWindow.webContents.send(channel, payload) } catch { /* window is going away */ }
}

function registerIpc(): void {
  ipcMain.handle('mapberry:library-load', () => loadLibrary())
  ipcMain.handle('mapberry:library-save', (_event, library: MapBerryLibrary) => saveLibrary(library))
  ipcMain.on('mapberry:library-save-sync', (event, library: MapBerryLibrary) => {
    try {
      event.returnValue = saveLibrary(library)
    } catch {
      event.returnValue = false
    }
  })
  ipcMain.handle('mapberry:import-map', importMapFile)
  ipcMain.handle('mapberry:import-handout-image', async (event) => {
    const imported = await importImageAsset(event, { title: 'Handout-Bild importieren', destDir: handoutAssetsDir(), maxSize: MAX_HANDOUT_IMAGE_SIZE })
    return imported?.assetPath ?? null
  })
  ipcMain.handle('mapberry:confirm', async (event, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.MessageBoxOptions = {
      type: 'warning',
      title: 'MapBerry',
      message,
      detail,
      buttons: ['Abbrechen', 'OK'],
      cancelId: 0,
      defaultId: 1
    }
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    return response === 1
  })
  ipcMain.handle('mapberry:get-asset-data-url', async (_event, assetPath: string) => {
    const full = assetFullPath(assetPath)
    if (!full) return null
    const ext = extname(full).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
    const buf = await fsPromises.readFile(full)
    return `data:${mime};base64,${buf.toString('base64')}`
  })
  ipcMain.handle('mapberry:reveal-data', async () => shell.openPath(userDataPath()))
  ipcMain.handle('mapberry:get-monitors', () => displayInfos())
  ipcMain.handle('mapberry:set-player-monitor', (_event, displayId: number) => {
    playerDisplayId = displayId
    return true
  })
  ipcMain.handle('mapberry:open-player-window', () => {
    createPlayerWindow()
    return true
  })
  ipcMain.handle('mapberry:close-player-window', () => {
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close()
    playerWindow = null
    return true
  })

  ipcMain.on('mapberry:player-sync', (event, state: PlayerMapState) => {
    if (dmWindow && event.sender === dmWindow.webContents) safeSendToPlayer('mapberry:player-sync', state)
  })
  ipcMain.on('mapberry:player-pointer', (event, pointer: PlayerPointer) => {
    if (dmWindow && event.sender === dmWindow.webContents) safeSendToPlayer('mapberry:player-pointer', pointer)
  })
  ipcMain.on('mapberry:player-measure', (event, measure: PlayerMeasure | null) => {
    if (dmWindow && event.sender === dmWindow.webContents) safeSendToPlayer('mapberry:player-measure', measure)
  })
  ipcMain.on('mapberry:player-viewport', (event, viewport: PlayerViewport | null) => {
    if (dmWindow && event.sender === dmWindow.webContents) safeSendToPlayer('mapberry:player-viewport', viewport)
  })
  ipcMain.on('mapberry:player-request-sync', (event) => {
    if (playerWindow && event.sender === playerWindow.webContents) safeSendToDM('mapberry:dm-request-sync')
  })
  ipcMain.on('mapberry:player-window-size', (event, size: { w: number; h: number }) => {
    if (playerWindow && event.sender === playerWindow.webContents) safeSendToDM('mapberry:dm-player-window-size', size)
  })
}

function createDMWindow(): void {
  const isDarwin = process.platform === 'darwin'
  const preload = join(appRoot(), 'dist/preload/preload.js')
  dmWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    title: 'MapBerry - DM',
    backgroundColor: '#08070a',
    show: false,
    frame: false,
    titleBarStyle: isDarwin ? 'hiddenInset' : 'hidden',
    ...(isDarwin ? {} : { titleBarOverlay: { color: '#08070a', symbolColor: '#f3c46a', height: 36 } }),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: false
    }
  })
  dmWindow.webContents.on('will-attach-webview', (e) => e.preventDefault())
  dmWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  dmWindow.once('ready-to-show', () => dmWindow?.show())
  if (isDev) dmWindow.loadURL(RENDERER_URL)
  else dmWindow.loadFile(join(appRoot(), 'dist/renderer/index.html'))
  dmWindow.on('closed', () => {
    dmWindow = null
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close()
    playerWindow = null
  })
}

function createPlayerWindow(): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus()
    return
  }
  const displays = screen.getAllDisplays()
  let target = displays.find((d) => d.id === playerDisplayId)
  if (!target) target = displays.find((d) => d.id !== screen.getPrimaryDisplay().id)
  if (!target) target = screen.getPrimaryDisplay()
  const preload = join(appRoot(), 'dist/preload/preload.js')
  playerWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    title: 'MapBerry - Spieler',
    backgroundColor: '#000000',
    frame: false,
    fullscreen: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: false
    }
  })
  playerWindow.webContents.on('will-attach-webview', (e) => e.preventDefault())
  playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (isDev) playerWindow.loadURL(`${RENDERER_URL}/player.html`)
  else playerWindow.loadFile(join(appRoot(), 'dist/renderer/player.html'))
  playerWindow.on('closed', () => {
    playerWindow = null
    safeSendToDM('mapberry:player-window-closed')
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.exit(0)
app.on('second-instance', () => {
  if (dmWindow && !dmWindow.isDestroyed()) {
    if (dmWindow.isMinimized()) dmWindow.restore()
    dmWindow.focus()
  }
})

app.whenReady().then(() => {
  installRuntimeCsp()
  registerLocalAssetProtocol()
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  registerIpc()
  createDMWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createDMWindow()
})
