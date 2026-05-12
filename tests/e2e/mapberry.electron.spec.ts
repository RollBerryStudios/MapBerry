import { expect, test, type Locator } from '@playwright/test'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  clickCanvas,
  closeMapBerry,
  createPngFixture,
  dragOnCanvas,
  freshUserData,
  importFixtureMap,
  launchMapBerry,
  readLibrary,
  setImportDialogFile,
  waitForPlayerCanvasSignal
} from './helpers'

test.describe('MapBerry Electron map workflow', () => {
  test('opens settings with German dark defaults and keeps suite links available', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark')
      await page.getByRole('button', { name: 'Einstellungen' }).click()
      await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible()
      await expect(page.getByLabel('Sprache')).toHaveValue('de')
      await expect(page.getByLabel('Design')).toHaveValue('dark')
      await expect(page.getByRole('button', { name: 'kontakt@rollberry.de' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'GitHub-Repository' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'RollBerry Studios auf GitHub' })).toBeVisible()
      await expect(page).toHaveScreenshot('mapberry-settings-dark-de.png', { fullPage: true })

      await page.getByRole('button', { name: 'English' }).click()
      await page.getByRole('button', { name: 'Light' }).click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light')
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'GitHub repository' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'RollBerry Studios on GitHub' })).toBeVisible()
      await expect.poll(() => page.evaluate(() => ({
        locale: localStorage.getItem('mapberry-locale'),
        theme: localStorage.getItem('mapberry-theme')
      }))).toEqual({ locale: 'en', theme: 'light' })
      await page.getByRole('button', { name: 'Close' }).click()
      await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
    } finally {
      await closeMapBerry(app)
    }
  })

  test('keeps desktop and narrow layouts bounded and screenshot-stable', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await assertVisibleLayout(page)
      await assertNoUnexpectedOverlaps(page)
      await expect(page).toHaveScreenshot('mapberry-desktop-layout.png', { fullPage: true })

      await page.setViewportSize({ width: 900, height: 760 })
      await page.waitForTimeout(100)
      await assertVisibleLayout(page)
      await assertNoUnexpectedOverlaps(page)
      await expect(page).toHaveScreenshot('mapberry-responsive-layout.png', { fullPage: true })

      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(100)
      await assertVisibleLayout(page)
      await assertNoUnexpectedOverlaps(page)
      await expect(page).toHaveScreenshot('mapberry-mobile-390.png', { fullPage: true })
    } finally {
      await closeMapBerry(app)
    }
  })

  test('imports a map image into isolated app storage', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await expect(page.getByRole('button', { name: /Demo Map/ })).toBeVisible()
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'Demo Map')?.width ?? 0).toBe(1536)
      await expect(page.getByRole('button', { name: 'Datenordner öffnen' })).toHaveCount(0)
      await expect(page.getByText('Feldgröße')).toHaveCount(0)
      await expect(page.locator('.left-panel').getByLabel('DM-Ansicht')).toHaveCount(0)
      await expect(page.getByTestId('toolgroup-view')).toHaveAttribute('title', 'Ansicht: Pan')
      await expect(page.getByTestId('toolgroup-fog')).toHaveAttribute('title', 'Nebel: Werkzeuge')
      await expect(page.getByText('Gridfarbe')).toHaveCount(0)
      await expect(page.getByText('Zeichenfarbe')).toHaveCount(0)
      await expect(page.getByText('Strichstärke')).toHaveCount(0)
      await expect(page.getByTestId('grid-settings')).toHaveAttribute('title', 'Grid: Schwarz, 64px')
      await page.getByTestId('grid-settings').click()
      await expect(page.getByLabel('DM-Ansicht')).toBeVisible()
      await expect(page.getByLabel('Spieleransicht')).toBeVisible()
      await expect(page.getByLabel('ft pro Feld')).toHaveValue('5')
      await expect(page.getByLabel('Gridgröße')).toHaveValue('64')
      await expect(page.getByLabel('Grid-Offset X')).toHaveValue('0')
      await expect(page.getByLabel('Grid-Offset Y')).toHaveValue('0')
      await expect(page.getByTestId('grid-color-toggle')).toHaveAttribute('title', 'Gridfarbe: Schwarz')
      await page.getByTestId('toolgroup-fog').click()
      await expect(page.getByTestId('tool-fog-rect')).toHaveAttribute('title', 'Rechteck auf')
      await expect(page.getByTestId('tool-fog-polygon')).toHaveCount(0)
      await expect(page.getByTestId('fog-brush-slider')).toHaveValue('44')
      await expect(page.getByTestId('fog-opacity-slider')).toHaveValue('100')
      await page.getByTestId('toolgroup-draw').click()
      await expect(page.getByTestId('draw-width-slider')).toHaveValue('3')
      await expect(page.getByTestId('draw-color-black')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('draw-color-red')).toHaveAttribute('title', 'Rot')

      await importFixtureMap(page, app, testInfo)

      await expect.poll(async () => mapNamed(await readLibrary(userData), 'playwright-map')?.width ?? 0).toBe(320)
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'playwright-map')?.height ?? 0).toBe(240)

      const library = await readLibrary(userData)
      const imported = mapNamed(library, 'playwright-map')
      const demo = mapNamed(library, 'Demo Map')
      expect(library.maps).toHaveLength(2)
      expect(demo).toMatchObject({ width: 1536, height: 1024, gridType: 'none', gridVisible: false, gridSize: 64, gridThickness: 0.5, gridColor: '#000000' })
      expect(imported).toMatchObject({
        name: 'playwright-map',
        gridType: 'none',
        gridVisible: false,
        gridSize: 50,
        gridThickness: 0.5,
        gridColor: '#000000',
        ftPerUnit: 5
      })
      expect(imported).toBeTruthy()
      expect(demo).toBeTruthy()
      expect(existsSync(join(userData, imported!.imagePath))).toBe(true)
      expect(existsSync(join(userData, demo!.imagePath))).toBe(true)
    } finally {
      await closeMapBerry(app)
    }
  })

  test('persists grid and player rotation settings across relaunch', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    let launched = await launchMapBerry(userData)
    try {
      await importFixtureMap(launched.page, launched.app, testInfo, 'grid-map')
      await launched.page.getByTestId('grid-settings').click()
      await launched.page.getByRole('button', { name: 'Hex' }).click()
      await launched.page.getByLabel('ft pro Feld').fill('10')
      await launched.page.getByLabel('Spieleransicht').selectOption('90')
      await setRange(launched.page.getByLabel('Gridgröße'), '72')
      await setRange(launched.page.getByLabel('Grid-Offset X'), '12')
      await setRange(launched.page.getByLabel('Grid-Offset Y'), '-8')
      await launched.page.getByTestId('grid-color-toggle').click()

      await expect.poll(async () => {
        const map = mapNamed(await readLibrary(userData), 'grid-map')
        return map && `${map.gridType}:${map.gridSize}:${map.ftPerUnit}:${map.rotationPlayer}:${map.gridColor}:${map.gridOffsetX}:${map.gridOffsetY}`
      }).toBe('hex:72:10:90:#ffffff:12:-8')
    } finally {
      await closeMapBerry(launched.app)
    }

    launched = await launchMapBerry(userData)
    try {
      await expect(launched.page.getByRole('button', { name: /grid-map/ })).toBeVisible()
      await launched.page.getByTestId('grid-settings').click()
      await expect(launched.page.getByRole('button', { name: 'Hex' })).toHaveClass(/active/)
      await expect(launched.page.getByLabel('ft pro Feld')).toHaveValue('10')
      await expect(launched.page.getByLabel('Spieleransicht')).toHaveValue('90')
      await expect(launched.page.getByLabel('Gridgröße')).toHaveValue('72')
      await expect(launched.page.getByLabel('Grid-Offset X')).toHaveValue('12')
      await expect(launched.page.getByLabel('Grid-Offset Y')).toHaveValue('-8')
      await expect(launched.page.getByTestId('grid-color-toggle')).toHaveAttribute('title', 'Gridfarbe: Weiß')
    } finally {
      await closeMapBerry(launched.app)
    }
  })

  test('uses guarded keyboard shortcuts for grid and tools', async ({}, testInfo) => {
      const userData = await freshUserData(testInfo)
      const { app, page } = await launchMapBerry(userData)
    try {
      await importFixtureMap(page, app, testInfo, 'shortcut-map')
      await expect.poll(async () => activeMapIn(await readLibrary(userData))?.gridType).toBe('none')

      await page.getByLabel('Name').focus()
      await page.keyboard.press('g')
      await page.keyboard.press('2')
      await expect.poll(async () => activeMapIn(await readLibrary(userData))?.gridType).toBe('none')

      await clickCanvas(page, 0.5, 0.5)
      await page.keyboard.press('g')
      await page.keyboard.press('1')
      await page.keyboard.press('g')
      await page.keyboard.press('=')
      await page.keyboard.press('g')
      await page.keyboard.press('Shift+ArrowRight')
      await page.keyboard.press('g')
      await page.keyboard.press('c')
      await page.keyboard.press('g')
      await page.keyboard.press('.')
      await expect.poll(async () => {
        const map = activeMapIn(await readLibrary(userData))
        return map && `${map.gridType}:${map.gridVisible}:${map.gridSize}:${map.gridOffsetX}:${map.gridColor}:${map.gridThickness}`
      }).toBe('square:true:51:10:#ffffff:0.75')

      await page.keyboard.press('f')
      await expect(page.getByTestId('tool-fog-brush')).toBeVisible()
      await page.keyboard.press('d')
      await expect(page.getByTestId('draw-width-slider')).toBeVisible()
      await page.keyboard.press('r')
      await expect(page.getByTestId('tool-room')).toBeVisible()
      await page.keyboard.press('h')
      await expect(page.getByTestId('active-tool-readout')).toContainText('Pan')
    } finally {
      await closeMapBerry(app)
    }
  })

  test('creates drawings, walls, rooms, and fog changes from canvas tools', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await importFixtureMap(page, app, testInfo, 'tool-map')
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.width ?? 0).toBe(320)

      await page.getByTestId('toolgroup-draw').click()
      await setRange(page.getByTestId('draw-width-slider'), '3')
      await page.getByTestId('draw-color-red').click()
      await page.getByTestId('tool-draw-rect').click()
      await dragOnCanvas(page, 0.45, 0.40, 0.57, 0.54)
      await expect.poll(async () => {
        const drawing = mapNamed(await readLibrary(userData), 'tool-map')?.drawings[0]
        return drawing && `${drawing.color}:${drawing.width}`
      }).toBe('#ef4444:3')

      await page.getByTestId('toolgroup-structure').click()
      await page.getByTestId('tool-wall').click()
      await dragOnCanvas(page, 0.43, 0.66, 0.62, 0.66)
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.walls.length ?? 0).toBe(1)

      await page.getByTestId('toolgroup-structure').click()
      await page.getByTestId('tool-room').click()
      await clickCanvas(page, 0.44, 0.31)
      await clickCanvas(page, 0.56, 0.31)
      await clickCanvas(page, 0.55, 0.45)
      await page.keyboard.press('Enter')
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.rooms.length ?? 0).toBe(1)
      await expect(page.getByRole('button', { name: /Raum 1/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Raum 1/ })).toHaveClass(/active/)
      await expect(page.getByRole('button', { name: /Wand 1/ })).not.toHaveClass(/active/)
      await expect(page.getByRole('button', { name: /Rechteck 1/ })).not.toHaveClass(/active/)
      await expect(page).toHaveScreenshot('mapberry-room-line-tooling.png', { fullPage: true, maxDiffPixels: 10 })

      await page.getByTestId('fog-cover-all').click()
      await expect.poll(async () => Boolean(mapNamed(await readLibrary(userData), 'tool-map')?.fogBitmap)).toBe(true)
      const coveredFog = mapNamed(await readLibrary(userData), 'tool-map')!.fogBitmap
      expect(await sampleFogAlpha(page, coveredFog!, 12, 12)).toBe(255)
      await page.getByRole('button', { name: 'Raum aufdecken' }).click()
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.fogBitmap !== coveredFog).toBe(true)
      const room = mapNamed(await readLibrary(userData), 'tool-map')!.rooms[0]
      const roomRevealedFog = mapNamed(await readLibrary(userData), 'tool-map')!.fogBitmap
      expect(await sampleFogAlpha(page, roomRevealedFog!, Math.round(room.polygon[0].x), Math.round(room.polygon[0].y))).toBe(0)

      await page.getByTestId('toolgroup-fog').click()
      await expect(page.getByTestId('tool-fog-polygon')).toHaveCount(0)
      await page.getByTestId('tool-fog-brush-cover').click()
      await shiftWheelOnCanvas(page, 0.50, 0.50, -120)
      await page.getByTestId('toolgroup-fog').click()
      await expect(page.getByTestId('fog-brush-slider')).toHaveValue('50')
      await page.getByTestId('tool-fog-rect').click()
      await dragOnCanvas(page, 0.47, 0.37, 0.59, 0.50)
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.fogBitmap !== roomRevealedFog).toBe(true)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('active-tool-readout')).toContainText('Pan')
    } finally {
      await closeMapBerry(app)
    }
  })

  test('opens player window and syncs map, viewport, and blackout state', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await importFixtureMap(page, app, testInfo, 'player-map')
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'player-map')?.width ?? 0).toBe(320)

      const playerPromise = app.waitForEvent('window')
      await page.getByRole('button', { name: 'Spielerfenster' }).click()
      const player = await playerPromise
      await player.waitForLoadState('domcontentloaded')
      await expect(player.getByTestId('player-stage')).toBeVisible()
      await waitForPlayerCanvasSignal(player)
      await page.keyboard.press('p')
      await expect(page.getByTestId('active-tool-readout')).toContainText('Ping')
      await clickCanvas(page, 0.5, 0.5)
      await expect(page.getByTestId('map-canvas-host')).toHaveAttribute('data-ping-active', 'true')
      await expect(player.getByTestId('player-stage')).toHaveAttribute('data-ping-active', 'true')

      await page.getByRole('button', { name: 'Spielerrahmen' }).click()
      await expect(page.getByRole('button', { name: 'Spielerrahmen' })).toHaveClass(/active/)
      await waitForPlayerCanvasSignal(player)

      await page.keyboard.press('b')
      await expect(player.getByTestId('player-blackout')).toBeVisible()
      await page.keyboard.press('b')
      await expect(player.getByTestId('player-stage')).toBeVisible()

      const closed = player.waitForEvent('close')
      await page.getByRole('button', { name: 'Spielerfenster an' }).click()
      await closed
    } finally {
      await closeMapBerry(app)
    }
  })

  test('sends player messages, alerts, timer, and handouts from the live toolbar', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      const playerPromise = app.waitForEvent('window')
      await page.getByRole('button', { name: 'Spielerfenster' }).click()
      const player = await playerPromise
      await player.waitForLoadState('domcontentloaded')
      await expect(player.getByTestId('player-stage')).toBeVisible()

      await page.getByTestId('toolgroup-live').click()
      await page.getByTestId('live-message-title').fill('Hinweis')
      await page.getByTestId('live-message-body').fill('Die schwere Tür öffnet sich.')
      await page.getByTestId('live-message-send').click()
      await expect(player.getByTestId('player-notice')).toContainText('Die schwere Tür öffnet sich.')

      await page.getByTestId('live-message-position').selectOption('bottom-right')
      await page.getByTestId('live-message-layout').selectOption('mirror-x')
      await page.getByRole('button', { name: 'Alarm' }).click()
      await page.getByTestId('live-message-title').fill('Alarm')
      await page.getByTestId('live-message-body').fill('Zeitdruck!')
      await page.getByTestId('live-message-send').click()
      await expect(player.getByTestId('player-notice')).toHaveCount(2)
      await expect(player.locator('[data-overlay-anchor="bottom-left"] [data-testid="player-notice"]')).toContainText('Zeitdruck!')
      await expect(player.locator('[data-overlay-anchor="bottom-right"] [data-testid="player-notice"]')).toHaveClass(/alert/)
      await expect(player.locator('[data-overlay-anchor="bottom-right"]')).toHaveAttribute('data-overlay-flipped', 'true')

      await page.getByTestId('live-timer-position').selectOption('bottom')
      await page.getByTestId('live-timer-label').fill('Rundenzeit')
      await page.getByTestId('live-timer-minutes').fill('1')
      await page.getByTestId('live-timer-start').click()
      await expect(player.locator('[data-overlay-anchor="bottom"] [data-testid="player-timer"]')).toContainText('Rundenzeit')
      await expect.poll(async () => player.locator('[data-overlay-anchor="bottom"] [data-testid="player-timer"]').innerText()).toMatch(/0[01]:[0-5][0-9]/)

      await page.getByTestId('live-handout-add').click()
      await page.getByTestId('live-handout-title').fill('Geheime Notiz')
      await page.getByTestId('live-handout-body').fill('Der Hebel zeigt nach Norden.')
      await page.getByTestId('live-handout-position').selectOption('right')
      const handoutImage = testInfo.outputPath('handout-image.png')
      await createPngFixture(handoutImage, 120, 80)
      await setImportDialogFile(app, handoutImage)
      await page.getByTestId('live-handout-image').click()
      await page.getByTestId('live-handout-show').click()
      await expect(player.locator('[data-overlay-anchor="right"] [data-testid="player-handout"]')).toContainText('Geheime Notiz')
      await expect(player.locator('[data-overlay-anchor="right"] [data-testid="player-handout"]')).toContainText('Der Hebel zeigt nach Norden.')
      await expect(player.locator('[data-overlay-anchor="right"] [data-testid="player-handout-image"]')).toBeVisible()
      await expect.poll(async () => {
        const handout = mapNamed(await readLibrary(userData), 'Demo Map')?.handouts[0]
        return handout && `${handout.title}:${Boolean(handout.imagePath)}`
      }).toBe('Geheime Notiz:true')

      await page.getByTestId('live-handout-hide').click()
      await expect(player.getByTestId('player-handout')).toHaveCount(0)
      await page.getByTestId('live-message-clear').click()
      await expect(player.getByTestId('player-notice')).toHaveCount(0)
    } finally {
      await closeMapBerry(app)
    }
  })

  test('rejects invalid imports and blocks asset traversal', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      const badImage = testInfo.outputPath('not-an-image.png')
      await writeFile(badImage, 'this is not a png')
      await setImportDialogFile(app, badImage)
      await page.getByTestId('import-map').click()
      await expect.poll(async () => (await readLibrary(userData)).maps.length).toBe(1)
      expect(mapNamed(await readLibrary(userData), 'Demo Map')).toBeTruthy()

      const dataUrl = await page.evaluate(() => (window as unknown as { mapberry: { getAssetDataUrl: (path: string) => Promise<string | null> } }).mapberry.getAssetDataUrl('../package.json'))
      expect(dataUrl).toBeNull()

      const status = await page.evaluate(async () => {
        const response = await fetch('local-asset:///../package.json')
        return response.status
      })
      expect(status).toBe(403)
    } finally {
      await closeMapBerry(app)
    }
  })
})

