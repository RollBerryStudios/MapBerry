export type GridType = 'none' | 'square' | 'hex'
export type DrawingType = 'freehand' | 'rect' | 'circle' | 'text'

export const GRID_WHITE = '#ffffff'
export const GRID_BLACK = '#000000'

export function isGridBlack(color: string | null | undefined): boolean {
  const value = (color ?? '').trim().toLowerCase().replace(/\s+/g, '')
  return value === GRID_BLACK || value === '#000' || value === 'black' || value.startsWith('rgb(0,0,0') || value.startsWith('rgba(0,0,0')
}

export function normalizeGridColor(color: unknown): string {
  return typeof color === 'string' && isGridBlack(color) ? GRID_BLACK : GRID_WHITE
}

export function nextGridColor(color: string | null | undefined): string {
  return isGridBlack(color) ? GRID_WHITE : GRID_BLACK
}

export function gridColorLabel(color: string | null | undefined): string {
  return isGridBlack(color) ? 'Schwarz' : 'Weiß'
}

export type ToolId =
  | 'select'
  | 'pointer'
  | 'measure-line'
  | 'measure-circle'
  | 'fog-brush'
  | 'fog-brush-cover'
  | 'fog-rect'
  | 'fog-cover'
  | 'fog-polygon'
  | 'draw-freehand'
  | 'draw-rect'
  | 'draw-circle'
  | 'draw-text'
  | 'draw-erase'
  | 'room'
  | 'wall'
  | 'door'

export interface DrawingRecord {
  id: string
  type: DrawingType
  points: number[]
  color: string
  width: number
  text?: string
  visibleToPlayers: boolean
}

export type RoomVisibility = 'hidden' | 'dimmed' | 'revealed'

export interface RoomRecord {
  id: string
  name: string
  polygon: Array<{ x: number; y: number }>
  visibility: RoomVisibility
  color: string
  notes: string
}

export type WallKind = 'wall' | 'door' | 'window'
export type DoorState = 'closed' | 'open' | 'locked'

export interface WallRecord {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  kind: WallKind
  doorState: DoorState
}

export interface PinRecord {
  id: string
  x: number
  y: number
  label: string
  color: string
}

export interface MapScene {
  id: string
  name: string
  imagePath: string
  width: number
  height: number
  gridType: GridType
  gridSize: number
  ftPerUnit: number
  gridOffsetX: number
  gridOffsetY: number
  gridVisible: boolean
  gridThickness: number
  gridColor: string
  rotation: number
  rotationPlayer: number
  cameraX: number | null
  cameraY: number | null
  cameraScale: number | null
  fogBitmap: string | null
  drawings: DrawingRecord[]
  rooms: RoomRecord[]
  walls: WallRecord[]
  pins: PinRecord[]
  createdAt: string
  updatedAt: string
}

export interface MapBerryLibrary {
  version: 1
  maps: MapScene[]
  activeMapId: string | null
}

export interface PlayerMapState {
  map: MapScene | null
  mode: 'idle' | 'map' | 'blackout'
  blackout: boolean
  viewport: PlayerViewport | null
}

export interface PlayerPointer {
  x: number
  y: number
}

export interface PlayerMeasure {
  type: 'line' | 'circle'
  startX: number
  startY: number
  endX: number
  endY: number
  distance: number
}

export interface PlayerViewport {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}
