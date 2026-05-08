import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  Bell,
  BrickWall,
  CircleDashed,
  Clock3,
  Contrast,
  DoorOpen,
  Eraser,
  Eye,
  EyeOff,
  FileText,
  Focus,
  Grid3X3,
  Hand,
  Hexagon,
  Layers,
  MapIcon,
  MapPin,
  Minus,
  MonitorUp,
  MousePointer2,
  Paintbrush,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  RefreshCcw,
  RotateCw,
  Ruler,
  ScanLine,
  Send,
  Settings,
  Square,
  Trash2,
  Type,
  Upload,
  View
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import logoUrl from './assets/MapBerry.png'
import type {
  DisplayInfo,
  DrawingRecord,
  DrawingType,
  MapBerryLibrary,
  MapScene,
  PlayerMeasure,
  PlayerPointer,
  PlayerViewport,
  RoomRecord,
  ToolId,
  WallRecord
} from '../shared/mapberry'
import type { HandoutRecord, PlayerNoticeTone, PlayerOverlayKind, PlayerOverlayPlacement, PlayerOverlayState, PlayerTimerState } from '../shared/mapberry'
import { DEFAULT_PLAYER_OVERLAY_SETTINGS, EMPTY_PLAYER_OVERLAY, gridColorLabel, isGridBlack, nextGridColor, normalizeGridColor } from '../shared/mapberry'
import { useAssetImage } from './lib/image'
import { applyFogOp, createFogCanvas, tintFogSource, type FogOp } from './lib/fog'
import {
  PLAYER_VIEWPORT_STROKE,
  ROOM_PREVIEW_STROKE,
  ROOM_SELECTED_STROKE,
  ROOM_STROKE,
  TOOL_PREVIEW_STROKE,
  WALL_STROKE,
  drawingStroke,
  screenDash,
  screenPx
} from './lib/canvasStrokes'
import { distance, flattened, polygonCenter, rectFromPoints, screenToMap, uid } from './lib/mapMath'
import { COPY, type Locale, type Theme } from './i18n'
import './styles.css'

const DEFAULT_LIBRARY: MapBerryLibrary = { version: 1, maps: [], activeMapId: null }
const LEAF = '#7fb20d'
const GOLD = '#f1bd61'
const DEFAULT_DRAW_COLOR = '#111111'
const GITHUB_URL = 'https://github.com/RollBerryStudios/MapBerry'
const ROLLBERRY_URL = 'https://github.com/RollBerryStudios'
const CONTACT_EMAIL = 'kontakt@rollberry.de'
const CONTACT_URL = `mailto:${CONTACT_EMAIL}`
const RENDERER_PLATFORM = getRendererPlatform()

const DRAW_COLOR_SWATCHES = [
  { id: 'black', name: 'Schwarz', value: '#111111' },
  { id: 'white', name: 'Weiß', value: '#ffffff' },
  { id: 'red', name: 'Rot', value: '#ef4444' },
  { id: 'orange', name: 'Orange', value: '#f97316' },
  { id: 'yellow', name: 'Gelb', value: '#facc15' },
  { id: 'green', name: 'Grün', value: '#22c55e' },
  { id: 'blue', name: 'Blau', value: '#2563eb' },
  { id: 'violet', name: 'Violett', value: '#8b5cf6' }
]

const TOOL_GROUPS: Array<{ label: string; tools: Array<{ id: ToolId; icon: LucideIcon; label: string }> }> = [
  { label: 'Ansicht', tools: [
    { id: 'select', icon: Hand, label: 'Pan' },
    { id: 'pointer', icon: MapPin, label: 'Ping' },
    { id: 'measure-line', icon: Ruler, label: 'Messen' },
    { id: 'measure-circle', icon: CircleDashed, label: 'Radius' }
  ] },
  { label: 'Nebel', tools: [
    { id: 'fog-brush', icon: Eye, label: 'Aufdecken' },
    { id: 'fog-brush-cover', icon: EyeOff, label: 'Verdecken' },
    { id: 'fog-rect', icon: ScanLine, label: 'Rechteck auf' },
    { id: 'fog-cover', icon: Square, label: 'Rechteck zu' }
  ] },
  { label: 'Malen', tools: [
    { id: 'draw-freehand', icon: Paintbrush, label: 'Freihand' },
    { id: 'draw-rect', icon: RectangleHorizontal, label: 'Rechteck' },
    { id: 'draw-circle', icon: CircleDashed, label: 'Kreis' },
    { id: 'draw-text', icon: Type, label: 'Text' },
    { id: 'draw-erase', icon: Eraser, label: 'Radierer' }
  ] },
  { label: 'Raum', tools: [
    { id: 'room', icon: Hexagon, label: 'Raum' },
    { id: 'wall', icon: BrickWall, label: 'Wand' },
    { id: 'door', icon: DoorOpen, label: 'Tür' }
  ] }
]

const TOOL_DOCK_GROUPS: Array<{
  id: string
  label: string
  icon: LucideIcon
  tools: Array<{ id: ToolId; icon: LucideIcon; label: string }>
}> = [
  { id: 'view', label: 'Ansicht', icon: Hand, tools: TOOL_GROUPS[0].tools },
  { id: 'fog', label: 'Nebel', icon: EyeOff, tools: TOOL_GROUPS[1].tools },
  { id: 'draw', label: 'Malen', icon: Paintbrush, tools: TOOL_GROUPS[2].tools },
  { id: 'structure', label: 'Räume', icon: Layers, tools: TOOL_GROUPS[3].tools }
]

