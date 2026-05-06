import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  BrickWall,
  CircleDashed,
  Contrast,
  Database,
  DoorOpen,
  Eraser,
  Eye,
  EyeOff,
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
  Pentagon,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Ruler,
  ScanLine,
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
import { gridColorLabel, isGridBlack, nextGridColor, normalizeGridColor } from '../shared/mapberry'
import { useAssetImage } from './lib/image'
import { applyFogOp, createFogCanvas, type FogOp } from './lib/fog'
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
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem('mapberry-locale') === 'en' ? 'en' : 'de')
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem('mapberry-theme') === 'light' ? 'light' : 'dark')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const latestSyncRef = useRef<{ map: MapScene | null; blackout: boolean; viewport: PlayerViewport | null }>({
    map: null,
    blackout: false,
    viewport: null
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
      sendFullSync(nextMap, blackout, playerViewport)
    }
  }, [blackout, playerViewport])

  const updateActiveMap = useCallback((updater: (map: MapScene) => MapScene, sync = true) => {
    setLibrary((prev) => {
      const maps = prev.maps.map((map) => map.id === prev.activeMapId ? updater(map) : map)
      const next = { ...prev, maps }
      void window.mapberry.saveLibrary(next)
      if (sync) {
        const nextMap = maps.find((map) => map.id === prev.activeMapId) ?? null
        sendFullSync(nextMap, blackout, playerViewport)
      }
      return next
    })
  }, [blackout, playerViewport])

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
    latestSyncRef.current = { map: activeMap, blackout, viewport: playerViewport }
  }, [activeMap, blackout, playerViewport])

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
      sendFullSync(latest.map, latest.blackout, latest.viewport)
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
    sendFullSync(activeMap, blackout, playerViewport)
  }, [activeMap?.id, blackout, playerViewport])

  useEffect(() => {
    window.mapberry.sendPlayerViewport(playerViewport)
  }, [playerViewport])

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
    setTimeout(() => sendFullSync(activeMap, blackout, playerViewport), 400)
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
          <button className="icon-only" onClick={() => void window.mapberry.revealData()} title={c.dataFolder} aria-label={c.dataFolder}>
            <Database size={18} />
          </button>
        </div>
      </header>

      <div className="topbar">
        <button className="primary icon-text" data-testid="import-map" onClick={handleImportMap}>
          <Upload size={18} />
          <span>{c.importMap}</span>
        </button>
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

          {activeMap && (
            <section>
              <div className="panel-title">{c.grid}</div>
              <label>{c.name}<input value={activeMap.name} onChange={(event) => patchActiveMap({ name: event.target.value })} /></label>
              <div className="segmented">
                <button className={activeMap.gridType === 'square' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'square' })}>
                  <Grid3X3 size={16} />
                  <span>{c.square}</span>
                </button>
                <button className={activeMap.gridType === 'hex' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'hex' })}>
                  <Hexagon size={16} />
                  <span>{c.hex}</span>
                </button>
                <button className={activeMap.gridType === 'none' ? 'active' : ''} onClick={() => patchActiveMap({ gridType: 'none' })}>
                  <View size={16} />
                  <span>{c.off}</span>
                </button>
              </div>
              <label>{c.feetPerCell}<input type="number" min="0.5" max="500" step="0.5" value={activeMap.ftPerUnit} onChange={(event) => patchActiveMap({ ftPerUnit: Number(event.target.value) || 5 })} /></label>
              <label>{c.thickness}<input type="range" min="0.25" max="5" step="0.25" value={activeMap.gridThickness} onChange={(event) => patchActiveMap({ gridThickness: Number(event.target.value) })} /></label>
              <label className="check"><input type="checkbox" checked={activeMap.gridVisible} onChange={(event) => patchActiveMap({ gridVisible: event.target.checked })} /> {c.gridVisible}</label>
              <label>{c.dmView}
                <select value={activeMap.rotation} onChange={(event) => patchActiveMap({ rotation: Number(event.target.value) })}>
                  {rotationOptions(c).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>{c.playerView}
                <select value={activeMap.rotationPlayer} onChange={(event) => patchActiveMap({ rotationPlayer: Number(event.target.value) })}>
                  {rotationOptions(c).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <details className="danger-zone">
                <summary>{c.mapOptions}</summary>
                <button className="danger ghost icon-text" onClick={() => handleDeleteMap(activeMap.id)}>
                  <Trash2 size={17} />
                  <span>{c.deleteMap}</span>
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
                onRoomSelect={selectRoom}
                onWallSelect={selectWall}
                onDrawingSelect={selectDrawing}
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
          <section>
            <div className="panel-title">{c.tool}</div>
            <div className="tool-readout">
              <ActiveToolIcon size={21} />
              <strong>{toolLabel(tool)}</strong>
            </div>
            <label>{c.fogBrush}<input type="range" min="8" max="220" value={fogBrushRadius} onChange={(event) => setFogBrushRadius(Number(event.target.value))} /></label>
          </section>
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
  onTool: (tool: ToolId) => void
}) {
  const gridOpen = openGroup === 'grid'
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
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number; y: number } | null>(null)
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
        setPolygonPreviewPoint(null)
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
      setRoomPoints((points) => [...points, { x: Math.round(pos.x), y: Math.round(pos.y) }])
      setPolygonPreviewPoint(null)
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
    if ((tool === 'room' || tool === 'fog-polygon') && roomPoints.length > 0) {
      setPolygonPreviewPoint({ x: Math.round(pos.x), y: Math.round(pos.y) })
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
      setPolygonPreviewPoint(null)
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
            <Grid map={map} scale={transform.scale} />
            {map.rooms.map((room) => <RoomShape key={room.id} room={room} selected={room.id === selectedRoomId} scale={transform.scale} onSelect={() => onRoomSelect(room.id)} />)}
            {map.walls.map((wall) => <WallShape key={wall.id} wall={wall} selected={wall.id === selectedWallId} scale={transform.scale} onSelect={() => onWallSelect(wall.id)} />)}
            {map.drawings.map((drawing) => <DrawingShape key={drawing.id} drawing={drawing} selected={drawing.id === selectedDrawingId} scale={transform.scale} onSelect={() => onDrawingSelect(drawing.id)} />)}
            {fogCanvas && <KonvaImage key={fogVersion} image={fogCanvas} width={fogCanvas.width} height={fogCanvas.height} opacity={0.48} listening={false} />}
            {tool === 'draw-freehand' && path.length >= 4 && <Line points={path} stroke={drawColor} strokeWidth={drawingStroke(drawWidth, transform.scale)} lineCap="round" lineJoin="round" listening={false} />}
            {roomPoints.length > 0 && <PolygonDraft points={roomPoints} previewPoint={polygonPreviewPoint} scale={transform.scale} tool={tool} />}
            {previewPoints.length > 0 && <Preview tool={tool} points={previewPoints} color={drawColor} width={drawWidth} scale={transform.scale} />}
            {playerViewport && <PlayerViewportFrame viewport={playerViewport} scale={transform.scale} onChange={onViewportChange} />}
            {pointer && <Circle x={pointer.x} y={pointer.y} radius={screenPx(28, transform.scale)} stroke={GOLD} strokeWidth={screenPx(4, transform.scale)} />}
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
  const stroke = tool === 'fog-polygon' ? '#34c759' : GOLD
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

function PlayerViewportFrame({ viewport, scale, onChange }: { viewport: PlayerViewport; scale: number; onChange: (viewport: PlayerViewport | null) => void }) {
  return (
    <Group x={viewport.cx} y={viewport.cy} rotation={viewport.rotation} draggable onDragEnd={(event) => onChange({ ...viewport, cx: event.target.x(), cy: event.target.y() })}>
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

function sendFullSync(map: MapScene | null, blackout: boolean, viewport: PlayerViewport | null) {
  window.mapberry?.sendPlayerSync({
    map,
    blackout,
    viewport,
    mode: blackout ? 'blackout' : map ? 'map' : 'idle'
  })
}

function toolLabel(tool: ToolId) {
  return findTool(tool)?.label ?? tool
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
