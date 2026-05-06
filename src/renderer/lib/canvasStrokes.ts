export const ROOM_STROKE = 1.5
export const ROOM_SELECTED_STROKE = 2
export const ROOM_PREVIEW_STROKE = 2
export const WALL_STROKE = 4
export const TOOL_PREVIEW_STROKE = 2
export const PLAYER_VIEWPORT_STROKE = 2

const DRAWING_MIN_SCREEN_STROKE = 1.5
const DRAWING_MAX_SCREEN_STROKE = 12

function safeScale(scale: number) {
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function screenPx(px: number, scale: number) {
  return px / safeScale(scale)
}

export function screenDash(values: number[], scale: number) {
  return values.map((value) => screenPx(value, scale))
}

export function drawingStroke(width: number, scale: number) {
  const requested = Number.isFinite(width) ? Math.max(1, width) : 1
  const screenWidth = Math.max(DRAWING_MIN_SCREEN_STROKE, Math.min(DRAWING_MAX_SCREEN_STROKE, requested * safeScale(scale)))
  return screenPx(screenWidth, scale)
}