export function App() {
  const [library, setLibrary] = useState<MapBerryLibrary>(DEFAULT_LIBRARY)
  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<ToolId>('select')
  const [drawColor, setDrawColor] = useState(DEFAULT_DRAW_COLOR)
  const [drawWidth, setDrawWidth] = useState(3)
  const [fogBrushRadius, setFogBrushRadius] = useState(44)
  const [blackout, setBlackout] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [monitors, setMonitors] = useState<DisplayInfo[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [playerViewport, setPlayerViewport] = useState<PlayerViewport | null>(null)
  const [playerWindowSize, setPlayerWindowSize] = useState({ w: 1280, h: 720 })
  const [openToolGroup, setOpenToolGroup] = useState<string | null>(null)
  const [playerOverlay, setPlayerOverlay] = useState<PlayerOverlayState>(EMPTY_PLAYER_OVERLAY)
  const [selectedHandoutId, setSelectedHandoutId] = useState<string | null>(null)
  const [noticeTitle, setNoticeTitle] = useState('Hinweis')
  const [noticeBody, setNoticeBody] = useState('')
  const [noticeTone, setNoticeTone] = useState<PlayerNoticeTone>('message')
  const [timerLabel, setTimerLabel] = useState('Countdown')
  const [timerMinutes, setTimerMinutes] = useState(10)
  const [clockNow, setClockNow] = useState(Date.now())
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem('mapberry-locale') === 'en' ? 'en' : 'de')
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem('mapberry-theme') === 'light' ? 'light' : 'dark')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutBlockedByCanvas, setShortcutBlockedByCanvas] = useState(false)
  const gridShortcutArmedRef = useRef(false)
  const gridShortcutTimerRef = useRef<number | null>(null)
  const latestSyncRef = useRef<{ map: MapScene | null; blackout: boolean; viewport: PlayerViewport | null; overlay: PlayerOverlayState }>({
    map: null,
    blackout: false,
    viewport: null,
    overlay: EMPTY_PLAYER_OVERLAY
  })

  const activeMap = useMemo(
    () => library.maps.find((map) => map.id === library.activeMapId) ?? null,
    [library.maps, library.activeMapId]
  )
  const c = COPY[locale]

  function setLocale(next: Locale): void {
    setLocaleState(next)
    localStorage.setItem('mapberry-locale', next)
  }

  function setTheme(next: Theme): void {
    setThemeState(next)
    localStorage.setItem('mapberry-theme', next)
  }

  const commit = useCallback((next: MapBerryLibrary, sync = true) => {
    setLibrary(next)
    void window.mapberry.saveLibrary(next)
    if (sync) {
      const nextMap = next.maps.find((map) => map.id === next.activeMapId) ?? null
      sendFullSync(nextMap, blackout, playerViewport, playerOverlay)
    }
  }, [blackout, playerOverlay, playerViewport])

  const updateActiveMap = useCallback((updater: (map: MapScene) => MapScene, sync = true) => {
    setLibrary((prev) => {
      const maps = prev.maps.map((map) => map.id === prev.activeMapId ? updater(map) : map)
      const next = { ...prev, maps }
      void window.mapberry.saveLibrary(next)
      if (sync) {
        const nextMap = maps.find((map) => map.id === prev.activeMapId) ?? null
        sendFullSync(nextMap, blackout, playerViewport, playerOverlay)
      }
      return next
    })
  }, [blackout, playerOverlay, playerViewport])

  const selectRoom = useCallback((id: string | null) => {
    setSelectedRoomId(id)
    if (id) {
      setSelectedWallId(null)
      setSelectedDrawingId(null)
    }
  }, [])

  const selectWall = useCallback((id: string | null) => {
    setSelectedWallId(id)
    if (id) {
      setSelectedRoomId(null)
      setSelectedDrawingId(null)
    }
  }, [])

  const selectDrawing = useCallback((id: string | null) => {
    setSelectedDrawingId(id)
    if (id) {
      setSelectedRoomId(null)
      setSelectedWallId(null)
    }
  }, [])

  useEffect(() => {
    latestSyncRef.current = { map: activeMap, blackout, viewport: playerViewport, overlay: playerOverlay }
  }, [activeMap, blackout, playerOverlay, playerViewport])

  useEffect(() => {
    let cancelled = false
    window.mapberry.loadLibrary().then((loaded) => {
      if (!cancelled) {
        setLibrary(loaded ?? DEFAULT_LIBRARY)
        setReady(true)
      }
    })
    void window.mapberry.getMonitors().then(setMonitors)
    const offClosed = window.mapberry.onPlayerWindowClosed(() => setPlayerOpen(false))
    const offSync = window.mapberry.onPlayerSyncRequest(() => {
      const latest = latestSyncRef.current
      sendFullSync(latest.map, latest.blackout, latest.viewport, latest.overlay)
    })
    const offSize = window.mapberry.onPlayerWindowSize((size) => setPlayerWindowSize(size))
    return () => {
      cancelled = true
      offClosed()
      offSync()
      offSize()
    }
  }, [])

  useEffect(() => {
    const handler = () => window.mapberry.saveLibrarySync(library)
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [library])

  useEffect(() => {
    sendFullSync(activeMap, blackout, playerViewport, playerOverlay)
  }, [activeMap?.id, blackout, playerOverlay, playerViewport])

  useEffect(() => {
    window.mapberry.sendPlayerViewport(playerViewport)
  }, [playerViewport])

  useEffect(() => {
    if (!playerOverlay.timer?.running) return
    const id = window.setInterval(() => setClockNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [playerOverlay.timer?.id, playerOverlay.timer?.running])

  useEffect(() => {
    if (!activeMap) {
      setSelectedHandoutId(null)
      setPlayerOverlay((overlay) => overlay.activeHandoutId ? { ...overlay, activeHandoutId: null } : overlay)
      return
    }
    const handoutStillExists = selectedHandoutId && activeMap.handouts.some((handout) => handout.id === selectedHandoutId)
    if (!handoutStillExists) setSelectedHandoutId(activeMap.handouts[0]?.id ?? null)
    setPlayerOverlay((overlay) => (
      overlay.activeHandoutId && !activeMap.handouts.some((handout) => handout.id === overlay.activeHandoutId)
        ? { ...overlay, activeHandoutId: null }
        : overlay
    ))
  }, [activeMap?.id, activeMap?.handouts.length, selectedHandoutId])

  useEffect(() => {
    function clearGridShortcut() {
      gridShortcutArmedRef.current = false
      if (gridShortcutTimerRef.current !== null) {
        window.clearTimeout(gridShortcutTimerRef.current)
        gridShortcutTimerRef.current = null
      }
    }

    function armGridShortcut() {
      clearGridShortcut()
      gridShortcutArmedRef.current = true
      gridShortcutTimerRef.current = window.setTimeout(clearGridShortcut, 1200)
    }

    function rotate(value: number) {
      return (value + 90) % 360
    }

    function handleGridShortcut(event: KeyboardEvent): boolean {
      if (!activeMap) return false
      const key = normalizedShortcutKey(event)
      const coarse = event.shiftKey ? 10 : 1
      const lineStep = event.shiftKey ? 0.5 : 0.25
      if (isPlusKey(event)) {
        patchActiveMap({ gridSize: Math.min(400, activeMap.gridSize + coarse) })
        return true
      }
      if (isMinusKey(event)) {
        patchActiveMap({ gridSize: Math.max(8, activeMap.gridSize - coarse) })
        return true
      }
      if (key === 'c') {
        patchActiveMap({ gridColor: nextGridColor(activeMap.gridColor) })
        return true
      }
      if (key === 'v') {
        patchActiveMap(activeMap.gridType === 'none'
          ? { gridType: 'square', gridVisible: true }
          : { gridVisible: !activeMap.gridVisible })
        return true
      }
      if (key === '0') {
        patchActiveMap({ gridType: 'none', gridVisible: false })
        return true
      }
      if (key === '1') {
        patchActiveMap({ gridType: 'square', gridVisible: true })
        return true
      }
      if (key === '2') {
        patchActiveMap({ gridType: 'hex', gridVisible: true })
        return true
      }
      if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
        const offsetStep = event.shiftKey ? 10 : 1
        patchActiveMap({
          gridOffsetX: activeMap.gridOffsetX + (key === 'arrowleft' ? -offsetStep : key === 'arrowright' ? offsetStep : 0),
          gridOffsetY: activeMap.gridOffsetY + (key === 'arrowup' ? -offsetStep : key === 'arrowdown' ? offsetStep : 0)
        })
        return true
      }
      if (key === '.') {
        patchActiveMap({ gridThickness: Math.min(5, Number((activeMap.gridThickness + lineStep).toFixed(2))) })
        return true
      }
      if (key === ',') {
        patchActiveMap({ gridThickness: Math.max(0.25, Number((activeMap.gridThickness - lineStep).toFixed(2))) })
        return true
      }
      if (key === 'd') {
        patchActiveMap({ rotation: rotate(activeMap.rotation) })
        return true
      }
      if (key === 's') {
        patchActiveMap({ rotationPlayer: rotate(activeMap.rotationPlayer) })
        return true
      }
      if (key === 'o') {
        setOpenToolGroup((group) => group === 'grid' ? null : 'grid')
        return true
      }
      return false
    }

    function onKey(event: KeyboardEvent) {
      if (shouldIgnoreShortcutEvent(event) || settingsOpen) return
      const key = normalizedShortcutKey(event)
      if (key === 'escape') {
        clearGridShortcut()
        setOpenToolGroup(null)
        setTool('select')
        event.preventDefault()
        return
      }
      if (event.altKey || event.metaKey || event.ctrlKey || shortcutBlockedByCanvas) return
      if (gridShortcutArmedRef.current) {
        if (handleGridShortcut(event)) {
          clearGridShortcut()
          event.preventDefault()
        }
        return
      }
      if (key === 'g') {
        armGridShortcut()
        event.preventDefault()
        return
      }
      if (key === 'h') {
        setTool('select')
        setOpenToolGroup(null)
        event.preventDefault()
        return
      }
      if (key === 'p') {
        setTool('pointer')
        setOpenToolGroup(null)
        event.preventDefault()
        return
      }
      if (key === 'b') {
        setBlackout((value) => !value)
        event.preventDefault()
        return
      }
      if (key === 'f') {
        setOpenToolGroup((group) => group === 'fog' ? null : 'fog')
        event.preventDefault()
        return
      }
      if (key === 'd') {
        setOpenToolGroup((group) => group === 'draw' ? null : 'draw')
        event.preventDefault()
        return
      }
      if (key === 'r') {
        setOpenToolGroup((group) => group === 'structure' ? null : 'structure')
        event.preventDefault()
        return
      }
      if (key === 'l' && activeMap) {
        toggleViewport()
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearGridShortcut()
      window.removeEventListener('keydown', onKey)
    }
  }, [activeMap, settingsOpen, shortcutBlockedByCanvas])

  async function handleImportMap() {
    const map = await window.mapberry.importMap()
    if (!map) return
    commit({ version: 1, maps: [...library.maps, map], activeMapId: map.id })
  }

  async function handleDeleteMap(id: string) {
    const map = library.maps.find((candidate) => candidate.id === id)
    if (!map) return
    const ok = await window.mapberry.confirm(c.deleteMapConfirm(map.name), c.deleteMapDetail)
    if (!ok) return
    const maps = library.maps.filter((candidate) => candidate.id !== id)
    commit({ version: 1, maps, activeMapId: maps[0]?.id ?? null })
  }

  async function togglePlayerWindow() {
    if (playerOpen) {
      await window.mapberry.closePlayerWindow()
      setPlayerOpen(false)
      return
    }
    await window.mapberry.openPlayerWindow()
    setPlayerOpen(true)
    setTimeout(() => sendFullSync(activeMap, blackout, playerViewport, playerOverlay), 400)
  }

  function patchActiveMap(patch: Partial<MapScene>, sync = true) {
    updateActiveMap((map) => ({ ...map, ...patch, updatedAt: new Date().toISOString() }), sync)
  }

  function toggleViewport() {
    if (!activeMap) return
    if (playerViewport) {
      setPlayerViewport(null)
      window.mapberry.sendPlayerViewport(null)
      return
    }
    const aspect = playerWindowSize.w > 0 && playerWindowSize.h > 0 ? playerWindowSize.w / playerWindowSize.h : 16 / 9
    const w = Math.max(300, Math.min(activeMap.width || 1200, (activeMap.width || 1200) * 0.55))
    const h = w / aspect
    const viewport = {
      cx: (activeMap.width || 1200) / 2,
      cy: (activeMap.height || 800) / 2,
      w,
      h,
      rotation: 0
    }
    setPlayerViewport(viewport)
    window.mapberry.sendPlayerViewport(viewport)
  }

  function addHandout() {
    if (!activeMap) return
    const now = new Date().toISOString()
    const handout: HandoutRecord = {
      id: uid(),
      title: `Handout ${activeMap.handouts.length + 1}`,
      body: '',
      imagePath: null,
      createdAt: now,
      updatedAt: now
    }
    updateActiveMap((map) => ({ ...map, handouts: [...map.handouts, handout], updatedAt: now }))
    setSelectedHandoutId(handout.id)
  }

  function patchHandout(id: string, patch: Partial<HandoutRecord>) {
    const now = new Date().toISOString()
    updateActiveMap((map) => ({
      ...map,
      handouts: map.handouts.map((handout) => handout.id === id ? { ...handout, ...patch, updatedAt: now } : handout),
      updatedAt: now
    }))
  }

  function deleteHandout(id: string) {
    updateActiveMap((map) => ({ ...map, handouts: map.handouts.filter((handout) => handout.id !== id), updatedAt: new Date().toISOString() }))
    setSelectedHandoutId((current) => current === id ? null : current)
    setPlayerOverlay((overlay) => overlay.activeHandoutId === id ? { ...overlay, activeHandoutId: null } : overlay)
  }

  async function importHandoutImage(id: string) {
    const imagePath = await window.mapberry.importHandoutImage()
    if (imagePath) patchHandout(id, { imagePath })
  }

  function removeHandoutImage(id: string) {
    patchHandout(id, { imagePath: null })
  }

  function showHandout(id: string | null) {
    setPlayerOverlay((overlay) => ({ ...overlay, activeHandoutId: id }))
  }

  function sendNotice() {
    const body = noticeBody.trim()
    if (!body) return
    setPlayerOverlay((overlay) => ({
      ...overlay,
      notice: {
        id: uid(),
        title: noticeTitle.trim() || (noticeTone === 'alert' ? 'Alarm' : 'Hinweis'),
        body,
        tone: noticeTone,
        createdAt: Date.now()
      }
    }))
  }

  function clearNotice() {
    setPlayerOverlay((overlay) => ({ ...overlay, notice: null }))
  }

  function startTimer() {
    const durationSeconds = Math.max(5, Math.round(timerMinutes * 60) || 60)
    const timer: PlayerTimerState = {
      id: uid(),
      label: timerLabel.trim() || 'Countdown',
      durationSeconds,
      remainingSeconds: durationSeconds,
      running: true,
      startedAt: Date.now()
    }
    setClockNow(Date.now())
    setPlayerOverlay((overlay) => ({ ...overlay, timer }))
  }

  function pauseOrResumeTimer() {
    setClockNow(Date.now())
    setPlayerOverlay((overlay) => {
      const timer = overlay.timer
      if (!timer) return overlay
      const remainingSeconds = timerRemainingSeconds(timer, Date.now())
      return {
        ...overlay,
        timer: timer.running
          ? { ...timer, remainingSeconds, running: false, startedAt: null }
          : { ...timer, remainingSeconds, running: true, startedAt: Date.now() }
      }
    })
  }

  function resetTimer() {
    setClockNow(Date.now())
    setPlayerOverlay((overlay) => {
      const timer = overlay.timer
      return timer ? { ...overlay, timer: { ...timer, remainingSeconds: timer.durationSeconds, running: false, startedAt: null } } : overlay
    })
  }

  function clearTimer() {
    setPlayerOverlay((overlay) => ({ ...overlay, timer: null }))
  }

  function patchOverlayPlacement(kind: PlayerOverlayKind, patch: Partial<PlayerOverlayPlacement>) {
    setPlayerOverlay((overlay) => ({
      ...overlay,
      settings: {
        ...(overlay.settings ?? DEFAULT_PLAYER_OVERLAY_SETTINGS),
        [kind]: {
          ...(overlay.settings ?? DEFAULT_PLAYER_OVERLAY_SETTINGS)[kind],
          ...patch
        }
      }
    }))
  }

  if (!ready) {
    return <div className="splash"><img src={logoUrl} alt="" /><span>{c.loading}</span></div>
  }

  const ActiveToolIcon = findTool(tool)?.icon ?? MousePointer2

  return (
    <div className="app-shell" data-theme={theme} data-platform={RENDERER_PLATFORM} data-testid="dm-app">
      <header className="titlebar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <div>
            <strong>MapBerry</strong>
            <span>{activeMap ? activeMap.name : c.tagline}</span>
          </div>
        </div>
        <div className="window-actions">
          <button className="icon-only settings-trigger" onClick={() => setSettingsOpen(true)} title={c.settings} aria-label={c.settings}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="topbar">
        <button className="primary icon-text" data-testid="import-map" onClick={handleImportMap}>
          <Upload size={18} />
          <span>{c.importMap}</span>
        </button>
        {activeMap && (
          <label className="topbar-map-name">
            <MapIcon size={17} />
            <input aria-label={c.name} value={activeMap.name} onChange={(event) => patchActiveMap({ name: event.target.value })} />
          </label>
        )}
        <div className="topbar-tool" data-testid="active-tool-readout" title={c.tool}>
          <ActiveToolIcon size={18} />
          <span>{toolLabel(tool)}</span>
        </div>
        <button className={`icon-text ${playerOpen ? 'active' : ''}`} onClick={togglePlayerWindow}>
          <MonitorUp size={18} />
          <span>{playerOpen ? c.playerWindowOn : c.playerWindow}</span>
        </button>
        <button className={`icon-text ${blackout ? 'danger active' : 'danger'}`} onClick={() => setBlackout((value) => !value)}>
          <EyeOff size={18} />
          <span>{c.blackout}</span>
        </button>
        <button className={`icon-text ${playerViewport ? 'active gold' : ''}`} onClick={toggleViewport}>
          <Focus size={18} />
          <span>{c.playerFrame}</span>
        </button>
        {playerViewport && (
          <>
            <button className="icon-only" aria-label={c.smallerFrame} title={c.smallerFrame} onClick={() => setPlayerViewport((v) => v ? { ...v, w: v.w * 0.9, h: v.h * 0.9 } : v)}>
              <Minus size={18} />
            </button>
            <button className="icon-only" aria-label={c.largerFrame} title={c.largerFrame} onClick={() => setPlayerViewport((v) => v ? { ...v, w: v.w * 1.1, h: v.h * 1.1 } : v)}>
              <Plus size={18} />
            </button>
            <button className="icon-only" aria-label={c.rotateFrame} title={c.rotateFrame} onClick={() => setPlayerViewport((v) => v ? { ...v, rotation: (v.rotation + 90) % 360 } : v)}>
              <RotateCw size={18} />
            </button>
          </>
        )}
        {activeMap && (
          <button className="danger ghost icon-only" data-testid="delete-active-map" aria-label={c.deleteMap} title={c.deleteMap} onClick={() => handleDeleteMap(activeMap.id)}>
            <Trash2 size={18} />
          </button>
        )}
        <div className="spacer" />
        <select
          title={c.monitor}
          onChange={(event) => void window.mapberry.setPlayerMonitor(Number(event.target.value))}
          defaultValue=""
        >
          <option value="" disabled>{c.monitor}</option>
          {monitors.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.label}</option>)}
        </select>
      </div>

      <main className="workspace">
        <aside className="panel left-panel">
          <section>
            <div className="panel-title">{c.maps}</div>
            <div className="map-list">
              {library.maps.map((map) => (
                <button
                  key={map.id}
                  className={`map-row ${map.id === library.activeMapId ? 'active' : ''}`}
                  onClick={() => commit({ ...library, activeMapId: map.id })}
                >
                  <span className="map-row-main"><MapIcon size={16} /><span>{map.name}</span></span>
                  <small>{map.gridType === 'none' ? c.noGrid : `${map.gridSize}px`}</small>
                </button>
              ))}
            </div>
          </section>

        </aside>

        <section className="map-surface">
          {activeMap ? (
            <>
              <MapCanvas
                map={activeMap}
                tool={tool}
                drawColor={drawColor}
                drawWidth={drawWidth}
                fogBrushRadius={fogBrushRadius}
                onDrawWidth={setDrawWidth}
                onFogBrushRadius={setFogBrushRadius}
                selectedRoomId={selectedRoomId}
                selectedWallId={selectedWallId}
                selectedDrawingId={selectedDrawingId}
                playerViewport={playerViewport}
                onViewportChange={setPlayerViewport}
                onMapPatch={patchActiveMap}
                onMapUpdate={updateActiveMap}
                onRoomSelect={selectRoom}
                onWallSelect={selectWall}
                onDrawingSelect={selectDrawing}
                onCancelTool={() => setTool('select')}
                onShortcutBlockChange={setShortcutBlockedByCanvas}
              />
              <ToolDock
                tool={tool}
                openGroup={openToolGroup}
                onOpenGroup={setOpenToolGroup}
                map={activeMap}
                onGridPatch={patchActiveMap}
                drawColor={drawColor}
                drawWidth={drawWidth}
                onDrawColor={setDrawColor}
                onDrawWidth={setDrawWidth}
                fogBrushRadius={fogBrushRadius}
                onFogBrushRadius={setFogBrushRadius}
                playerOverlay={playerOverlay}
                selectedHandoutId={selectedHandoutId}
                noticeTitle={noticeTitle}
                noticeBody={noticeBody}
                noticeTone={noticeTone}
                timerLabel={timerLabel}
                timerMinutes={timerMinutes}
                clockNow={clockNow}
                onSelectedHandout={setSelectedHandoutId}
                onAddHandout={addHandout}
                onPatchHandout={patchHandout}
                onDeleteHandout={deleteHandout}
                onImportHandoutImage={importHandoutImage}
                onRemoveHandoutImage={removeHandoutImage}
                onShowHandout={showHandout}
                onNoticeTitle={setNoticeTitle}
                onNoticeBody={setNoticeBody}
                onNoticeTone={setNoticeTone}
                onSendNotice={sendNotice}
                onClearNotice={clearNotice}
                onTimerLabel={setTimerLabel}
                onTimerMinutes={setTimerMinutes}
                onStartTimer={startTimer}
                onPauseOrResumeTimer={pauseOrResumeTimer}
                onResetTimer={resetTimer}
                onClearTimer={clearTimer}
                onOverlayPlacement={patchOverlayPlacement}
                onTool={(nextTool) => {
                  setTool(nextTool)
                  setOpenToolGroup(null)
                }}
              />
            </>
          ) : (
            <div className="empty-workspace">
              <img src={logoUrl} alt="" />
              <button className="primary large icon-text" onClick={handleImportMap}>
                <Upload size={19} />
                <span>{c.firstMap}</span>
              </button>
            </div>
          )}
        </section>

        <aside className="panel right-panel">
          {activeMap && (
            <MapSidePanel
              map={activeMap}
              selectedRoomId={selectedRoomId}
              selectedWallId={selectedWallId}
              selectedDrawingId={selectedDrawingId}
              onMapUpdate={updateActiveMap}
              onRoomSelect={selectRoom}
              onWallSelect={selectWall}
              onDrawingSelect={selectDrawing}
            />
          )}
        </aside>
      </main>
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label={c.settings} onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{c.settings}</h2>
                <p>{c.rollberryTitle}</p>
              </div>
              <button className="icon-only" aria-label={c.close} title={c.close} onClick={() => setSettingsOpen(false)}>x</button>
            </header>
            <div className="settings-grid">
              <section>
                <h3>{c.appearance}</h3>
                <SegmentedChoice
                  label={c.language}
                  value={locale}
                  options={[
                    { value: 'de', label: 'Deutsch' },
                    { value: 'en', label: 'English' },
                  ]}
                  onChange={(value) => setLocale(value as Locale)}
                />
                <SegmentedChoice
                  label={c.theme}
                  value={theme}
                  options={[
                    { value: 'dark', label: c.darkMode },
                    { value: 'light', label: c.lightMode },
                  ]}
                  onChange={(value) => setTheme(value as Theme)}
                />
              </section>
              <section>
                <h3>{c.community}</h3>
                <p>{c.rollberryInfo}</p>
                <button onClick={() => window.mapberry.openExternal(CONTACT_URL)}>{CONTACT_EMAIL}</button>
                <button onClick={() => window.mapberry.openExternal(GITHUB_URL)}>{c.githubRepo}</button>
                <button onClick={() => window.mapberry.openExternal(ROLLBERRY_URL)}>{c.rollberryGithub}</button>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="setting-choice">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="segmented-control" role="group">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'active' : ''}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </label>
  )
}

