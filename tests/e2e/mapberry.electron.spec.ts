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
  test('imports a map image into isolated app storage', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await expect(page.getByRole('button', { name: /Demo Map/ })).toBeVisible()
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'Demo Map')?.width ?? 0).toBe(1536)
      await expect(page.getByText('Feldgröße')).toHaveCount(0)
      await expect(page.getByLabel('DM-Ansicht')).toBeVisible()
      await expect(page.getByTestId('toolgroup-view')).toHaveAttribute('title', 'Ansicht: Pan')
      await expect(page.getByTestId('toolgroup-fog')).toHaveAttribute('title', 'Nebel: Werkzeuge')
      await expect(page.getByText('Gridfarbe')).toHaveCount(0)
      await expect(page.getByText('Zeichenfarbe')).toHaveCount(0)
      await expect(page.getByText('Strichstärke')).toHaveCount(0)
      await expect(page.getByTestId('grid-settings')).toHaveAttribute('title', 'Grid: Weiß, 64px')
      await page.getByTestId('grid-settings').click()
      await expect(page.getByLabel('Gridgröße')).toHaveValue('64')
      await expect(page.getByLabel('Grid-Offset X')).toHaveValue('0')
      await expect(page.getByLabel('Grid-Offset Y')).toHaveValue('0')
      await expect(page.getByTestId('grid-color-toggle')).toHaveAttribute('title', 'Gridfarbe: Weiß')
      await page.getByTestId('toolgroup-fog').click()
      await expect(page.getByTestId('tool-fog-rect')).toHaveAttribute('title', 'Rechteck auf')
      await page.getByTestId('toolgroup-draw').click()
      await expect(page.getByTestId('draw-width-slider')).toHaveValue('4')
      await expect(page.getByTestId('draw-color-black')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('draw-color-red')).toHaveAttribute('title', 'Rot')

      await importFixtureMap(page, app, testInfo)

      await expect.poll(async () => mapNamed(await readLibrary(userData), 'playwright-map')?.width ?? 0).toBe(320)
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'playwright-map')?.height ?? 0).toBe(240)

      const library = await readLibrary(userData)
      const imported = mapNamed(library, 'playwright-map')
      const demo = mapNamed(library, 'Demo Map')
      expect(library.maps).toHaveLength(2)
      expect(demo).toMatchObject({ width: 1536, height: 1024, gridSize: 64, gridColor: '#ffffff' })
      expect(imported).toMatchObject({
        name: 'playwright-map',
        gridType: 'square',
        gridSize: 50,
        gridColor: '#ffffff',
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
      await launched.page.getByRole('button', { name: 'Hex' }).click()
      await launched.page.getByLabel('ft pro Feld').fill('10')
      await launched.page.getByLabel('Spieleransicht').selectOption('90')
      await launched.page.getByTestId('grid-settings').click()
      await setRange(launched.page.getByLabel('Gridgröße'), '72')
      await setRange(launched.page.getByLabel('Grid-Offset X'), '12')
      await setRange(launched.page.getByLabel('Grid-Offset Y'), '-8')
      await launched.page.getByTestId('grid-color-toggle').click()

      await expect.poll(async () => {
        const map = mapNamed(await readLibrary(userData), 'grid-map')
        return map && `${map.gridType}:${map.gridSize}:${map.ftPerUnit}:${map.rotationPlayer}:${map.gridColor}:${map.gridOffsetX}:${map.gridOffsetY}`
      }).toBe('hex:72:10:90:#000000:12:-8')
    } finally {
      await closeMapBerry(launched.app)
    }

    launched = await launchMapBerry(userData)
    try {
      await expect(launched.page.getByRole('button', { name: /grid-map/ })).toBeVisible()
      await expect(launched.page.getByRole('button', { name: 'Hex' })).toHaveClass(/active/)
      await expect(launched.page.getByLabel('ft pro Feld')).toHaveValue('10')
      await expect(launched.page.getByLabel('Spieleransicht')).toHaveValue('90')
      await launched.page.getByTestId('grid-settings').click()
      await expect(launched.page.getByLabel('Gridgröße')).toHaveValue('72')
      await expect(launched.page.getByLabel('Grid-Offset X')).toHaveValue('12')
      await expect(launched.page.getByLabel('Grid-Offset Y')).toHaveValue('-8')
      await expect(launched.page.getByTestId('grid-color-toggle')).toHaveAttribute('title', 'Gridfarbe: Schwarz')
    } finally {
      await closeMapBerry(launched.app)
    }
  })

  test('creates drawings, walls, rooms, and fog changes from canvas tools', async ({}, testInfo) => {
    const userData = await freshUserData(testInfo)
    const { app, page } = await launchMapBerry(userData)
    try {
      await importFixtureMap(page, app, testInfo, 'tool-map')
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.width ?? 0).toBe(320)

      await page.getByTestId('toolgroup-draw').click()
      await setRange(page.getByTestId('draw-width-slider'), '9')
      await page.getByTestId('draw-color-red').click()
      await page.getByTestId('tool-draw-rect').click()
      await dragOnCanvas(page, 0.45, 0.40, 0.57, 0.54)
      await expect.poll(async () => {
        const drawing = mapNamed(await readLibrary(userData), 'tool-map')?.drawings[0]
        return drawing && `${drawing.color}:${drawing.width}`
      }).toBe('#ef4444:9')

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

      await page.getByTestId('fog-cover-all').click()
      await expect.poll(async () => Boolean(mapNamed(await readLibrary(userData), 'tool-map')?.fogBitmap)).toBe(true)
      const coveredFog = mapNamed(await readLibrary(userData), 'tool-map')!.fogBitmap

      await page.getByTestId('toolgroup-fog').click()
      await page.getByTestId('tool-fog-rect').click()
      await dragOnCanvas(page, 0.47, 0.37, 0.59, 0.50)
      await expect.poll(async () => mapNamed(await readLibrary(userData), 'tool-map')?.fogBitmap !== coveredFog).toBe(true)
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

      await page.getByRole('button', { name: 'Spielerrahmen' }).click()
      await expect(page.getByRole('button', { name: 'Spielerrahmen' })).toHaveClass(/active/)
      await waitForPlayerCanvasSignal(player)

      await page.getByRole('button', { name: 'Blackout' }).click()
      await expect(player.getByTestId('player-blackout')).toBeVisible()
      await page.getByRole('button', { name: 'Blackout' }).click()
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

      await page.getByRole('button', { name: 'Alarm' }).click()
      await page.getByTestId('live-message-title').fill('Alarm')
      await page.getByTestId('live-message-body').fill('Zeitdruck!')
      await page.getByTestId('live-message-send').click()
      await expect(player.getByTestId('player-notice')).toHaveClass(/alert/)

      await page.getByTestId('live-timer-label').fill('Rundenzeit')
      await page.getByTestId('live-timer-minutes').fill('1')
      await page.getByTestId('live-timer-start').click()
      await expect(player.getByTestId('player-timer')).toContainText('Rundenzeit')
      await expect.poll(async () => player.getByTestId('player-timer').innerText()).toMatch(/0[01]:[0-5][0-9]/)

      await page.getByTestId('live-handout-add').click()
      await page.getByTestId('live-handout-title').fill('Geheime Notiz')
      await page.getByTestId('live-handout-body').fill('Der Hebel zeigt nach Norden.')
      const handoutImage = testInfo.outputPath('handout-image.png')
      await createPngFixture(handoutImage, 120, 80)
      await setImportDialogFile(app, handoutImage)
      await page.getByTestId('live-handout-image').click()
      await page.getByTestId('live-handout-show').click()
      await expect(player.getByTestId('player-handout')).toContainText('Geheime Notiz')
      await expect(player.getByTestId('player-handout')).toContainText('Der Hebel zeigt nach Norden.')
      await expect(player.getByTestId('player-handout-image')).toBeVisible()
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

async function setRange(locator: Locator, value: string) {
  await locator.evaluate((node, nextValue) => {
    const input = node as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}
