import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import type { Workspace } from '../../src/workbench/types'

async function workspaces(page: Page): Promise<Workspace[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('OneLookWorkbench')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const rows = db.transaction('workspaces').objectStore('workspaces').getAll()
      rows.onsuccess = () => { db.close(); resolve(rows.result) }
      rows.onerror = () => { db.close(); reject(rows.error) }
    }
  }))
}

test('workbench and classic editor do not request external fonts', async ({ page }) => {
  const externalFonts: string[] = []
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname
    if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
      externalFonts.push(request.url())
    }
  })

  await page.goto('/')
  await page.evaluate(async () => { await document.fonts.ready })
  expect(await page.evaluate(() => document.fonts.check('13px "JetBrains Mono"'))).toBe(true)
  expect(externalFonts).toEqual([])

  await page.getByRole('button', { name: '切换深色主题', exact: true }).click()
  await expect(page.locator('.ol-app')).toHaveAttribute('data-theme', 'dark')
  await page.goto('/?editor=classic')
  await expect(page.locator('.classic-shell')).toBeVisible()
  await expect(page.locator('.ol-app')).toHaveCount(0)
  await page.evaluate(async () => { await document.fonts.ready })
  expect(externalFonts).toEqual([])
})

test('theme preference stays separate from workspace data and exported player switches offline', async ({ page, context }) => {
  const playerFile = join(tmpdir(), `onelook-theme-${randomUUID()}.html`)
  let player: Page | undefined

  try {
    await page.goto('/')
    const app = page.locator('.ol-app')
    await expect(app).toHaveAttribute('data-theme', 'light')
    const lightPaper = await app.evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())
    expect(lightPaper).toBe('#ffffff')

    await page.getByRole('button', { name: '切换深色主题' }).click()
    await expect(app).toHaveAttribute('data-theme', 'dark')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('onelook-ui-theme'))).toBe('dark')
    await page.reload()
    await expect(page.locator('.ol-app')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: '编程项目示例', exact: true }).click()
    await expect(page.getByLabel('讲解标题')).toHaveValue('一次登录请求，如何抵达系统深处')
    await expect(app).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.save-status')).toHaveText('已保存到本地')
    await page.locator('.workbench-nav .nav-item').filter({ hasText: /^结构/ }).click()
    await page.getByRole('tab', { name: '图', exact: true }).click()

    await expect(page.locator('.diagram-node')).toHaveCount(6)
    const legend = page.locator('.graph-legend > span')
    await expect(legend).toHaveCount(3)
    await expect(page.locator('.graph-legend')).toContainText(/组件\s*4/)
    await expect(page.locator('.graph-legend')).toContainText(/接口\s*1/)
    await expect(page.locator('.graph-legend')).toContainText(/概念\s*1/)
    const component = page.locator('.diagram-node[data-node="node-1"] .graph-node')
    const nodeInterface = page.locator('.diagram-node[data-node="node-2"] .graph-node')
    const componentColors = await component.evaluate(element => {
      const style = getComputedStyle(element)
      return { border: style.borderColor, background: style.backgroundColor }
    })
    const interfaceColors = await nodeInterface.evaluate(element => {
      const style = getComputedStyle(element)
      return { border: style.borderColor, background: style.backgroundColor }
    })
    expect(componentColors.border).not.toBe(interfaceColors.border)
    expect(componentColors.background).not.toBe(interfaceColors.background)
    const darkPaper = await app.evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())
    expect(darkPaper).toBe('#0f172a')

    await page.getByRole('button', { name: '编辑', exact: true }).click()
    const title = page.getByLabel('标题', { exact: true })
    const body = page.getByLabel('解释', { exact: true })
    await expect(title).toHaveValue('浏览器')
    await expect(body).toHaveValue(/收集登录信息/)
    expect(await title.evaluate(element => getComputedStyle(element).color !== getComputedStyle(element).backgroundColor)).toBe(true)
    expect(await body.evaluate(element => getComputedStyle(element).color !== getComputedStyle(element).backgroundColor)).toBe(true)

    const beforeThemeSwitch = await workspaces(page)
    await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'AI 设置' })
    await expect(settings).toBeVisible()
    expect(await settings.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(15, 23, 42)')
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await page.getByRole('button', { name: '切换浅色主题' }).click()
    await expect(app).toHaveAttribute('data-theme', 'light')
    expect(await workspaces(page)).toEqual(beforeThemeSwitch)

    await page.locator('.workbench-nav .nav-item').filter({ hasText: /^讲解/ }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出播放页', exact: true }).click()
    const download = await downloading
    await download.saveAs(playerFile)
    const html = readFileSync(playerFile, 'utf8')
    expect(html).toContain('<html lang="zh-CN" data-theme="light">')
    expect(html).toContain("default-src 'none'")

    await context.setOffline(true)
    player = await context.newPage()
    const requests: string[] = []
    const errors: string[] = []
    player.on('request', request => requests.push(request.url()))
    player.on('pageerror', error => errors.push(String(error)))
    await player.goto(pathToFileURL(playerFile).href)
    await expect(player.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(player.locator('.counter')).toHaveText('1 / 6')
    const playerLegend = player.locator('.legend > span')
    await expect(playerLegend).toHaveCount(2)
    await expect(player.locator('.legend')).toContainText('组件 1')
    await expect(player.locator('.legend')).toContainText('接口 1')
    const exportedLightPaper = await player.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())

    await player.getByRole('button', { name: '切换深色主题' }).click()
    await expect(player.locator('html')).toHaveAttribute('data-theme', 'dark')
    const exportedDarkPaper = await player.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())
    expect(exportedDarkPaper).not.toBe(exportedLightPaper)
    await player.keyboard.press('ArrowRight')
    await expect(player.locator('.counter')).toHaveText('2 / 6')
    await expect(player.locator('.legend')).toContainText('组件 3')
    await expect(player.locator('.legend')).toContainText('接口 1')
    await expect(player.locator('.node.hidden')).toHaveCount(2)
    await expect.poll(() => player!.locator('.node.hidden').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).opacity))).toEqual(['0', '0'])
    expect(requests.filter(url => /^https?:/i.test(url))).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await context.setOffline(false)
    await player?.close()
    rmSync(playerFile, { force: true })
  }
})