function ToolDock({
  tool,
  openGroup,
  onOpenGroup,
  map,
  onGridPatch,
  drawColor,
  drawWidth,
  onDrawColor,
  onDrawWidth,
  fogBrushRadius,
  onFogBrushRadius,
  playerOverlay,
  selectedHandoutId,
  noticeTitle,
  noticeBody,
  noticeTone,
  timerLabel,
  timerMinutes,
  clockNow,
  onSelectedHandout,
  onAddHandout,
  onPatchHandout,
  onDeleteHandout,
  onImportHandoutImage,
  onRemoveHandoutImage,
  onShowHandout,
  onNoticeTitle,
  onNoticeBody,
  onNoticeTone,
  onSendNotice,
  onClearNotice,
  onTimerLabel,
  onTimerMinutes,
  onStartTimer,
  onPauseOrResumeTimer,
  onResetTimer,
  onClearTimer,
  onOverlayPlacement,
  onTool
}: {
  tool: ToolId
  openGroup: string | null
  onOpenGroup: (group: string | null) => void
  map: MapScene
  onGridPatch: (patch: Partial<MapScene>) => void
  drawColor: string
  drawWidth: number
  onDrawColor: (color: string) => void
  onDrawWidth: (width: number) => void
  fogBrushRadius: number
  onFogBrushRadius: (radius: number) => void
  playerOverlay: PlayerOverlayState
  selectedHandoutId: string | null
  noticeTitle: string
  noticeBody: string
  noticeTone: PlayerNoticeTone
  timerLabel: string
  timerMinutes: number
  clockNow: number
  onSelectedHandout: (id: string | null) => void
  onAddHandout: () => void
  onPatchHandout: (id: string, patch: Partial<HandoutRecord>) => void
  onDeleteHandout: (id: string) => void
  onImportHandoutImage: (id: string) => void
  onRemoveHandoutImage: (id: string) => void
  onShowHandout: (id: string | null) => void
  onNoticeTitle: (title: string) => void
  onNoticeBody: (body: string) => void
  onNoticeTone: (tone: PlayerNoticeTone) => void
  onSendNotice: () => void
  onClearNotice: () => void
  onTimerLabel: (label: string) => void
  onTimerMinutes: (minutes: number) => void
  onStartTimer: () => void
  onPauseOrResumeTimer: () => void
  onResetTimer: () => void
  onClearTimer: () => void
  onOverlayPlacement: (kind: PlayerOverlayKind, patch: Partial<PlayerOverlayPlacement>) => void
  onTool: (tool: ToolId) => void
}) {
  const gridOpen = openGroup === 'grid'
  const liveOpen = openGroup === 'live'
  return (
    <nav className="tool-dock" aria-label="Kartenwerkzeuge">
      {TOOL_DOCK_GROUPS.map((group) => {
        const activeTool = group.tools.find((entry) => entry.id === tool)
        const GroupIcon = group.icon
        const isOpen = openGroup === group.id
        return (
          <div key={group.id} className="dock-group">
            {isOpen && (
              <div
                className={`tool-popover ${group.id === 'draw' ? 'draw-popover' : ''}`}
                role={group.id === 'draw' ? 'dialog' : 'menu'}
                aria-label={`${group.label} Werkzeuge`}
              >
                <div className="tool-popover-title">{group.label}</div>
                <div className="tool-popover-grid">
                  {group.tools.map((entry) => (
                    <ToolMenuButton key={entry.id} entry={entry} selected={tool === entry.id} onTool={onTool} />
                  ))}
                </div>
                {group.id === 'draw' && (
                  <DrawSettingsPopover
                    color={drawColor}
                    width={drawWidth}
                    onColor={onDrawColor}
                    onWidth={onDrawWidth}
                  />
                )}
                {group.id === 'fog' && (
                  <FogSettingsPopover
                    map={map}
                    brushRadius={fogBrushRadius}
                    onBrushRadius={onFogBrushRadius}
                    onPatch={onGridPatch}
                  />
                )}
              </div>
            )}
            <button
              className={`dock-button ${activeTool ? 'active' : ''} ${isOpen ? 'open' : ''}`}
              data-testid={`toolgroup-${group.id}`}
              title={`${group.label}: ${activeTool?.label ?? 'Werkzeuge'}`}
              aria-label={`${group.label}: ${activeTool?.label ?? 'Werkzeuge'}`}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              onClick={() => onOpenGroup(isOpen ? null : group.id)}
            >
              <GroupIcon size={20} />
            </button>
          </div>
        )
      })}
      <span className="dock-divider" aria-hidden="true" />
      <div className="dock-group">
        {gridOpen && <GridSettingsPopover map={map} onPatch={onGridPatch} />}
        <button
          className={`dock-button grid-settings-button ${isGridBlack(map.gridColor) ? 'is-black' : 'is-white'} ${gridOpen ? 'open' : ''}`}
          data-testid="grid-settings"
          title={`Grid: ${gridColorLabel(map.gridColor)}, ${map.gridSize}px`}
          aria-label={`Grid: ${gridColorLabel(map.gridColor)}, ${map.gridSize}px`}
          aria-expanded={gridOpen}
          aria-haspopup="dialog"
          onClick={() => onOpenGroup(gridOpen ? null : 'grid')}
        >
          <Grid3X3 size={20} />
        </button>
      </div>
      <span className="dock-divider" aria-hidden="true" />
      <div className="dock-group">
        {liveOpen && (
          <LiveSessionPopover
            map={map}
            overlay={playerOverlay}
            selectedHandoutId={selectedHandoutId}
            noticeTitle={noticeTitle}
            noticeBody={noticeBody}
            noticeTone={noticeTone}
            timerLabel={timerLabel}
            timerMinutes={timerMinutes}
            clockNow={clockNow}
            onSelectedHandout={onSelectedHandout}
            onAddHandout={onAddHandout}
            onPatchHandout={onPatchHandout}
            onDeleteHandout={onDeleteHandout}
            onImportHandoutImage={onImportHandoutImage}
            onRemoveHandoutImage={onRemoveHandoutImage}
            onShowHandout={onShowHandout}
            onNoticeTitle={onNoticeTitle}
            onNoticeBody={onNoticeBody}
            onNoticeTone={onNoticeTone}
            onSendNotice={onSendNotice}
            onClearNotice={onClearNotice}
            onTimerLabel={onTimerLabel}
            onTimerMinutes={onTimerMinutes}
            onStartTimer={onStartTimer}
            onPauseOrResumeTimer={onPauseOrResumeTimer}
            onResetTimer={onResetTimer}
            onClearTimer={onClearTimer}
            onOverlayPlacement={onOverlayPlacement}
          />
        )}
        <button
          className={`dock-button live-button ${liveOpen ? 'open' : ''} ${playerOverlay.notice || playerOverlay.timer || playerOverlay.activeHandoutId ? 'active' : ''}`}
          data-testid="toolgroup-live"
          title="Live: Handouts, Nachrichten und Timer"
          aria-label="Live: Handouts, Nachrichten und Timer"
          aria-expanded={liveOpen}
          aria-haspopup="dialog"
          onClick={() => onOpenGroup(liveOpen ? null : 'live')}
        >
          <Bell size={20} />
        </button>
      </div>
    </nav>
  )
}

