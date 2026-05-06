export type FogOp = {
  mode: 'cover' | 'reveal'
  shape: 'circle' | 'rect' | 'polygon'
  points: number[]
}

export function createFogCanvas(width: number, height: number, dataUrl: string | null): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(canvas)
  if (!dataUrl) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return Promise.resolve(canvas)
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas)
    }
    img.onerror = () => resolve(canvas)
    img.src = dataUrl
  })
}

export function applyFogOp(canvas: HTMLCanvasElement, op: FogOp) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.globalCompositeOperation = op.mode === 'reveal' ? 'destination-out' : 'source-over'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.86)'
  beginShape(ctx, op)
  ctx.fill()
  ctx.restore()
}

function beginShape(ctx: CanvasRenderingContext2D, op: FogOp) {
  ctx.beginPath()
  if (op.shape === 'circle') {
    const [x = 0, y = 0, r = 1] = op.points
    ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2)
    return
  }
  if (op.shape === 'rect') {
    const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = op.points
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    return
  }
  if (op.points.length >= 6) {
    ctx.moveTo(op.points[0], op.points[1])
    for (let i = 2; i < op.points.length; i += 2) ctx.lineTo(op.points[i], op.points[i + 1])
    ctx.closePath()
  }
}