test('wide graph edges remain reachable without document overflow in both themes', async ({ page }) => {
  await page.goto('/')
  const app = page.locator('.ol-app')
  await expect(app).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '编程项目示例', exact: true }).click()
  await expect(page.getByLabel('讲解标题')).toHaveValue('一次登录请求，如何抵达系统深处')
  await page.locator('.workbench-nav .nav-item').filter({ hasText: /^结构/ }).click()
  await page.getByRole('tab', { name: '图', exact: true }).click()

  const scroll = page.locator('.graph-scroll')
  const nodes = scroll.locator('.graph-node')
  await expect(nodes).toHaveCount(6)

  const assertNoDocumentOverflow = async () => {
    const sizes = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1)
  }
  const scrollLeft = () => scroll.evaluate(element => (element as HTMLElement).scrollLeft)

  for (const width of [1600, 1920]) {
    await page.setViewportSize({ width, height: 1000 })

    for (const theme of ['light', 'dark'] as const) {
      const currentTheme = await app.getAttribute('data-theme')
      if (currentTheme !== theme) {
        await page.getByRole('button', {
          name: theme === 'dark' ? '切换深色主题' : '切换浅色主题',
          exact: true,
        }).click()
      }
      await expect(app).toHaveAttribute('data-theme', theme)
      await expect.poll(scrollLeft).toBe(0)
      await assertNoDocumentOverflow()

      const scrollBox = await scroll.boundingBox()
      const firstBox = await nodes.first().boundingBox()
      expect(scrollBox).not.toBeNull()
      expect(firstBox).not.toBeNull()
      expect(firstBox!.x).toBeGreaterThanOrEqual(scrollBox!.x)

      const maxScrollLeft = await scroll.evaluate(element => {
        const viewport = element as HTMLElement
        return viewport.scrollWidth - viewport.clientWidth
      })
      if (maxScrollLeft > 0) {
        await scroll.hover()
        await page.mouse.wheel(maxScrollLeft + 100, 0)
        await expect.poll(scrollLeft).toBeGreaterThanOrEqual(maxScrollLeft - 1)
      }

      const lastBox = await nodes.last().boundingBox()
      expect(lastBox).not.toBeNull()
      expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(scrollBox!.x + scrollBox!.width + 2)
      await assertNoDocumentOverflow()

      if (maxScrollLeft > 0) await page.mouse.wheel(-maxScrollLeft - 100, 0)
      await expect.poll(scrollLeft).toBe(0)
    }
  }
})