function GridSettingsPopover({
  map,
  onPatch
}: {
  map: MapScene
  onPatch: (patch: Partial<MapScene>) => void
}) {
  const offsetLimit = gridOffsetLimit(map.gridSize)
  const offsetX = clampGridOffset(map.gridOffsetX, map.gridSize)
  const offsetY = clampGridOffset(map.gridOffsetY, map.gridSize)

  function setGridSize(value: number) {
    const gridSize = Math.max(8, Math.min(400, Math.round(value) || 50))
    onPatch({
      gridSize,
      gridOffsetX: clampGridOffset(map.gridOffsetX, gridSize),
      gridOffsetY: clampGridOffset(map.gridOffsetY, gridSize)
    })
  }

  return (
    <div className="tool-popover grid-popover" role="dialog" aria-label="Grid-Einstellungen">
      <div className="tool-popover-title">Grid</div>
      <div className="segmented compact">
        <button className={map.gridType === 'square' ? 'active' : ''} onClick={() => onPatch({ gridType: 'square' })}>
          <Grid3X3 size={16} />
          <span>Quadrat</span>
        </button>
        <button className={map.gridType === 'hex' ? 'active' : ''} onClick={() => onPatch({ gridType: 'hex' })}>
          <Hexagon size={16} />
          <span>Hex</span>
        </button>
        <button className={map.gridType === 'none' ? 'active' : ''} onClick={() => onPatch({ gridType: 'none' })}>
          <View size={16} />
          <span>Aus</span>
        </button>
      </div>
      <label className="check compact-check">
        <input type="checkbox" checked={map.gridVisible} onChange={(event) => onPatch({ gridVisible: event.target.checked })} />
        <span>Grid sichtbar</span>
      </label>
      <button
        className="grid-color-choice"
        data-testid="grid-color-toggle"
        title={`Gridfarbe: ${gridColorLabel(map.gridColor)}`}
        aria-label={`Gridfarbe: ${gridColorLabel(map.gridColor)}. Umschalten`}
        aria-pressed={isGridBlack(map.gridColor)}
        onClick={() => onPatch({ gridColor: nextGridColor(map.gridColor) })}
      >
        <Contrast size={18} />
        <span>Farbe</span>
        <strong>{gridColorLabel(map.gridColor)}</strong>
      </button>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>ft pro Feld</span><strong>{map.ftPerUnit}</strong></span>
        <input
          type="number"
          min="0.5"
          max="500"
          step="0.5"
          value={map.ftPerUnit}
          aria-label="ft pro Feld"
          onChange={(event) => onPatch({ ftPerUnit: Number(event.target.value) || 5 })}
        />
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Linie</span><strong>{map.gridThickness}px</strong></span>
        <input
          type="range"
          min="0.25"
          max="5"
          step="0.25"
          value={map.gridThickness}
          aria-label="Grid-Linienstärke"
          data-testid="grid-thickness-slider"
          onChange={(event) => onPatch({ gridThickness: Number(event.target.value) })}
        />
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>DM-Ansicht</span></span>
        <select aria-label="DM-Ansicht" value={map.rotation} onChange={(event) => onPatch({ rotation: Number(event.target.value) })}>
          {rotationOptions(COPY.de).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Spieleransicht</span></span>
        <select aria-label="Spieleransicht" value={map.rotationPlayer} onChange={(event) => onPatch({ rotationPlayer: Number(event.target.value) })}>
          {rotationOptions(COPY.de).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Größe</span><strong>{map.gridSize}px</strong></span>
        <input
          type="range"
          min="8"
          max="400"
          step="1"
          value={map.gridSize}
          aria-label="Gridgröße"
          data-testid="grid-size-slider"
          onChange={(event) => setGridSize(Number(event.target.value))}
        />
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Offset X</span><strong>{formatPx(offsetX)}</strong></span>
        <input
          type="range"
          min={-offsetLimit}
          max={offsetLimit}
          step="1"
          value={offsetX}
          aria-label="Grid-Offset X"
          data-testid="grid-offset-x-slider"
          onChange={(event) => onPatch({ gridOffsetX: Number(event.target.value) })}
        />
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Offset Y</span><strong>{formatPx(offsetY)}</strong></span>
        <input
          type="range"
          min={-offsetLimit}
          max={offsetLimit}
          step="1"
          value={offsetY}
          aria-label="Grid-Offset Y"
          data-testid="grid-offset-y-slider"
          onChange={(event) => onPatch({ gridOffsetY: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}

function DrawSettingsPopover({
  color,
  width,
  onColor,
  onWidth
}: {
  color: string
  width: number
  onColor: (color: string) => void
  onWidth: (width: number) => void
}) {
  return (
    <div className="draw-settings" aria-label="Maleinstellungen">
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Strich</span><strong>{width}px</strong></span>
        <input
          type="range"
          min="1"
          max="6"
          step="1"
          value={width}
          aria-label="Strichstärke"
          data-testid="draw-width-slider"
          onChange={(event) => onWidth(Number(event.target.value))}
        />
      </label>
      <div className="draw-color-grid" role="group" aria-label="Zeichenfarbe">
        {DRAW_COLOR_SWATCHES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`draw-color-swatch ${color === entry.value ? 'active' : ''}`}
            data-testid={`draw-color-${entry.id}`}
            title={entry.name}
            aria-label={entry.name}
            aria-pressed={color === entry.value}
            onClick={() => onColor(entry.value)}
          >
            <span style={{ background: entry.value }} />
          </button>
        ))}
      </div>
    </div>
  )
}

function FogSettingsPopover({
  map,
  brushRadius,
  onBrushRadius,
  onPatch
}: {
  map: MapScene
  brushRadius: number
  onBrushRadius: (radius: number) => void
  onPatch: (patch: Partial<MapScene>) => void
}) {
  const fogOpacity = Math.round((map.fogOpacity ?? 1) * 100)
  return (
    <div className="draw-settings" aria-label="Nebeleinstellungen">
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Nebelpinsel</span><strong>{brushRadius}px</strong></span>
        <input
          type="range"
          min="8"
          max="220"
          value={brushRadius}
          aria-label="Nebel-Pinsel"
          data-testid="fog-brush-slider"
          onChange={(event) => onBrushRadius(Number(event.target.value))}
        />
      </label>
      <label className="grid-slider">
        <span className="grid-slider-head"><span>Deckkraft</span><strong>{fogOpacity}%</strong></span>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={fogOpacity}
          aria-label="Nebel-Deckkraft"
          data-testid="fog-opacity-slider"
          onChange={(event) => onPatch({ fogOpacity: Number(event.target.value) / 100 })}
        />
      </label>
    </div>
  )
}

function LiveSessionPopover({
  map,
  overlay,
  selectedHandoutId,
  noticeTitle,
  noticeBody,
  noticeTone,
  timerLabel,
  timerMinutes,
  clockNow,
  onSelectedHandout,
  onAddHandout,
  onPatchHandout,
  onDeleteHandout,
  onImportHandoutImage,
  onRemoveHandoutImage,
  onShowHandout,
  onNoticeTitle,
  onNoticeBody,
  onNoticeTone,
  onSendNotice,
  onClearNotice,
  onTimerLabel,
  onTimerMinutes,
  onStartTimer,
  onPauseOrResumeTimer,
  onResetTimer,
  onClearTimer,
  onOverlayPlacement
}: {
  map: MapScene
  overlay: PlayerOverlayState
  selectedHandoutId: string | null
  noticeTitle: string
  noticeBody: string
  noticeTone: PlayerNoticeTone
  timerLabel: string
  timerMinutes: number
  clockNow: number
  onSelectedHandout: (id: string | null) => void
  onAddHandout: () => void
  onPatchHandout: (id: string, patch: Partial<HandoutRecord>) => void
  onDeleteHandout: (id: string) => void
  onImportHandoutImage: (id: string) => void
  onRemoveHandoutImage: (id: string) => void
  onShowHandout: (id: string | null) => void
  onNoticeTitle: (title: string) => void
  onNoticeBody: (body: string) => void
  onNoticeTone: (tone: PlayerNoticeTone) => void
  onSendNotice: () => void
  onClearNotice: () => void
  onTimerLabel: (label: string) => void
  onTimerMinutes: (minutes: number) => void
  onStartTimer: () => void
  onPauseOrResumeTimer: () => void
  onResetTimer: () => void
  onClearTimer: () => void
  onOverlayPlacement: (kind: PlayerOverlayKind, patch: Partial<PlayerOverlayPlacement>) => void
}) {
  const selectedHandout = map.handouts.find((handout) => handout.id === selectedHandoutId) ?? null
  const timer = overlay.timer
  const remaining = timer ? timerRemainingSeconds(timer, clockNow) : null
  const canSendNotice = noticeBody.trim().length > 0
  const settings = overlay.settings ?? DEFAULT_PLAYER_OVERLAY_SETTINGS

  return (
    <div className="tool-popover live-popover" role="dialog" aria-label="Live-Spielerfunktionen">
      <div className="tool-popover-title">Live</div>
      <section className="live-section">
        <div className="live-section-head">
          <span><MessageIcon /> Nachricht</span>
          <div className="segmented small">
            <button className={noticeTone === 'message' ? 'active' : ''} onClick={() => onNoticeTone('message')}>Info</button>
            <button className={noticeTone === 'alert' ? 'active' : ''} onClick={() => onNoticeTone('alert')}>Alarm</button>
          </div>
        </div>
        <input value={noticeTitle} aria-label="Nachrichtentitel" data-testid="live-message-title" onChange={(event) => onNoticeTitle(event.target.value)} />
        <textarea value={noticeBody} aria-label="Nachrichtentext" data-testid="live-message-body" placeholder="Kurze Nachricht an das Spielerfenster" onChange={(event) => onNoticeBody(event.target.value)} />
        <OverlayPlacementControls
          kind="notice"
          value={settings.notice}
          label="Nachricht"
          testIdPrefix="live-message"
          onChange={onOverlayPlacement}
        />
        <div className="live-actions">
          <button className="primary icon-text" data-testid="live-message-send" disabled={!canSendNotice} onClick={onSendNotice}>
            <Send size={16} />
            <span>Senden</span>
          </button>
          <button className="ghost icon-text" data-testid="live-message-clear" onClick={onClearNotice}>
            <EyeOff size={16} />
            <span>Ausblenden</span>
          </button>
        </div>
      </section>

      <section className="live-section">
        <div className="live-section-head">
          <span><Clock3 size={16} /> Timer</span>
          <strong>{remaining === null ? '--:--' : formatTimer(remaining)}</strong>
        </div>
        <div className="live-inline">
          <input value={timerLabel} aria-label="Timer-Beschriftung" data-testid="live-timer-label" onChange={(event) => onTimerLabel(event.target.value)} />
          <input type="number" min="0.1" max="240" step="0.5" value={timerMinutes} aria-label="Timer-Minuten" data-testid="live-timer-minutes" onChange={(event) => onTimerMinutes(Number(event.target.value) || 1)} />
        </div>
        <OverlayPlacementControls
          kind="timer"
          value={settings.timer}
          label="Timer"
          testIdPrefix="live-timer"
          onChange={onOverlayPlacement}
        />
        <div className="live-actions">
          <button className="primary icon-text" data-testid="live-timer-start" onClick={onStartTimer}>
            <Play size={16} />
            <span>Start</span>
          </button>
          <button className="ghost icon-text" data-testid="live-timer-toggle" disabled={!timer} onClick={onPauseOrResumeTimer}>
            {timer?.running ? <Pause size={16} /> : <Play size={16} />}
            <span>{timer?.running ? 'Pause' : 'Weiter'}</span>
          </button>
          <button className="icon-only" title="Timer zurücksetzen" aria-label="Timer zurücksetzen" data-testid="live-timer-reset" disabled={!timer} onClick={onResetTimer}>
            <RefreshCcw size={16} />
          </button>
          <button className="icon-only" title="Timer ausblenden" aria-label="Timer ausblenden" data-testid="live-timer-clear" disabled={!timer} onClick={onClearTimer}>
            <EyeOff size={16} />
          </button>
        </div>
      </section>

      <section className="live-section">
        <div className="live-section-head">
          <span><FileText size={16} /> Handouts</span>
          <button className="icon-only" title="Handout hinzufügen" aria-label="Handout hinzufügen" data-testid="live-handout-add" onClick={onAddHandout}>
            <Plus size={16} />
          </button>
        </div>
        <select value={selectedHandoutId ?? ''} aria-label="Handout auswählen" data-testid="live-handout-select" onChange={(event) => onSelectedHandout(event.target.value || null)}>
          <option value="">Kein Handout</option>
          {map.handouts.map((handout) => <option key={handout.id} value={handout.id}>{handout.title}</option>)}
        </select>
        <OverlayPlacementControls
          kind="handout"
          value={settings.handout}
          label="Handout"
          testIdPrefix="live-handout"
          onChange={onOverlayPlacement}
        />
        {selectedHandout && (
          <>
            <input value={selectedHandout.title} aria-label="Handout-Titel" data-testid="live-handout-title" onChange={(event) => onPatchHandout(selectedHandout.id, { title: event.target.value })} />
            <textarea value={selectedHandout.body} aria-label="Handout-Text" data-testid="live-handout-body" placeholder="Text, Hinweise oder Vorlesetext" onChange={(event) => onPatchHandout(selectedHandout.id, { body: event.target.value })} />
            <div className="handout-image-row">
              <span>{selectedHandout.imagePath ? 'Bild verknüpft' : 'Kein Bild'}</span>
              <button className="ghost icon-text" data-testid="live-handout-image" onClick={() => onImportHandoutImage(selectedHandout.id)}>
                <Upload size={16} />
                <span>Bild</span>
              </button>
              <button className="icon-only" title="Handout-Bild entfernen" aria-label="Handout-Bild entfernen" data-testid="live-handout-image-remove" disabled={!selectedHandout.imagePath} onClick={() => onRemoveHandoutImage(selectedHandout.id)}>
                <EyeOff size={16} />
              </button>
            </div>
            <div className="live-actions">
              <button className="primary icon-text" data-testid="live-handout-show" onClick={() => onShowHandout(selectedHandout.id)}>
                <Eye size={16} />
                <span>Anzeigen</span>
              </button>
              <button className="ghost icon-text" data-testid="live-handout-hide" disabled={overlay.activeHandoutId !== selectedHandout.id} onClick={() => onShowHandout(null)}>
                <EyeOff size={16} />
                <span>Ausblenden</span>
              </button>
              <button className="danger ghost icon-text" data-testid="live-handout-delete" onClick={() => onDeleteHandout(selectedHandout.id)}>
                <Trash2 size={16} />
                <span>Löschen</span>
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function MessageIcon() {
  return <Type size={16} />
}

function OverlayPlacementControls({
  kind,
  value,
  label,
  testIdPrefix,
  onChange
}: {
  kind: PlayerOverlayKind
  value: PlayerOverlayPlacement
  label: string
  testIdPrefix: string
  onChange: (kind: PlayerOverlayKind, patch: Partial<PlayerOverlayPlacement>) => void
}) {
  return (
    <div className="overlay-placement-controls">
      <label>
        <span>{label}-Position</span>
        <select
          value={value.anchor}
          aria-label={`${label}-Position`}
          data-testid={`${testIdPrefix}-position`}
          onChange={(event) => onChange(kind, { anchor: event.target.value as PlayerOverlayPlacement['anchor'] })}
        >
          {overlayAnchorOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>{label}-Ausrichtung</span>
        <select
          value={value.layout}
          aria-label={`${label}-Ausrichtung`}
          data-testid={`${testIdPrefix}-layout`}
          onChange={(event) => onChange(kind, { layout: event.target.value as PlayerOverlayPlacement['layout'] })}
        >
          <option value="single">Einfach</option>
          <option value="mirror-x">Beidseitig links/rechts</option>
          <option value="mirror-y">Beidseitig oben/unten</option>
        </select>
      </label>
    </div>
  )
}

function ToolMenuButton({
  entry,
  selected,
  onTool
}: {
  entry: { id: ToolId; icon: LucideIcon; label: string }
  selected: boolean
  onTool: (tool: ToolId) => void
}) {
  const Icon = entry.icon
  return (
    <button
      role="menuitem"
      className={`tool-menu-button ${selected ? 'active' : ''}`}
      data-testid={`tool-${entry.id}`}
      title={entry.label}
      onClick={() => onTool(entry.id)}
    >
      <Icon size={18} />
      <span>{entry.label}</span>
    </button>
  )
}

function MapCanvas({
  map,
  tool,
  drawColor,
  drawWidth,
  fogBrushRadius,
  onDrawWidth,
  onFogBrushRadius,
  selectedRoomId,
  selectedWallId,
  selectedDrawingId,
  playerViewport,
  onViewportChange,
  onMapPatch,
  onMapUpdate,
  onRoomSelect,
  onWallSelect,
  onDrawingSelect,
  onCancelTool,
  onShortcutBlockChange
}: {
  map: MapScene
  tool: ToolId
  drawColor: string
  drawWidth: number
  fogBrushRadius: number
  onDrawWidth: (width: number) => void
  onFogBrushRadius: (radius: number) => void
  selectedRoomId: string | null
  selectedWallId: string | null
  selectedDrawingId: string | null
  playerViewport: PlayerViewport | null
  onViewportChange: (viewport: PlayerViewport | null) => void
  onMapPatch: (patch: Partial<MapScene>, sync?: boolean) => void
  onMapUpdate: (updater: (map: MapScene) => MapScene, sync?: boolean) => void
  onRoomSelect: (id: string | null) => void
  onWallSelect: (id: string | null) => void
  onDrawingSelect: (id: string | null) => void
  onCancelTool: () => void
  onShortcutBlockChange: (blocked: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const { image, size: imageSize } = useAssetImage(map.imagePath)
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 700 })
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPanning, setIsPanning] = useState<null | { x: number; y: number; ox: number; oy: number }>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [path, setPath] = useState<number[]>([])
  const [roomPoints, setRoomPoints] = useState<Array<{ x: number; y: number }>>([])
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number; y: number } | null>(null)
  const [fogCanvas, setFogCanvas] = useState<HTMLCanvasElement | null>(null)
  const [fogVersion, setFogVersion] = useState(0)
  const [measure, setMeasure] = useState<PlayerMeasure | null>(null)
  const [pointer, setPointer] = useState<PlayerPointer | null>(null)
  const [mapHoverPoint, setMapHoverPoint] = useState<{ x: number; y: number } | null>(null)
  const lastFogPointRef = useRef<{ x: number; y: number } | null>(null)
  const dmFogCanvas = useMemo(
    () => tintFogSource(fogCanvas, fogCanvas?.width ?? 0, fogCanvas?.height ?? 0, '#ff453a', Math.min(0.48, (map.fogOpacity ?? 1) * 0.48)),
    [fogCanvas, fogVersion, map.fogOpacity]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!image || imageSize.width <= 0 || imageSize.height <= 0) return
    if (map.width !== imageSize.width || map.height !== imageSize.height) {
      onMapPatch({ width: imageSize.width, height: imageSize.height }, false)
    }
    const fit = Math.min(canvasSize.width / imageSize.width, canvasSize.height / imageSize.height) * 0.92
    const scale = Number.isFinite(fit) && fit > 0 ? fit : 1
    setTransform({
      scale,
      offsetX: (canvasSize.width - imageSize.width * scale) / 2,
      offsetY: (canvasSize.height - imageSize.height * scale) / 2
    })
  }, [image, imageSize.width, imageSize.height, map.id, canvasSize.width, canvasSize.height])

  useEffect(() => {
    if ((map.width || imageSize.width) <= 0 || (map.height || imageSize.height) <= 0) return
    let cancelled = false
    void createFogCanvas(map.width || imageSize.width, map.height || imageSize.height, map.fogBitmap).then((canvas) => {
      if (!cancelled) {
        setFogCanvas(canvas)
        setFogVersion((value) => value + 1)
      }
    })
    return () => { cancelled = true }
  }, [map.id, map.width, map.height, map.fogBitmap])

  useEffect(() => {
    onShortcutBlockChange(Boolean(isPanning || dragStart || roomPoints.length > 0))
    return () => onShortcutBlockChange(false)
  }, [isPanning, dragStart, roomPoints.length, onShortcutBlockChange])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (shouldIgnoreShortcutEvent(event)) return
      if (event.key === 'Enter' && roomPoints.length >= 3) finishRoom()
      if (event.key === 'Escape') {
        setRoomPoints([])
        setPolygonPreviewPoint(null)
        setPath([])
        setDragStart(null)
        setDragCurrent(null)
        onCancelTool()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roomPoints])

  function stagePoint() {
    const stage = stageRef.current
    const pos = stage?.getPointerPosition()
    if (!pos) return null
    const mapPoint = screenToMap(pos.x, pos.y, transform)
    setMapHoverPoint(mapPoint)
    return mapPoint
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    if (event.evt.ctrlKey && playerViewport) {
      const factor = event.evt.deltaY > 0 ? 0.92 : 1.08
      onViewportChange({
        ...playerViewport,
        w: Math.max(120, Math.min((map.width || imageSize.width || 2000) * 1.5, playerViewport.w * factor)),
        h: Math.max(90, Math.min((map.height || imageSize.height || 2000) * 1.5, playerViewport.h * factor))
      })
      return
    }
    if (event.evt.shiftKey) {
      const point = screenToMap(pointer.x, pointer.y, transform)
      setMapHoverPoint(point)
      const direction = event.evt.deltaY > 0 ? -1 : 1
      if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
        onFogBrushRadius(Math.max(8, Math.min(220, fogBrushRadius + direction * 6)))
        return
      }
      if (tool.startsWith('draw-')) {
        onDrawWidth(Math.max(1, Math.min(8, drawWidth + direction)))
        return
      }
    }
    const before = screenToMap(pointer.x, pointer.y, transform)
    const factor = event.evt.deltaY > 0 ? 0.9 : 1.1
    const scale = Math.max(0.05, Math.min(8, transform.scale * factor))
    setTransform({
      scale,
      offsetX: pointer.x - before.x * scale,
      offsetY: pointer.y - before.y * scale
    })
  }

  function handleMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    const pos = stagePoint()
    if (!pos) return
    if (event.evt.button === 1 || event.evt.button === 2 || tool === 'select') {
      setIsPanning({ x: event.evt.clientX, y: event.evt.clientY, ox: transform.offsetX, oy: transform.offsetY })
      return
    }
    if (tool === 'pointer') {
      const ping = { x: pos.x, y: pos.y }
      setPointer(ping)
      window.mapberry.sendPointer(ping)
      playPingSound()
      setTimeout(() => setPointer(null), 1400)
      return
    }
    if (tool === 'draw-text') {
      const text = window.prompt('Text', '')
      if (text?.trim()) addDrawing({ id: uid(), type: 'text', points: [pos.x, pos.y], color: drawColor, width: drawWidth, text: text.trim(), visibleToPlayers: true })
      return
    }
    if (tool === 'draw-erase') {
      const hit = findDrawingAt(map.drawings, pos, 12 / transform.scale)
      if (hit) {
        onDrawingSelect(hit.id)
        onMapUpdate((scene) => ({ ...scene, drawings: scene.drawings.filter((drawing) => drawing.id !== hit.id), updatedAt: new Date().toISOString() }))
      }
      return
    }
    if (tool === 'room') {
      setRoomPoints((points) => [...points, { x: Math.round(pos.x), y: Math.round(pos.y) }])
      setPolygonPreviewPoint(null)
      return
    }
    setDragStart(pos)
    setDragCurrent(pos)
    if (tool === 'draw-freehand') setPath([pos.x, pos.y])
    if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
      lastFogPointRef.current = pos
      paintFogBrush(pos, pos)
    }
  }

  function handleMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const pos = stagePoint()
    if (!pos) return
    setMapHoverPoint(pos)
    if (isPanning) {
      setTransform((current) => ({
        ...current,
        offsetX: isPanning.ox + event.evt.clientX - isPanning.x,
        offsetY: isPanning.oy + event.evt.clientY - isPanning.y
      }))
      return
    }
    if (tool === 'room' && roomPoints.length > 0) {
      setPolygonPreviewPoint({ x: Math.round(pos.x), y: Math.round(pos.y) })
    }
    if (!dragStart) return
    setDragCurrent(pos)
    if (tool === 'draw-freehand') setPath((points) => [...points, pos.x, pos.y])
    if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
      paintFogBrush(lastFogPointRef.current ?? dragStart, pos)
      lastFogPointRef.current = pos
    }
    if (tool === 'measure-line' || tool === 'measure-circle') {
      const m = buildMeasure(tool, dragStart, pos, map.gridSize, map.ftPerUnit)
      setMeasure(m)
      window.mapberry.sendMeasure(m)
    }
  }

  function handleMouseUp() {
    if (isPanning) {
      setIsPanning(null)
      return
    }
    if (!dragStart || !dragCurrent) return
    if (tool === 'draw-freehand' && path.length >= 4) {
      addDrawing({ id: uid(), type: 'freehand', points: path, color: drawColor, width: drawWidth, visibleToPlayers: true })
    }
    if (tool === 'draw-rect' || tool === 'draw-circle') {
      const type: DrawingType = tool === 'draw-rect' ? 'rect' : 'circle'
      addDrawing({ id: uid(), type, points: [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y], color: drawColor, width: drawWidth, visibleToPlayers: true })
    }
    if (tool === 'fog-rect' || tool === 'fog-cover') {
      applyFog({ mode: tool === 'fog-cover' ? 'cover' : 'reveal', shape: 'rect', points: [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y] }, true)
    }
    if (tool === 'wall' || tool === 'door') {
      if (distance(dragStart, dragCurrent) > 6) {
        const wall: WallRecord = { id: uid(), x1: dragStart.x, y1: dragStart.y, x2: dragCurrent.x, y2: dragCurrent.y, kind: tool === 'door' ? 'door' : 'wall', doorState: 'closed' }
        onMapUpdate((scene) => ({ ...scene, walls: [...scene.walls, wall], updatedAt: new Date().toISOString() }))
        onWallSelect(wall.id)
      }
    }
    if (tool === 'measure-line' || tool === 'measure-circle') window.mapberry.sendMeasure(measure)
    if (tool === 'fog-brush' || tool === 'fog-brush-cover') persistFog()
    lastFogPointRef.current = null
    setDragStart(null)
    setDragCurrent(null)
    setPath([])
  }

  function handleDoubleClick() {
    if (tool === 'room' && roomPoints.length >= 3) finishRoom()
  }

  function finishRoom() {
    if (roomPoints.length < 3) return
    const room: RoomRecord = {
      id: uid(),
      name: `Raum ${map.rooms.length + 1}`,
      polygon: roomPoints,
      visibility: 'hidden',
      color: LEAF,
      notes: ''
    }
    onMapUpdate((scene) => ({ ...scene, rooms: [...scene.rooms, room], updatedAt: new Date().toISOString() }))
    onRoomSelect(room.id)
    setRoomPoints([])
    setPolygonPreviewPoint(null)
  }

  function addDrawing(drawing: DrawingRecord) {
    onMapUpdate((scene) => ({ ...scene, drawings: [...scene.drawings, drawing], updatedAt: new Date().toISOString() }))
    onDrawingSelect(drawing.id)
  }

  function applyFog(op: FogOp, persist: boolean) {
    if (!fogCanvas) return
    applyFogOp(fogCanvas, op)
    setFogVersion((value) => value + 1)
    if (persist) persistFog()
  }

  function paintFogBrush(from: { x: number; y: number }, to: { x: number; y: number }) {
    if (!fogCanvas) return
    const mode = tool === 'fog-brush' ? 'reveal' : 'cover'
    const length = distance(from, to)
    const step = Math.max(2, fogBrushRadius * 0.35)
    const count = Math.max(1, Math.ceil(length / step))
    for (let i = 0; i <= count; i += 1) {
      const t = count === 0 ? 1 : i / count
      applyFogOp(fogCanvas, {
        mode,
        shape: 'circle',
        points: [
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          fogBrushRadius
        ]
      })
    }
    setFogVersion((value) => value + 1)
  }

  function persistFog() {
    if (!fogCanvas) return
    const dataUrl = fogCanvas.toDataURL('image/png')
    onMapPatch({ fogBitmap: dataUrl })
  }

  function revealRoom(room: RoomRecord, mode: 'cover' | 'reveal') {
    applyFog({ mode, shape: 'polygon', points: flattened(room.polygon) }, true)
  }

  const previewPoints = dragStart && dragCurrent ? [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y] : []

  return (
    <div
      ref={containerRef}
      className={`canvas-host ${isPanning ? 'is-panning' : tool === 'select' ? 'is-pan-tool' : 'is-precision-tool'}`}
      data-testid="map-canvas-host"
      data-ping-active={pointer ? 'true' : 'false'}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setMapHoverPoint(null)
          lastFogPointRef.current = null
        }}
        onDblClick={handleDoubleClick}
      >
        <Layer>
          <Group x={transform.offsetX} y={transform.offsetY} scaleX={transform.scale} scaleY={transform.scale}>
            {image && <KonvaImage image={image} width={map.width || imageSize.width} height={map.height || imageSize.height} />}
            <Grid map={map} scale={transform.scale} />
            {map.rooms.map((room) => <RoomShape key={room.id} room={room} selected={room.id === selectedRoomId} scale={transform.scale} onSelect={() => onRoomSelect(room.id)} />)}
            {map.walls.map((wall) => <WallShape key={wall.id} wall={wall} selected={wall.id === selectedWallId} scale={transform.scale} onSelect={() => onWallSelect(wall.id)} />)}
            {map.drawings.map((drawing) => <DrawingShape key={drawing.id} drawing={drawing} selected={drawing.id === selectedDrawingId} scale={transform.scale} onSelect={() => onDrawingSelect(drawing.id)} />)}
            {dmFogCanvas && <KonvaImage key={fogVersion} image={dmFogCanvas} width={dmFogCanvas.width} height={dmFogCanvas.height} listening={false} />}
            {tool === 'draw-freehand' && path.length >= 4 && <Line points={path} stroke={drawColor} strokeWidth={drawingStroke(drawWidth, transform.scale)} lineCap="round" lineJoin="round" listening={false} />}
            {roomPoints.length > 0 && <PolygonDraft points={roomPoints} previewPoint={polygonPreviewPoint} scale={transform.scale} tool={tool} />}
            {previewPoints.length > 0 && <Preview tool={tool} points={previewPoints} color={drawColor} width={drawWidth} scale={transform.scale} />}
            {mapHoverPoint && <ToolCursorPreview point={mapHoverPoint} tool={tool} fogBrushRadius={fogBrushRadius} drawWidth={drawWidth} drawColor={drawColor} scale={transform.scale} />}
            {playerViewport && <PlayerViewportFrame viewport={playerViewport} scale={transform.scale} onChange={onViewportChange} />}
            {pointer && <PingShape pointer={pointer} scale={transform.scale} />}
          </Group>
        </Layer>
      </Stage>
      <div className="canvas-hud">
        <span>{Math.round(transform.scale * 100)}%</span>
        <span>{map.gridType === 'none' ? 'kein Grid' : `${map.gridSize}px / ${map.ftPerUnit}ft`}</span>
      </div>
      <div className="floating-fog">
        <button className="icon-text" data-testid="fog-cover-all" onClick={() => applyFog({ mode: 'cover', shape: 'rect', points: [0, 0, map.width, map.height] }, true)}>
          <EyeOff size={15} />
          <span>Alles verdecken</span>
        </button>
        <button className="icon-text" data-testid="fog-reveal-all" onClick={() => applyFog({ mode: 'reveal', shape: 'rect', points: [0, 0, map.width, map.height] }, true)}>
          <Eye size={15} />
          <span>Alles aufdecken</span>
        </button>
        {selectedRoomId && map.rooms.find((room) => room.id === selectedRoomId) && (
          <>
            <button className="icon-text" onClick={() => revealRoom(map.rooms.find((room) => room.id === selectedRoomId)!, 'reveal')}>
              <Eye size={15} />
              <span>Raum aufdecken</span>
            </button>
            <button className="icon-text" onClick={() => revealRoom(map.rooms.find((room) => room.id === selectedRoomId)!, 'cover')}>
              <EyeOff size={15} />
              <span>Raum verdecken</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Grid({ map, scale }: { map: MapScene; scale: number }) {
  if (map.gridType === 'none' || !map.gridVisible || map.gridSize <= 0) return null
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        const w = map.width || 1
        const h = map.height || 1
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, w, h)
        ctx.clip()
        ctx.strokeStyle = normalizeGridColor(map.gridColor)
        ctx.lineWidth = screenPx(map.gridThickness, scale)
        if (map.gridType === 'square') {
          const firstX = ((map.gridOffsetX % map.gridSize) + map.gridSize) % map.gridSize
          const firstY = ((map.gridOffsetY % map.gridSize) + map.gridSize) % map.gridSize
          for (let x = firstX; x <= w; x += map.gridSize) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
          }
          for (let y = firstY; y <= h; y += map.gridSize) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
          }
        } else {
          const r = map.gridSize / 2
          const dx = r * Math.sqrt(3)
          const dy = r * 1.5
          for (let y = -dy; y < h + dy; y += dy) {
            for (let x = -dx; x < w + dx; x += dx) {
              const cx = x + ((Math.round(y / dy) % 2) * dx) / 2 + map.gridOffsetX
              const cy = y + map.gridOffsetY
              ctx.beginPath()
              for (let i = 0; i < 6; i++) {
                const a = Math.PI / 6 + i * Math.PI / 3
                const px = cx + r * Math.cos(a)
                const py = cy + r * Math.sin(a)
                if (i === 0) ctx.moveTo(px, py)
                else ctx.lineTo(px, py)
              }
              ctx.closePath()
              ctx.stroke()
            }
          }
        }
        ctx.restore()
        ctx.fillStrokeShape(shape)
      }}
    />
  )
}

