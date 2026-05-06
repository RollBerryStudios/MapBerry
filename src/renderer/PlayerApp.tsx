import { useEffect, useMemo, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva'
import logoUrl from './assets/MapBerry.png'
import type { DrawingRecord, MapScene, PlayerMapState, PlayerMeasure, PlayerPointer, PlayerViewport, RoomRecord, WallRecord } from '../shared/mapberry'
import { normalizeGridColor } from '../shared/mapberry'
import { useAssetImage } from './lib/image'
import { ROOM_STROKE, TOOL_PREVIEW_STROKE, WALL_STROKE, drawingStroke, screenDash, screenPx } from './lib/canvasStrokes'
import { distance, flattened, polygonCenter, rectFromPoints } from './lib/mapMath'
import './styles.css'

const GOLD = '#f1bd61'
const LEAF = '#7fb20d'
const BERRY = '#9b124f'

const IDLE_STATE: PlayerMapState = {
  map: null,
  mode: 'idle',
  blackout: false,
  viewport: null
}

export function PlayerApp() {
  const [state, setState] = useState<PlayerMapState>(IDLE_STATE)
  const [pointer, setPointer] = useState<PlayerPointer | null>(null)
  const [measure, setMeasure] = useState<PlayerMeasure | null>(null)
  const [viewport, setViewport] = useState<PlayerViewport | null>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    function report() {
      const next = { width: window.innerWidth, height: window.innerHeight }
      setSize(next)
      window.mapberryPlayer.reportWindowSize({ w: next.width, h: next.height })
    }
    report()
    window.addEventListener('resize', report)
    const offSync = window.mapberryPlayer.onFullSync((next) => {
      setState(next)
      setViewport(next.viewport)
    })
    const offPointer = window.mapberryPlayer.onPointer((ping) => {
      setPointer(ping)
      window.setTimeout(() => setPointer(null), 1000)
    })
    const offMeasure = window.mapberryPlayer.onMeasure(setMeasure)
    const offViewport = window.mapberryPlayer.onViewport(setViewport)
    window.mapberryPlayer.requestFullSync()
    return () => {
      window.removeEventListener('resize', report)
      offSync()
      offPointer()
      offMeasure()
      offViewport()
    }
  }, [])

  if (state.blackout || state.mode === 'blackout') {
    return <div className="player-blackout" data-testid="player-blackout" />
  }

  if (!state.map) {
    return (
      <div className="player-idle" data-testid="player-idle">
        <img src={logoUrl} alt="" />
      </div>
    )
  }

  return (
    <PlayerMap
      map={state.map}
      viewport={viewport ?? state.viewport}
      pointer={pointer}
      measure={measure}
      stageWidth={size.width}
      stageHeight={size.height}
    />
  )
}

