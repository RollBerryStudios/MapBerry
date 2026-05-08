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
      normalizeFogMask(canvas)
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
  ctx.fillStyle = 'rgba(0, 0, 0, 1)'
  beginShape(ctx, op)
  ctx.fill()
  ctx.restore()
}

export function tintFogSource(source: CanvasImageSource | null, width: number, height: number, color: string, opacity = 1): HTMLCanvasElement | null {
  if (!source || width <= 0 || height <= 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rgb = parseHexColor(color)
  const alpha = Math.max(0, Math.min(1, opacity))
  for (let i = 0; i < image.data.length; i += 4) {
    const mask = image.data[i + 3] > 8 ? 255 : 0
    image.data[i] = rgb.r
    image.data[i + 1] = rgb.g
    image.data[i + 2] = rgb.b
    image.data[i + 3] = Math.round(mask * alpha)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function normalizeFogMask(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const covered = image.data[i + 3] > 8
    image.data[i] = 0
    image.data[i + 1] = 0
    image.data[i + 2] = 0
    image.data[i + 3] = covered ? 255 : 0
  }
  ctx.putImageData(image, 0, 0)
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    }
  }
  return { r: 0, g: 0, b: 0 }
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