function PolygonDraft({
  points,
  previewPoint,
  scale,
  tool
}: {
  points: Array<{ x: number; y: number }>
  previewPoint: { x: number; y: number } | null
  scale: number
  tool: ToolId
}) {
  const stroke = GOLD
  const displayPoints = [
    ...points,
    ...(previewPoint ? [previewPoint] : []),
    points[0],
  ]
  return (
    <>
      <Line
        points={flattened(displayPoints)}
        stroke={stroke}
        strokeWidth={screenPx(ROOM_PREVIEW_STROKE, scale)}
        dash={screenDash([4, 4], scale)}
        closed={false}
        listening={false}
      />
      {points.map((point, index) => (
        <Circle
          key={`${point.x}:${point.y}:${index}`}
          x={point.x}
          y={point.y}
          radius={screenPx(index === 0 ? 5 : 4, scale)}
          fill={index === 0 ? stroke : '#ffffff'}
          stroke={stroke}
          strokeWidth={screenPx(1, scale)}
          listening={false}
        />
      ))}
    </>
  )
}

function RoomShape({ room, selected, scale, onSelect }: { room: RoomRecord; selected: boolean; scale: number; onSelect: () => void }) {
  const points = flattened(room.polygon)
  const center = polygonCenter(room.polygon)
  const stroke = selected ? GOLD : room.color
  const fill = room.visibility === 'revealed' ? `${room.color}33` : room.visibility === 'dimmed' ? `${room.color}20` : `${room.color}12`
  return (
    <Group onClick={onSelect}>
      <Line
        points={points}
        closed
        fill={fill}
        stroke={stroke}
        strokeWidth={screenPx(selected ? ROOM_SELECTED_STROKE : ROOM_STROKE, scale)}
        dash={selected ? undefined : screenDash([6, 4], scale)}
        hitStrokeWidth={screenPx(14, scale)}
      />
      <Text
        x={center.x - screenPx(60, scale)}
        y={center.y - screenPx(8, scale)}
        text={room.name}
        fill={stroke}
        fontSize={screenPx(14, scale)}
        fontStyle="bold"
        width={screenPx(120, scale)}
        align="center"
        listening={false}
      />
    </Group>
  )
}

