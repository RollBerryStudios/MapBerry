import { _electron as electron, expect, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import type { MapBerryLibrary } from '../../src/shared/mapberry'

export const ROOT = resolve(__dirname, '../..')
const MAIN_ENTRY = join(ROOT, 'dist/main/main.js')

export async function freshUserData(testInfo: TestInfo): Promise<string> {
  const dir = testInfo.outputPath('user-data')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  return dir
}

export async function launchMapBerry(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  if (!existsSync(MAIN_ENTRY)) throw new Error(`Missing built Electron entry: ${MAIN_ENTRY}`)
  const app = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      MAPBERRY_E2E_USER_DATA: userData,
      NODE_ENV: 'production'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dm-app')).toBeVisible()
  return { app, page }
}

export async function closeMapBerry(app: ElectronApplication): Promise<void> {
  try {
    await app.close()
  } catch {
    app.process()?.kill()
  }
}

export async function readLibrary(userData: string): Promise<MapBerryLibrary> {
  try {
    return JSON.parse(await readFile(join(userData, 'data/mapberry-library.json'), 'utf8')) as MapBerryLibrary
  } catch {
    return { version: 1, maps: [], activeMapId: null }
  }
}

export async function setImportDialogFile(app: ElectronApplication, filePath: string | null): Promise<void> {
  await expect.poll(async () => {
    try {
      await app.evaluate(({ dialog }, selectedPath) => {
        const result = selectedPath
          ? { canceled: false, filePaths: [selectedPath] }
          : { canceled: true, filePaths: [] }
        ;(dialog as unknown as { showOpenDialog: () => Promise<typeof result> }).showOpenDialog = async () => result
      }, filePath)
      return true
    } catch (error) {
      if (String(error).includes('Execution context was destroyed')) return false
      throw error
    }
  }, { timeout: 5000 }).toBe(true)
}

export async function importFixtureMap(page: Page, app: ElectronApplication, testInfo: TestInfo, name = 'playwright-map'): Promise<string> {
  const imagePath = testInfo.outputPath(`${name}.png`)
  await createPngFixture(imagePath, 320, 240)
  await setImportDialogFile(app, imagePath)
  await page.getByTestId('import-map').click()
  await expect(page.getByRole('button', { name: new RegExp(escapeRegex(name)) })).toBeVisible()
  return imagePath
}

export async function createPngFixture(filePath: string, width: number, height: number): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, makePng(width, height))
}

export async function dragOnCanvas(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  const box = await canvasBox(page)
  await page.mouse.move(box.x + box.width * fromX, box.y + box.height * fromY)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * toX, box.y + box.height * toY, { steps: 8 })
  await page.mouse.up()
}

export async function clickCanvas(page: Page, x: number, y: number): Promise<void> {
  const box = await canvasBox(page)
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
}

export async function waitForPlayerCanvasSignal(page: Page): Promise<void> {
  const canvas = page.locator('[data-testid="player-stage"] canvas').first()
  await expect(canvas).toBeVisible()
  await expect.poll(async () => {
    return canvas.evaluate((node) => {
      const canvasNode = node as HTMLCanvasElement
      const ctx = canvasNode.getContext('2d')
      if (!ctx || canvasNode.width < 1 || canvasNode.height < 1) return 0
      const data = ctx.getImageData(Math.floor(canvasNode.width / 2), Math.floor(canvasNode.height / 2), 1, 1).data
      return data[0] + data[1] + data[2]
    })
  }).toBeGreaterThan(30)
}

async function canvasBox(page: Page) {
  const canvas = page.locator('[data-testid="map-canvas-host"] canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Map canvas has no bounding box')
  return box
}

function makePng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0
    for (let x = 0; x < width; x++) {
      const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0
      raw[offset++] = checker ? 151 : 66
      raw[offset++] = checker ? 18 : 105
      raw[offset++] = checker ? 82 : 46
      raw[offset++] = 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  const crc = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE = new Uint32Array(256).map((_value, index) => {
  let c = index
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  return c >>> 0
})

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
