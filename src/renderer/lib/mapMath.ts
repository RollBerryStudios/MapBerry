export interface Transform {
  scale: number
  offsetX: number
  offsetY: number
}

export function screenToMap(x: number, y: number, transform: Transform) {
  return {
    x: (x - transform.offsetX) / transform.scale,
    y: (y - transform.offsetY) / transform.scale
  }
}

export function mapToScreen(x: number, y: number, transform: Transform) {
  return {
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY
  }
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function polygonCenter(poly: Array<{ x: number; y: number }>) {
  if (poly.length === 0) return { x: 0, y: 0 }
  const sum = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / poly.length, y: sum.y / poly.length }
}

export function rectFromPoints(points: number[]) {
  const x1 = points[0] ?? 0
  const y1 = points[1] ?? 0
  const x2 = points[2] ?? x1
  const y2 = points[3] ?? y1
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

export function flattened(poly: Array<{ x: number; y: number }>): number[] {
  return poly.flatMap((p) => [p.x, p.y])
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