function WallShape({ wall, selected, scale, onSelect }: { wall: WallRecord; selected: boolean; scale: number; onSelect: () => void }) {
  const color = selected ? GOLD : wall.kind === 'door' ? '#d47b1f' : '#f7f1cf'
  return (
    <Line
      points={[wall.x1, wall.y1, wall.x2, wall.y2]}
      stroke={color}
      strokeWidth={screenPx(WALL_STROKE, scale)}
      dash={wall.kind === 'door' && wall.doorState === 'open' ? screenDash([12, 8], scale) : undefined}
      hitStrokeWidth={screenPx(18, scale)}
      lineCap="round"
      onClick={onSelect}
    />
  )
}

function DrawingShape({ drawing, selected, scale, onSelect }: { drawing: DrawingRecord; selected: boolean; scale: number; onSelect: () => void }) {
  const stroke = selected ? GOLD : drawing.color
  const strokeWidth = drawingStroke(drawing.width, scale)
  const hitStrokeWidth = Math.max(screenPx(16, scale), strokeWidth + screenPx(8, scale))
  if (drawing.type === 'freehand') return <Line points={drawing.points} stroke={stroke} strokeWidth={strokeWidth} lineCap="round" lineJoin="round" hitStrokeWidth={hitStrokeWidth} onClick={onSelect} />
  if (drawing.type === 'rect') {
    const rect = rectFromPoints(drawing.points)
    return <Rect {...rect} stroke={stroke} strokeWidth={strokeWidth} hitStrokeWidth={hitStrokeWidth} onClick={onSelect} />
  }
  if (drawing.type === 'circle') {
    const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = drawing.points
    return <Circle x={x1} y={y1} radius={Math.hypot(x2 - x1, y2 - y1)} stroke={stroke} strokeWidth={strokeWidth} hitStrokeWidth={hitStrokeWidth} onClick={onSelect} />
  }
  return <Text x={drawing.points[0] ?? 0} y={drawing.points[1] ?? 0} text={drawing.text ?? ''} fontSize={26} fill={stroke} onClick={onSelect} />
}

