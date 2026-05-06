import { expect, test, type Locator } from '@playwright/test'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  clickCanvas,
  closeMapBerry,
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
