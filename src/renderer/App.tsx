import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  Bell,
  BrickWall,
  CircleDashed,
  Clock3,
  Contrast,
  Database,
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
  Pentagon,
  Play,
  Plus,
  RectangleHorizontal,
  RefreshCcw,
  RotateCw,
  Ruler,
  ScanLine,
  Send,
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
import type { HandoutRecord, PlayerNoticeTone, PlayerOverlayState, PlayerTimerState } from '../shared/mapberry'
import { EMPTY_PLAYER_OVERLAY, gridColorLabel, isGridBlack, nextGridColor, normalizeGridColor } from '../shared/mapberry'
import { useAssetImage } from './lib/image'
import { applyFogOp, createFogCanvas, type FogOp } from './lib/fog'
import { distance, flattened, polygonCenter, rectFromPoints, screenToMap, uid } from './lib/mapMath'
import './styles.css'

const DEFAULT_LIBRARY: MapBerryLibrary = { version: 1, maps: [], activeMapId: null }
const LEAF = '#7fb20d'
const GOLD = '#f1bd61'
const DEFAULT_DRAW_COLOR = '#111111'

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
    { id: 'fog-cover', icon: Square, label: 'Rechteck zu' },
    { id: 'fog-polygon', icon: Pentagon, label: 'Polygon auf' }
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
  const [drawWidth, setDrawWidth] = useState(4)
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
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenToolGroup(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleImportMap() {
    const map = await window.mapberry.importMap()
    if (!map) return
    commit({ version: 1, maps: [...library.maps, map], activeMapId: map.id })
  }

  async function handleDeleteMap(id: string) {
    const map = library.maps.find((candidate) => candidate.id === id)
    if (!map) return
    const ok = await window.mapberry.confirm(`Karte "${map.name}" löschen?`, 'Nebel, Räume, Wände und Zeichnungen dieser Karte werden aus MapBerry entfernt.')
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

  if (!ready) {
    return <div className="splash"><img src={logoUrl} alt="" /><span>MapBerry lädt...</span></div>
  }

  const ActiveToolIcon = findTool(tool)?.icon ?? MousePointer2

  return (
    <div className="app-shell" data-testid="dm-app">
      <header className="titlebar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <div>
            <strong>MapBerry</strong>
            <span>{activeMap ? activeMap.name : 'Kartenarbeitsplatz'}</span>
          </div>
        </div>
        <div className="window-actions">
          <button className="icon-only" onClick={() => void window.mapberry.revealData()} title="Datenordner öffnen" aria-label="Datenordner öffnen">
            <Database size={18} />
          </button>
        </div>
      </header>

      <div className="topbar">
        <button className="primary icon-text" data-testid="import-map" onClick={handleImportMap}>
          <Upload size={18} />
          <span>Karte importieren</span>
        </button>
        <button className={`icon-text ${playerOpen ? 'active' : ''}`} onClick={togglePlayerWindow}>
          <MonitorUp size={18} />
          <span>{playerOpen ? 'Spielerfenster an' : 'Spielerfenster'}</span>
        </button>
        <button className={`icon-text ${blackout ? 'danger active' : 'danger'}`} onClick={() => setBlackout((value) => !value)}>
          <EyeOff size={18} />
          <span>Blackout</span>
        </button>
        <button className={`icon-text ${playerViewport ? 'active gold' : ''}`} onClick={toggleViewport}>
          <Focus size={18} />
          <span>Spielerrahmen</span>
        </button>
        {playerViewport && (
          <>
            <button className="icon-only" aria-label="Rahmen kleiner" title="Rahmen kleiner" onClick={() => setPlayerViewport((v) => v ? { ...v, w: v.w * 0.9, h: v.h * 0.9 } : v)}>
              <Minus size={18} />
            </button>
            <button className="icon-only" aria-label="Rahmen größer" title="Rahmen größer" onClick={() => setPlayerViewport((v) => v ? { ...v, w: v.w * 1.1, h: v.h * 1.1 } : v)}>
              <Plus size={18} />
            </button>
            <button className="icon-only" aria-label="Rahmen drehen" title="Rahmen drehen" onClick={() => setPlayerViewport((v) => v ? { ...v, rotation: (v.rotation + 90) % 360 } : v)}>
              <RotateCw size={18} />
            </button>
          </>
        )}
        <div className="spacer" />
        <select
          title="Spieler-Monitor"
          onChange={(event) => void window.mapberry.setPlayerMonitor(Number(event.target.value))}
          defaultValue=""
        >
          <option value="" disabled>Monitor</option>
          {monitors.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.label}</option>)}
        </select>
      </div>

      <main className="workspace">
        <aside className="panel left-panel">
          <section>
            <div className="panel-title">Karten</div>
            <div className="map-list">
              {library.maps.map((map) => (
                <button
                  key={map.id}
                  className={`map-row ${map.id === library.activeMapId ? 'active' : ''}`}
                  onClick={() => commit({ ...library, activeMapId: map.id })}
                >
                  <span className="map-row-main"><MapIcon size={16} /><span>{map.name}</span></span>
                  <small>{map.gridType === 'none' ? 'kein Grid' : `${map.gridSize}px`}</small>
                </button>
              ))}
            </div>
          </section>

          {activeMap && (
            <section>
              <div className="panel-title">Grid</div>
              <label>Name<input value={activeMap.name} onChange={(event) => patchActiveMap({ name: event.target.value })} /></label>
              <div className="segmented">
                <button className={activeMap.gridType === 'square' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'square' })}>
                  <Grid3X3 size={16} />
                  <span>Quadrat</span>
                </button>
                <button className={activeMap.gridType === 'hex' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'hex' })}>
                  <Hexagon size={16} />
                  <span>Hex</span>
                </button>
                <button className={activeMap.gridType === 'none' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'none' })}>
                  <View size={16} />
                  <span>Aus</span>
                </button>
              </div>
              <label>ft pro Feld<input type="number" min="0.5" max="500" step="0.5" value={activeMap.ftPerUnit} onChange={(event) => patchActiveMap({ ftPerUnit: Number(event.target.value) || 5 })} /></label>
              <label>Dicke<input type="range" min="0.25" max="5" step="0.25" value={activeMap.gridThickness} onChange={(event) => patchActiveMap({ gridThickness: Number(event.target.value) })} /></label>
              <label className="check"><input type="checkbox" checked={activeMap.gridVisible} onChange={(event) => patchActiveMap({ gridVisible: event.target.checked })} /> Grid sichtbar</label>
              <label>DM-Ansicht
                <select value={activeMap.rotation} onChange={(event) => patchActiveMap({ rotation: Number(event.target.value) })}>
                  {rotationOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>Spieleransicht
                <select value={activeMap.rotationPlayer} onChange={(event) => patchActiveMap({ rotationPlayer: Number(event.target.value) })}>
                  {rotationOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <details className="danger-zone">
                <summary>Kartenoptionen</summary>
                <button className="danger ghost icon-text" onClick={() => handleDeleteMap(activeMap.id)}>
                  <Trash2 size={17} />
                  <span>Karte löschen</span>
                </button>
              </details>
            </section>
          )}
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
                selectedRoomId={selectedRoomId}
                selectedWallId={selectedWallId}
                selectedDrawingId={selectedDrawingId}
                playerViewport={playerViewport}
                onViewportChange={setPlayerViewport}
                onMapPatch={patchActiveMap}
                onMapUpdate={updateActiveMap}
                onRoomSelect={setSelectedRoomId}
                onWallSelect={setSelectedWallId}
                onDrawingSelect={setSelectedDrawingId}
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
                <span>Erste Karte importieren</span>
              </button>
            </div>
          )}
        </section>

        <aside className="panel right-panel">
          <section>
            <div className="panel-title">Werkzeug</div>
            <div className="tool-readout">
              <ActiveToolIcon size={21} />
              <strong>{toolLabel(tool)}</strong>
            </div>
            <label>Nebel-Pinsel<input type="range" min="8" max="220" value={fogBrushRadius} onChange={(event) => setFogBrushRadius(Number(event.target.value))} /></label>
          </section>
          {activeMap && (
            <MapSidePanel
              map={activeMap}
              selectedRoomId={selectedRoomId}
              selectedWallId={selectedWallId}
              selectedDrawingId={selectedDrawingId}
              onMapUpdate={updateActiveMap}
              onRoomSelect={setSelectedRoomId}
              onWallSelect={setSelectedWallId}
              onDrawingSelect={setSelectedDrawingId}
            />
          )}
        </aside>
      </main>
    </div>
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
          max="18"
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
  onClearTimer
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
}) {
  const selectedHandout = map.handouts.find((handout) => handout.id === selectedHandoutId) ?? null
  const timer = overlay.timer
  const remaining = timer ? timerRemainingSeconds(timer, clockNow) : null
  const canSendNotice = noticeBody.trim().length > 0

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
  selectedRoomId,
  selectedWallId,
  selectedDrawingId,
  playerViewport,
  onViewportChange,
  onMapPatch,
  onMapUpdate,
  onRoomSelect,
  onWallSelect,
  onDrawingSelect
}: {
  map: MapScene
  tool: ToolId
  drawColor: string
  drawWidth: number
  fogBrushRadius: number
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
  const [fogCanvas, setFogCanvas] = useState<HTMLCanvasElement | null>(null)
  const [fogVersion, setFogVersion] = useState(0)
  const [measure, setMeasure] = useState<PlayerMeasure | null>(null)
  const [pointer, setPointer] = useState<PlayerPointer | null>(null)

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
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Enter' && roomPoints.length >= 3) finishRoom()
      if (event.key === 'Escape') {
        setRoomPoints([])
        setPath([])
        setDragStart(null)
        setDragCurrent(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roomPoints])

  function stagePoint() {
    const stage = stageRef.current
    const pos = stage?.getPointerPosition()
    if (!pos) return null
    return screenToMap(pos.x, pos.y, transform)
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
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
      setTimeout(() => setPointer(null), 900)
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
    if (tool === 'room' || tool === 'fog-polygon') {
      setRoomPoints((points) => [...points, pos])
      return
    }
    setDragStart(pos)
    setDragCurrent(pos)
    if (tool === 'draw-freehand') setPath([pos.x, pos.y])
    if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
      applyFog({ mode: tool === 'fog-brush' ? 'reveal' : 'cover', shape: 'circle', points: [pos.x, pos.y, fogBrushRadius] }, false)
    }
  }

  function handleMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const pos = stagePoint()
    if (!pos) return
    if (isPanning) {
      setTransform((current) => ({
        ...current,
        offsetX: isPanning.ox + event.evt.clientX - isPanning.x,
        offsetY: isPanning.oy + event.evt.clientY - isPanning.y
      }))
      return
    }
    if (!dragStart) return
    setDragCurrent(pos)
    if (tool === 'draw-freehand') setPath((points) => [...points, pos.x, pos.y])
    if (tool === 'fog-brush' || tool === 'fog-brush-cover') {
      applyFog({ mode: tool === 'fog-brush' ? 'reveal' : 'cover', shape: 'circle', points: [pos.x, pos.y, fogBrushRadius] }, false)
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
    setDragStart(null)
    setDragCurrent(null)
    setPath([])
  }

  function handleDoubleClick() {
    if (tool === 'room' && roomPoints.length >= 3) finishRoom()
    if (tool === 'fog-polygon' && roomPoints.length >= 3) {
      applyFog({ mode: 'reveal', shape: 'polygon', points: flattened(roomPoints) }, true)
      setRoomPoints([])
    }
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
        onDblClick={handleDoubleClick}
      >
        <Layer>
          <Group x={transform.offsetX} y={transform.offsetY} scaleX={transform.scale} scaleY={transform.scale}>
            {image && <KonvaImage image={image} width={map.width || imageSize.width} height={map.height || imageSize.height} />}
            <Grid map={map} />
            {map.rooms.map((room) => <RoomShape key={room.id} room={room} selected={room.id === selectedRoomId} onSelect={() => onRoomSelect(room.id)} />)}
            {map.walls.map((wall) => <WallShape key={wall.id} wall={wall} selected={wall.id === selectedWallId} onSelect={() => onWallSelect(wall.id)} />)}
            {map.drawings.map((drawing) => <DrawingShape key={drawing.id} drawing={drawing} selected={drawing.id === selectedDrawingId} onSelect={() => onDrawingSelect(drawing.id)} />)}
            {fogCanvas && <KonvaImage key={fogVersion} image={fogCanvas} width={fogCanvas.width} height={fogCanvas.height} opacity={0.48} listening={false} />}
            {roomPoints.length > 0 && <Line points={flattened(roomPoints)} stroke={LEAF} strokeWidth={3 / transform.scale} dash={[12 / transform.scale, 8 / transform.scale]} closed={false} />}
            {previewPoints.length > 0 && <Preview tool={tool} points={previewPoints} color={drawColor} width={drawWidth} />}
            {playerViewport && <PlayerViewportFrame viewport={playerViewport} onChange={onViewportChange} />}
            {pointer && <Circle x={pointer.x} y={pointer.y} radius={28 / transform.scale} stroke={GOLD} strokeWidth={4 / transform.scale} />}
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

function Grid({ map }: { map: MapScene }) {
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
        ctx.lineWidth = map.gridThickness
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

function RoomShape({ room, selected, onSelect }: { room: RoomRecord; selected: boolean; onSelect: () => void }) {
  const points = flattened(room.polygon)
  const center = polygonCenter(room.polygon)
  const stroke = selected ? GOLD : room.color
  const fill = room.visibility === 'revealed' ? `${room.color}33` : room.visibility === 'dimmed' ? `${room.color}20` : `${room.color}12`
  return (
    <Group onClick={onSelect}>
      <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={selected ? 4 : 2} />
      <Text x={center.x - 46} y={center.y - 10} text={room.name} fill="#fff1c8" fontSize={18} width={92} align="center" listening={false} />
    </Group>
  )
}

function WallShape({ wall, selected, onSelect }: { wall: WallRecord; selected: boolean; onSelect: () => void }) {
  const color = selected ? GOLD : wall.kind === 'door' ? '#d47b1f' : '#f7f1cf'
  return (
    <Line
      points={[wall.x1, wall.y1, wall.x2, wall.y2]}
      stroke={color}
      strokeWidth={wall.kind === 'door' ? 7 : 4}
      dash={wall.kind === 'door' && wall.doorState === 'open' ? [12, 8] : undefined}
      hitStrokeWidth={18}
      lineCap="round"
      onClick={onSelect}
    />
  )
}

function DrawingShape({ drawing, selected, onSelect }: { drawing: DrawingRecord; selected: boolean; onSelect: () => void }) {
  const stroke = selected ? GOLD : drawing.color
  if (drawing.type === 'freehand') return <Line points={drawing.points} stroke={stroke} strokeWidth={drawing.width} lineCap="round" lineJoin="round" hitStrokeWidth={16} onClick={onSelect} />
  if (drawing.type === 'rect') {
    const rect = rectFromPoints(drawing.points)
    return <Rect {...rect} stroke={stroke} strokeWidth={drawing.width} onClick={onSelect} />
  }
  if (drawing.type === 'circle') {
    const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = drawing.points
    return <Circle x={x1} y={y1} radius={Math.hypot(x2 - x1, y2 - y1)} stroke={stroke} strokeWidth={drawing.width} onClick={onSelect} />
  }
  return <Text x={drawing.points[0] ?? 0} y={drawing.points[1] ?? 0} text={drawing.text ?? ''} fontSize={26} fill={stroke} onClick={onSelect} />
}

function Preview({ tool, points, color, width }: { tool: ToolId; points: number[]; color: string; width: number }) {
  const rect = rectFromPoints(points)
  if (tool === 'draw-rect' || tool === 'fog-rect' || tool === 'fog-cover') return <Rect {...rect} stroke={color} strokeWidth={width} dash={[10, 6]} listening={false} />
  if (tool === 'draw-circle' || tool === 'measure-circle') return <Circle x={points[0]} y={points[1]} radius={Math.hypot(points[2] - points[0], points[3] - points[1])} stroke={color} strokeWidth={width} dash={[10, 6]} listening={false} />
  if (tool === 'wall' || tool === 'door' || tool === 'measure-line') return <Line points={points} stroke={color} strokeWidth={width} dash={[10, 6]} listening={false} />
  return null
}

function PlayerViewportFrame({ viewport, onChange }: { viewport: PlayerViewport; onChange: (viewport: PlayerViewport | null) => void }) {
  return (
    <Group x={viewport.cx} y={viewport.cy} rotation={viewport.rotation} draggable onDragEnd={(event) => onChange({ ...viewport, cx: event.target.x(), cy: event.target.y() })}>
      <Rect x={-viewport.w / 2} y={-viewport.h / 2} width={viewport.w} height={viewport.h} stroke={GOLD} strokeWidth={5} dash={[18, 10]} fill="rgba(241,189,97,0.08)" />
      <Text x={-viewport.w / 2 + 14} y={-viewport.h / 2 + 12} text="Spieler" fill={GOLD} fontSize={22} />
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

function findTool(tool: ToolId) {
  for (const group of TOOL_GROUPS) {
    const found = group.tools.find((entry) => entry.id === tool)
    if (found) return found
  }
  return null
}

function rotationOptions() {
  return [
    { value: 0, label: 'Keine Rotation' },
    { value: 90, label: '90 Grad im Uhrzeigersinn' },
    { value: 180, label: '180 Grad' },
    { value: 270, label: '270 Grad im Uhrzeigersinn' }
  ]
}