function Preview({ tool, points, color, width, scale }: { tool: ToolId; points: number[]; color: string; width: number; scale: number }) {
  const rect = rectFromPoints(points)
  const dash = screenDash([6, 4], scale)
  const drawDash = screenDash([10, 6], scale)
  const drawingPreviewStroke = drawingStroke(width, scale)
  if (tool === 'draw-rect') return <Rect {...rect} stroke={color} strokeWidth={drawingPreviewStroke} dash={drawDash} listening={false} />
  if (tool === 'fog-rect' || tool === 'fog-cover') return <Rect {...rect} stroke={tool === 'fog-cover' ? '#ff453a' : '#34c759'} strokeWidth={screenPx(TOOL_PREVIEW_STROKE, scale)} dash={dash} listening={false} />
  if (tool === 'draw-circle') return <Circle x={points[0]} y={points[1]} radius={Math.hypot(points[2] - points[0], points[3] - points[1])} stroke={color} strokeWidth={drawingPreviewStroke} dash={drawDash} listening={false} />
  if (tool === 'measure-circle') return <Circle x={points[0]} y={points[1]} radius={Math.hypot(points[2] - points[0], points[3] - points[1])} stroke={LEAF} strokeWidth={screenPx(TOOL_PREVIEW_STROKE, scale)} dash={dash} listening={false} />
  if (tool === 'measure-line') return <Line points={points} stroke={GOLD} strokeWidth={screenPx(TOOL_PREVIEW_STROKE, scale)} dash={dash} listening={false} />
  if (tool === 'wall' || tool === 'door') return <Line points={points} stroke={tool === 'door' ? '#d47b1f' : '#f7f1cf'} strokeWidth={screenPx(WALL_STROKE, scale)} dash={screenDash([6, 3], scale)} listening={false} />
  return null
}

function ToolCursorPreview({
  point,
  tool,
  fogBrushRadius,
  drawWidth,
  drawColor,
  scale
}: {
  point: { x: number; y: number }
  tool: ToolId
  fogBrushRadius: number
  drawWidth: number
  drawColor: string
  scale: number
}) {
  if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
    const reveal = tool === 'fog-brush'
    return (
      <Circle
        x={point.x}
        y={point.y}
        radius={fogBrushRadius}
        stroke={reveal ? '#34c759' : '#ff453a'}
        strokeWidth={screenPx(2, scale)}
        dash={screenDash([8, 6], scale)}
        fill={reveal ? 'rgba(52, 199, 89, 0.10)' : 'rgba(255, 69, 58, 0.12)'}
        listening={false}
      />
    )
  }
  if (tool.startsWith('draw-')) {
    return (
      <Circle
        x={point.x}
        y={point.y}
        radius={Math.max(screenPx(10, scale), drawingStroke(drawWidth, scale) * 1.6)}
        stroke={tool === 'draw-erase' ? '#ff453a' : drawColor}
        strokeWidth={screenPx(2, scale)}
        dash={screenDash([6, 4], scale)}
        listening={false}
      />
    )
  }
  return null
}

function PingShape({ pointer, scale }: { pointer: PlayerPointer; scale: number }) {
  return (
    <Group listening={false}>
      <Circle x={pointer.x} y={pointer.y} radius={screenPx(44, scale)} stroke={GOLD} strokeWidth={screenPx(3, scale)} opacity={0.42} />
      <Circle x={pointer.x} y={pointer.y} radius={screenPx(28, scale)} stroke={GOLD} strokeWidth={screenPx(4, scale)} opacity={0.94} />
      <Circle x={pointer.x} y={pointer.y} radius={screenPx(10, scale)} fill="#9b124f" stroke="#f7f1cf" strokeWidth={screenPx(3, scale)} />
      <Text x={pointer.x + screenPx(16, scale)} y={pointer.y - screenPx(10, scale)} text="PING" fill={GOLD} fontSize={screenPx(13, scale)} fontStyle="bold" />
    </Group>
  )
}