function PlayerMap({
  map,
  viewport,
  pointer,
  measure,
  stageWidth,
  stageHeight
}: {
  map: MapScene
  viewport: PlayerViewport | null
  pointer: PlayerPointer | null
  measure: PlayerMeasure | null
  stageWidth: number
  stageHeight: number
}) {
  const { image, size: imageSize } = useAssetImage(map.imagePath)
  const { image: fogImage } = useAssetImage(map.fogBitmap)
  const width = map.width || imageSize.width || 1
  const height = map.height || imageSize.height || 1
  const view = useMemo(() => getPlayerTransform(map, viewport, stageWidth, stageHeight, width, height), [map.rotationPlayer, viewport, stageWidth, stageHeight, width, height])

  return (
    <div className="player-stage" data-testid="player-stage">
      <Stage width={stageWidth} height={stageHeight}>
        <Layer>
          <Rect x={0} y={0} width={stageWidth} height={stageHeight} fill="#000" listening={false} />
          <Group
            x={stageWidth / 2}
            y={stageHeight / 2}
            offsetX={view.offsetX}
            offsetY={view.offsetY}
            scaleX={view.scale}
            scaleY={view.scale}
            rotation={view.rotation}
          >
            {image && <KonvaImage image={image} width={width} height={height} listening={false} />}
            <Grid map={map} scale={view.scale} />
            {map.rooms.filter((room) => room.visibility !== 'hidden').map((room) => <RoomShape key={room.id} room={room} scale={view.scale} />)}
            {map.drawings.filter((drawing) => drawing.visibleToPlayers).map((drawing) => <DrawingShape key={drawing.id} drawing={drawing} scale={view.scale} />)}
            {map.walls.filter((wall) => wall.kind === 'door' && wall.doorState === 'open').map((wall) => <DoorHint key={wall.id} wall={wall} scale={view.scale} />)}
            {fogImage && <KonvaImage image={fogImage} width={width} height={height} opacity={1} listening={false} />}
            {measure && <MeasureShape measure={measure} scale={view.scale} />}
            {pointer && <PointerShape pointer={pointer} scale={view.scale} />}
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}

function getPlayerTransform(map: MapScene, viewport: PlayerViewport | null, stageWidth: number, stageHeight: number, width: number, height: number) {
  const rotation = (map.rotationPlayer + (viewport ? -viewport.rotation : 0) + 360) % 360
  if (viewport) {
    const rotated = Math.abs(viewport.rotation % 180) === 90
    const viewW = rotated ? viewport.h : viewport.w
    const viewH = rotated ? viewport.w : viewport.h
    return {
      offsetX: viewport.cx,
      offsetY: viewport.cy,
      scale: Math.max(0.01, Math.min(stageWidth / Math.max(1, viewW), stageHeight / Math.max(1, viewH))),
      rotation
    }
  }
  const rotated = Math.abs(map.rotationPlayer % 180) === 90
  const fitW = rotated ? height : width
  const fitH = rotated ? width : height
  return {
    offsetX: width / 2,
    offsetY: height / 2,
    scale: Math.max(0.01, Math.min(stageWidth / Math.max(1, fitW), stageHeight / Math.max(1, fitH))),
    rotation
  }
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

function RoomShape({ room, scale }: { room: RoomRecord; scale: number }) {
  const center = polygonCenter(room.polygon)
  const fill = room.visibility === 'revealed' ? `${room.color}18` : `${room.color}0f`
  return (
    <Group listening={false}>
      <Line points={flattened(room.polygon)} closed fill={fill} stroke={room.color} strokeWidth={screenPx(ROOM_STROKE, scale)} opacity={0.58} />
      {room.visibility === 'revealed' && <Text x={center.x - screenPx(60, scale)} y={center.y - screenPx(9, scale)} text={room.name} width={screenPx(120, scale)} align="center" fill="#fff1c8" fontSize={screenPx(14, scale)} opacity={0.7} />}
    </Group>
  )
}

function DrawingShape({ drawing, scale }: { drawing: DrawingRecord; scale: number }) {
  const strokeWidth = drawingStroke(drawing.width, scale)
  if (drawing.type === 'freehand') return <Line points={drawing.points} stroke={drawing.color} strokeWidth={strokeWidth} lineCap="round" lineJoin="round" listening={false} />
  if (drawing.type === 'rect') return <Rect {...rectFromPoints(drawing.points)} stroke={drawing.color} strokeWidth={strokeWidth} listening={false} />
  if (drawing.type === 'circle') {
    const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = drawing.points
    return <Circle x={x1} y={y1} radius={Math.hypot(x2 - x1, y2 - y1)} stroke={drawing.color} strokeWidth={strokeWidth} listening={false} />
  }
  return <Text x={drawing.points[0] ?? 0} y={drawing.points[1] ?? 0} text={drawing.text ?? ''} fontSize={26} fill={drawing.color} listening={false} />
}

function DoorHint({ wall, scale }: { wall: WallRecord; scale: number }) {
  return <Line points={[wall.x1, wall.y1, wall.x2, wall.y2]} stroke={LEAF} strokeWidth={screenPx(WALL_STROKE, scale)} dash={screenDash([10, 8], scale)} opacity={0.5} lineCap="round" listening={false} />
}

function PointerShape({ pointer, scale }: { pointer: PlayerPointer; scale: number }) {
  return (
    <Group listening={false}>
      <Circle x={pointer.x} y={pointer.y} radius={screenPx(28, scale)} stroke={GOLD} strokeWidth={screenPx(4, scale)} opacity={0.92} />
      <Circle x={pointer.x} y={pointer.y} radius={screenPx(10, scale)} fill={BERRY} stroke="#f7f1cf" strokeWidth={screenPx(3, scale)} />
    </Group>
  )
}

function MeasureShape({ measure, scale }: { measure: PlayerMeasure; scale: number }) {
  const start = { x: measure.startX, y: measure.startY }
  const end = { x: measure.endX, y: measure.endY }
  const label = `${measure.distance} ft`
  if (measure.type === 'circle') {
    return (
      <Group listening={false}>
        <Circle x={start.x} y={start.y} radius={distance(start, end)} stroke={GOLD} strokeWidth={screenPx(TOOL_PREVIEW_STROKE, scale)} dash={screenDash([10, 8], scale)} opacity={0.88} />
        <Text x={end.x + screenPx(12, scale)} y={end.y + screenPx(12, scale)} text={label} fill={GOLD} fontSize={screenPx(14, scale)} />
      </Group>
    )
  }
  return (
    <Group listening={false}>
      <Line points={[measure.startX, measure.startY, measure.endX, measure.endY]} stroke={GOLD} strokeWidth={screenPx(TOOL_PREVIEW_STROKE, scale)} dash={screenDash([10, 8], scale)} lineCap="round" />
      <Text x={(measure.startX + measure.endX) / 2 + screenPx(12, scale)} y={(measure.startY + measure.endY) / 2 + screenPx(12, scale)} text={label} fill={GOLD} fontSize={screenPx(14, scale)} />
    </Group>
  )
}