function mapNamed(library: Awaited<ReturnType<typeof readLibrary>>, name: string) {
  return library.maps.find((map) => map.name === name)
}

function activeMapIn(library: Awaited<ReturnType<typeof readLibrary>>) {
  return library.maps.find((map) => map.id === library.activeMapId)
}

async function setRange(locator: Locator, value: string) {
  await locator.evaluate((node, nextValue) => {
    const input = node as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

async function shiftWheelOnCanvas(page: import('@playwright/test').Page, x: number, y: number, deltaY: number): Promise<void> {
  const canvas = page.locator('[data-testid="map-canvas-host"] canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Map canvas has no bounding box')
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
  await page.keyboard.down('Shift')
  await page.mouse.wheel(0, deltaY)
  await page.keyboard.up('Shift')
}

async function sampleFogAlpha(page: import('@playwright/test').Page, dataUrl: string, x: number, y: number): Promise<number> {
  return page.evaluate(async ({ dataUrl, x, y }) => {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(x, y, 1, 1).data[3]
  }, { dataUrl, x, y })
}

async function assertVisibleLayout(page: import('@playwright/test').Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const selectors = [
      '.titlebar',
      '.brand',
      '.window-actions',
      '.topbar',
      '.workspace',
      '.panel',
      '.map-surface',
      '.tool-dock',
      '.floating-fog',
      'button',
      'input',
      'select',
      'textarea'
    ]
    const result: string[] = []
    const seen = new Set<Element>()
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        if (seen.has(element)) continue
        seen.add(element)
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const rect = element.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) result.push(`${selector} has empty bounds`)
        if (rect.bottom < -1 || rect.top > viewport.height + 1) continue
        if (rect.left < -1 || rect.right > viewport.width + 1) result.push(`${selector} overflows horizontally: ${JSON.stringify(rect.toJSON())}`)
        if (element instanceof HTMLButtonElement && element.scrollWidth > element.clientWidth + 2) result.push(`button text clips: ${element.textContent?.trim()}`)
        if (element.matches('button, input, select, textarea') && !element.closest('.panel, .tool-dock')) {
          const clippedBy = clippedByHiddenAncestor(element, rect)
          if (clippedBy) result.push(`${selector} is clipped by ${clippedBy}: ${element.textContent?.trim().slice(0, 40)}`)
        }
      }
    }

    const appShell = document.querySelector('.app-shell')
    if (appShell?.getAttribute('data-platform') === 'darwin') {
      const logo = document.querySelector('.brand img')?.getBoundingClientRect()
      if (!logo || logo.left < 84) result.push(`brand logo overlaps native window controls: ${logo ? JSON.stringify(logo.toJSON()) : 'missing logo'}`)
    }

    function clippedByHiddenAncestor(element: Element, elementRect: DOMRect): string | null {
      let clip = {
        left: elementRect.left,
        right: elementRect.right,
        top: elementRect.top,
        bottom: elementRect.bottom,
      }
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (parent.id === 'root' || parent.classList.contains('app-shell')) continue
        const style = window.getComputedStyle(parent)
        const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip'
        const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip'
        if (!clipsX && !clipsY) continue
        const parentRect = parent.getBoundingClientRect()
        clip = {
          left: clipsX ? Math.max(clip.left, parentRect.left) : clip.left,
          right: clipsX ? Math.min(clip.right, parentRect.right) : clip.right,
          top: clipsY ? Math.max(clip.top, parentRect.top) : clip.top,
          bottom: clipsY ? Math.min(clip.bottom, parentRect.bottom) : clip.bottom,
        }
        if (clip.right < elementRect.right - 2 || clip.left > elementRect.left + 2 || clip.bottom < elementRect.bottom - 2 || clip.top > elementRect.top + 2) {
          return parent.className || parent.tagName.toLowerCase()
        }
      }
      return null
    }

    return result
  })
  expect(failures).toEqual([])
}

async function assertNoUnexpectedOverlaps(page: import('@playwright/test').Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const groups = [
      '.titlebar > *',
      '.window-actions > *',
      '.topbar > *',
      '.workspace > *',
      '.segmented > button',
      '.map-list > button',
      '.floating-fog > button',
      '.settings-modal header > *'
    ]
    const result: string[] = []
    for (const group of groups) {
      const rects = Array.from(document.querySelectorAll(group))
        .filter((element) => {
          const style = window.getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .map((element) => ({ text: element.textContent?.trim() || element.getAttribute('aria-label') || group, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight)
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]
          const b = rects[j]
          const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
          const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
          if (overlapX > 2 && overlapY > 2) result.push(`${group} overlaps: ${a.text} / ${b.text}`)
        }
      }
    }
    return result
  })
  expect(failures).toEqual([])
}