function PlayerViewportFrame({ viewport, scale, onChange }: { viewport: PlayerViewport; scale: number; onChange: (viewport: PlayerViewport | null) => void }) {
  return (
    <Group
      x={viewport.cx}
      y={viewport.cy}
      rotation={viewport.rotation}
      draggable
      onDragStart={(event) => {
        if (!event.evt.ctrlKey) event.target.stopDrag()
      }}
      onDragEnd={(event) => {
        if (event.evt.ctrlKey) onChange({ ...viewport, cx: event.target.x(), cy: event.target.y() })
      }}
    >
      <Rect x={-viewport.w / 2} y={-viewport.h / 2} width={viewport.w} height={viewport.h} stroke={GOLD} strokeWidth={screenPx(PLAYER_VIEWPORT_STROKE, scale)} dash={screenDash([14, 8], scale)} fill="rgba(241,189,97,0.08)" />
      <Text x={-viewport.w / 2 + screenPx(14, scale)} y={-viewport.h / 2 + screenPx(12, scale)} text="Spieler" fill={GOLD} fontSize={screenPx(14, scale)} />
    </Group>
  )
}

function MapSidePanel({
  map,
  selectedRoomId,
  selectedWallId,
  selectedDrawingId,
  onMapUpdate,
  onRoomSelect,
  onWallSelect,
  onDrawingSelect
}: {
  map: MapScene
  selectedRoomId: string | null
  selectedWallId: string | null
  selectedDrawingId: string | null
  onMapUpdate: (updater: (map: MapScene) => MapScene, sync?: boolean) => void
  onRoomSelect: (id: string | null) => void
  onWallSelect: (id: string | null) => void
  onDrawingSelect: (id: string | null) => void
}) {
  const selectedRoom = map.rooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedWall = map.walls.find((wall) => wall.id === selectedWallId) ?? null
  const selectedDrawing = map.drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null

  function patchRoom(id: string, patch: Partial<RoomRecord>) {
    onMapUpdate((scene) => ({ ...scene, rooms: scene.rooms.map((room) => room.id === id ? { ...room, ...patch } : room), updatedAt: new Date().toISOString() }))
  }

  function patchWall(id: string, patch: Partial<WallRecord>) {
    onMapUpdate((scene) => ({ ...scene, walls: scene.walls.map((wall) => wall.id === id ? { ...wall, ...patch } : wall), updatedAt: new Date().toISOString() }))
  }

  function patchDrawing(id: string, patch: Partial<DrawingRecord>) {
    onMapUpdate((scene) => ({ ...scene, drawings: scene.drawings.map((drawing) => drawing.id === id ? { ...drawing, ...patch } : drawing), updatedAt: new Date().toISOString() }))
  }

  return (
    <>
      <section>
        <div className="panel-title">Räume</div>
        <div className="stack-list">
          {map.rooms.map((room) => (
            <button key={room.id} className={room.id === selectedRoomId ? 'active' : ''} onClick={() => onRoomSelect(room.id)}>
              <span className="list-row-main"><Hexagon size={15} /><span>{room.name}</span></span><small>{roomVisibilityLabel(room.visibility)}</small>
            </button>
          ))}
        </div>
        {selectedRoom && (
          <div className="detail-card">
            <input value={selectedRoom.name} onChange={(event) => patchRoom(selectedRoom.id, { name: event.target.value })} />
            <select value={selectedRoom.visibility} onChange={(event) => patchRoom(selectedRoom.id, { visibility: event.target.value as RoomRecord['visibility'] })}>
              <option value="hidden">Versteckt</option>
              <option value="dimmed">Angedeutet</option>
              <option value="revealed">Sichtbar</option>
            </select>
            <textarea value={selectedRoom.notes} onChange={(event) => patchRoom(selectedRoom.id, { notes: event.target.value })} placeholder="Notiz" />
            <button className="danger ghost icon-text" onClick={() => onMapUpdate((scene) => ({ ...scene, rooms: scene.rooms.filter((room) => room.id !== selectedRoom.id) }))}>
              <Trash2 size={16} />
              <span>Raum löschen</span>
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="panel-title">Wände</div>
        <div className="stack-list compact">
          {map.walls.map((wall, index) => {
            const WallIcon = wall.kind === 'door' ? DoorOpen : BrickWall
            return (
              <button key={wall.id} className={wall.id === selectedWallId ? 'active' : ''} onClick={() => onWallSelect(wall.id)}>
                <span className="list-row-main"><WallIcon size={15} /><span>{wallKindLabel(wall.kind)} {index + 1}</span></span>
              </button>
            )
          })}
        </div>
        {selectedWall && (
          <div className="detail-card">
            <select value={selectedWall.kind} onChange={(event) => patchWall(selectedWall.id, { kind: event.target.value as WallRecord['kind'] })}>
              <option value="wall">Wand</option>
              <option value="door">Tür</option>
              <option value="window">Fenster</option>
            </select>
            <select value={selectedWall.doorState} onChange={(event) => patchWall(selectedWall.id, { doorState: event.target.value as WallRecord['doorState'] })}>
              <option value="closed">Geschlossen</option>
              <option value="open">Offen</option>
              <option value="locked">Verschlossen</option>
            </select>
            <button className="danger ghost icon-text" onClick={() => onMapUpdate((scene) => ({ ...scene, walls: scene.walls.filter((wall) => wall.id !== selectedWall.id) }))}>
              <Trash2 size={16} />
              <span>Wand löschen</span>
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="panel-title">Zeichnungen</div>
        <div className="stack-list compact">
          {map.drawings.map((drawing, index) => (
            <button key={drawing.id} className={drawing.id === selectedDrawingId ? 'active' : ''} onClick={() => onDrawingSelect(drawing.id)}>
              <span className="list-row-main"><Paintbrush size={15} /><span>{drawingTypeLabel(drawing.type)} {index + 1}</span></span>
            </button>
          ))}
        </div>
        {selectedDrawing && (
          <div className="detail-card">
            <label className="check"><input type="checkbox" checked={selectedDrawing.visibleToPlayers} onChange={(event) => patchDrawing(selectedDrawing.id, { visibleToPlayers: event.target.checked })} /> Spieler sichtbar</label>
            <button className="danger ghost icon-text" onClick={() => onMapUpdate((scene) => ({ ...scene, drawings: scene.drawings.filter((drawing) => drawing.id !== selectedDrawing.id) }))}>
              <Trash2 size={16} />
              <span>Zeichnung löschen</span>
            </button>
          </div>
        )}
      </section>
    </>
  )
}

function findDrawingAt(drawings: DrawingRecord[], p: { x: number; y: number }, tolerance: number) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const drawing = drawings[i]
    if (drawing.type === 'text') {
      const x = drawing.points[0] ?? 0
      const y = drawing.points[1] ?? 0
      if (p.x >= x - tolerance && p.x <= x + 220 && p.y >= y - tolerance && p.y <= y + 40) return drawing
    } else if (drawing.type === 'rect') {
      const r = rectFromPoints(drawing.points)
      if (p.x >= r.x - tolerance && p.x <= r.x + r.width + tolerance && p.y >= r.y - tolerance && p.y <= r.y + r.height + tolerance) return drawing
    } else if (drawing.type === 'circle') {
      const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = drawing.points
      const radius = Math.hypot(x2 - x1, y2 - y1)
      if (Math.abs(distance({ x: x1, y: y1 }, p) - radius) <= tolerance) return drawing
    } else {
      for (let j = 0; j < drawing.points.length - 3; j += 2) {
        const a = { x: drawing.points[j], y: drawing.points[j + 1] }
        const b = { x: drawing.points[j + 2], y: drawing.points[j + 3] }
        if (pointToSegmentDistance(p, a, b) <= tolerance) return drawing
      }
    }
  }
  return null
}

function pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

function buildMeasure(tool: ToolId, start: { x: number; y: number }, end: { x: number; y: number }, gridSize: number, ftPerUnit: number): PlayerMeasure {
  const px = distance(start, end)
  return {
    type: tool === 'measure-circle' ? 'circle' : 'line',
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
    distance: Math.round((px / Math.max(1, gridSize)) * ftPerUnit)
  }
}

function timerRemainingSeconds(timer: PlayerTimerState, now: number) {
  if (!timer.running || !timer.startedAt) return Math.max(0, Math.round(timer.remainingSeconds))
  return Math.max(0, Math.round(timer.remainingSeconds - (now - timer.startedAt) / 1000))
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0')
  const rest = (safe % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

function sendFullSync(map: MapScene | null, blackout: boolean, viewport: PlayerViewport | null, overlay: PlayerOverlayState) {
  window.mapberry?.sendPlayerSync({
    map,
    blackout,
    viewport,
    overlay,
    mode: blackout ? 'blackout' : map ? 'map' : 'idle'
  })
}

function toolLabel(tool: ToolId) {
  return findTool(tool)?.label ?? tool
}

function normalizedShortcutKey(event: KeyboardEvent) {
  return event.key.toLowerCase()
}

function isPlusKey(event: KeyboardEvent) {
  return event.key === '+' || event.key === '=' || event.code === 'NumpadAdd'
}

function isMinusKey(event: KeyboardEvent) {
  return event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract'
}

function shouldIgnoreShortcutEvent(event: KeyboardEvent) {
  if (event.isComposing) return true
  const target = event.target as HTMLElement | null
  if (!target) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
}

function playPingSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const gain = context.createGain()
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.08)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.24)
    window.setTimeout(() => void context.close(), 320)
  } catch {
    // The visual ping still carries the signal when audio output is unavailable.
  }
}

function getRendererPlatform(): 'darwin' | 'win32' | 'linux' {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('win')) return 'win32'
  return 'linux'
}

function roomVisibilityLabel(visibility: RoomRecord['visibility']) {
  if (visibility === 'revealed') return 'Sichtbar'
  if (visibility === 'dimmed') return 'Angedeutet'
  return 'Versteckt'
}

function wallKindLabel(kind: WallRecord['kind']) {
  if (kind === 'door') return 'Tür'
  if (kind === 'window') return 'Fenster'
  return 'Wand'
}

function drawingTypeLabel(type: DrawingType) {
  if (type === 'freehand') return 'Freihand'
  if (type === 'rect') return 'Rechteck'
  if (type === 'circle') return 'Kreis'
  return 'Text'
}

function gridOffsetLimit(gridSize: number) {
  return Math.max(8, Math.min(400, Math.round(gridSize) || 50))
}

function clampGridOffset(offset: number, gridSize: number) {
  const limit = gridOffsetLimit(gridSize)
  return Math.max(-limit, Math.min(limit, Math.round(offset || 0)))
}

function formatPx(value: number) {
  return `${value > 0 ? '+' : ''}${value}px`
}

function overlayAnchorOptions(): Array<{ value: PlayerOverlayPlacement['anchor']; label: string }> {
  return [
    { value: 'center', label: 'Mitte' },
    { value: 'top', label: 'Oben mittig' },
    { value: 'bottom', label: 'Unten mittig' },
    { value: 'left', label: 'Links mittig' },
    { value: 'right', label: 'Rechts mittig' },
    { value: 'top-left', label: 'Oben links' },
    { value: 'top-right', label: 'Oben rechts' },
    { value: 'bottom-left', label: 'Unten links' },
    { value: 'bottom-right', label: 'Unten rechts' }
  ]
}

function findTool(tool: ToolId) {
  for (const group of TOOL_GROUPS) {
    const found = group.tools.find((entry) => entry.id === tool)
    if (found) return found
  }
  return null
}

function rotationOptions(c: typeof COPY.de) {
  return [
    { value: 0, label: c.noRotation },
    { value: 90, label: c.rotate90 },
    { value: 180, label: c.rotate180 },
    { value: 270, label: c.rotate270 }
  ]
}
