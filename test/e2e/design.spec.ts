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

/** On narrow screens the secondary header actions fold into the “更多操作” menu. */
async function headerButton(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true })
  if (!(await target.isVisible())) await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await target.click()
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

  await headerButton(page, '切换深色主题')
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

    await headerButton(page, '切换深色主题')
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
    expect(componentColors.background).toBe(interfaceColors.background)
    const nodeSurfaces = await page.locator('.graph-node').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).backgroundColor))])
    const paperSurface = await page.locator('.workbench-main').evaluate(element => getComputedStyle(element).backgroundColor)
    expect(nodeSurfaces).toEqual([paperSurface])
    await expect(component.locator('.node-kicker')).toContainText('组件')
    await expect(nodeInterface.locator('.node-kicker')).toContainText('接口')
    const componentMarker = await component.locator('.node-sigil').evaluate(element => getComputedStyle(element).color)
    const interfaceMarker = await nodeInterface.locator('.node-sigil').evaluate(element => getComputedStyle(element).color)
    expect(componentMarker).not.toBe(interfaceMarker)
    const appRootColors = await app.evaluate(element => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.cssText = 'position:absolute;left:-9999px;width:0;height:0'
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('class', 'diagram-root')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      group.append(rect)
      svg.append(group)
      element.append(svg)
      const style = getComputedStyle(rect)
      const colors = { fill: style.fill, stroke: style.stroke }
      svg.remove()
      return colors
    })
    const cardColors = await component.evaluate(element => ({ background: getComputedStyle(element).backgroundColor }))
    const appLine = await page.locator('.workbench-main').evaluate(element => getComputedStyle(element).borderTopColor)
    expect(appRootColors.fill).toBe(cardColors.background)
    expect(appRootColors.stroke).toBe(appLine)
    const darkPaper = await app.evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())
    expect(darkPaper).not.toBe(lightPaper)

    await page.getByRole('button', { name: '编辑', exact: true }).click()
    const title = page.getByLabel('标题', { exact: true })
    const body = page.getByLabel('解释', { exact: true })
    await expect(title).toHaveValue('浏览器')
    await expect(body).toHaveValue(/收集登录信息/)
    expect(await title.evaluate(element => getComputedStyle(element).color !== getComputedStyle(element).backgroundColor)).toBe(true)
    expect(await body.evaluate(element => getComputedStyle(element).color !== getComputedStyle(element).backgroundColor)).toBe(true)

    const beforeThemeSwitch = await workspaces(page)
    await headerButton(page, 'AI 设置')
    const settings = page.getByRole('dialog', { name: 'AI 设置' })
    await expect(settings).toBeVisible()
    expect(await settings.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(paperSurface)
    await page.getByRole('button', { name: '关闭弹窗' }).click()
    await headerButton(page, '切换浅色主题')
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
    const playerRootColors = await player.evaluate(() => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.cssText = 'position:absolute;left:-9999px;width:0;height:0'
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.setAttribute('class', 'root')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      group.append(rect)
      document.body.append(svg)
      svg.append(group)
      const style = getComputedStyle(rect)
      const colors = { fill: style.fill, stroke: style.stroke }
      svg.remove()
      return colors
    })
    const playerCardBackground = await player.locator('.card').first().evaluate(element => getComputedStyle(element).backgroundColor)
    const playerLine = await player.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.borderTop = '1px solid var(--line)'
      document.body.append(probe)
      const color = getComputedStyle(probe).borderTopColor
      probe.remove()
      return color
    })
    expect(playerRootColors.fill).toBe(playerCardBackground)
    expect(playerRootColors.stroke).toBe(playerLine)
    const playerMarkers = await player.locator('.card .kind-sigil').evaluateAll(elements => [...new Set(elements.map(element => getComputedStyle(element).color))])
    expect(playerMarkers.length).toBeGreaterThan(1)
    const exportedLightPaper = await player.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())

    await player.getByRole('button', { name: '切换深色主题' }).click()
    await expect(player.locator('html')).toHaveAttribute('data-theme', 'dark')
    const exportedDarkPaper = await player.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--paper').trim())
    expect(exportedDarkPaper).not.toBe(exportedLightPaper)
    await player.keyboard.press('ArrowRight')
    await expect(player.locator('.counter')).toHaveText('2 / 6')
    await expect(player.getByRole('list', { name: '讲解进度' }).locator('button[aria-current="step"]')).toHaveAccessibleName(/^第 2 步：/)
    await player.getByRole('list', { name: '讲解进度' }).getByRole('button').nth(3).click()
    await expect(player.locator('.counter')).toHaveText('4 / 6')
    await player.keyboard.press('ArrowLeft')
    await player.keyboard.press('ArrowLeft')
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

test('text-first header, nav and view controls stay visible with story and zoom controls at every width', async ({ page }) => {
  await page.goto('/')
  const initialWorkspaces = await workspaces(page)
  const width = page.viewportSize()!.width
  const more = page.getByRole('button', { name: '更多操作', exact: true })
  if (width <= 980) {
    await expect(more).toBeVisible()
    await more.click()
  } else {
    await expect(more).toBeHidden()
  }
  const themeSwitch = page.locator('.theme-switch')
  await expect(themeSwitch).toHaveText('深色')
  await expect(page.locator('.header-utility').filter({ hasText: '帮助' })).toBeVisible()
  await expect(page.locator('.header-utility').filter({ hasText: 'AI 设置' })).toBeVisible()
  await headerButton(page, '切换深色主题')
  await expect(page.locator('.ol-app')).toHaveAttribute('data-theme', 'dark')
  expect(await workspaces(page)).toEqual(initialWorkspaces)
  await expect(themeSwitch).toHaveText('浅色')
  if (width <= 980) await more.click()
  await expect(page.locator('.header-utility').filter({ hasText: '帮助' })).toBeVisible()
  await expect(page.locator('.header-utility').filter({ hasText: 'AI 设置' })).toBeVisible()
  if (width <= 980) await more.click()

  await page.getByRole('button', { name: '编程项目示例', exact: true }).click()
  await expect(page.locator('.save-status')).toHaveText('已保存到本地')
  const workbenchNav = page.locator('.workbench-nav .nav-item')
  await expect(workbenchNav).toHaveCount(4)
  for (const label of ['资料', '结构', '讲解', '检验']) await expect(workbenchNav.filter({ hasText: new RegExp(`^${label}`) })).toBeVisible()
  const addObject = page.getByRole('button', { name: '添加对象', exact: true })
  if (width > 760) {
    await expect(addObject).toBeVisible()
    expect(await addObject.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  const nav = (name: RegExp) => page.locator('.workbench-nav .nav-item').filter({ hasText: name })

  const history = page.getByRole('button', { name: '历史', exact: true })
  if (width <= 980) {
    await expect(history).toBeHidden()
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await history.click()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
  } else {
    await expect(more).toBeHidden()
    await history.click()
  }
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await nav(/^讲解/).click()
  const brief = page.locator('.brief-toggle')
  await expect(brief).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByLabel('要讲清的问题')).toBeHidden()
  await brief.click()
  await expect(page.getByLabel('要讲清的问题')).toBeVisible()
  await brief.click()
  await expect(page.getByLabel('要讲清的问题')).toBeHidden()

  await page.getByRole('button', { name: '播放', exact: true }).first().click()
  const progress = page.getByRole('list', { name: '讲解进度' }).getByRole('button')
  await expect(progress).toHaveCount(6)
  await progress.nth(2).click()
  await expect(page.locator('.play-count')).toHaveText('3 / 6')
  await expect(progress.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.play-step-no')).toHaveText('第 3 步')
  await page.keyboard.press('Escape')
  await expect(page.locator('.story-play')).toHaveCount(0)

  await nav(/^结构/).click()
  const forms = page.getByRole('radiogroup', { name: '呈现形式' })
  const formRadios = await forms.getByRole('radio').all()
  expect(formRadios).toHaveLength(5)
  for (const radio of formRadios) await expect(radio.locator('span')).toBeVisible()
  await expect(forms.getByRole('radio', { name: '关系图', exact: true })).toHaveAttribute('aria-checked', 'true')
  const percent = async () => Number((await page.locator('.zoom-tools > span').innerText()).replace('%', ''))
  const fitted = await percent()
  await page.getByRole('button', { name: '放大地图', exact: true }).click()
  await expect.poll(percent).toBeGreaterThan(fitted)
  await page.getByRole('button', { name: '重置地图缩放', exact: true }).click()
  await expect.poll(percent).toBe(fitted)
  await forms.getByRole('radio', { name: '流程图', exact: true }).click()
  await expect(forms.getByRole('radio', { name: '流程图', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.semantic-graph.form-flow')).toBeVisible()
  const beforeLightSwitch = await workspaces(page)
  await headerButton(page, '切换浅色主题')
  await expect(page.locator('.ol-app')).toHaveAttribute('data-theme', 'light')
  expect(await workspaces(page)).toEqual(beforeLightSwitch)
  for (const label of ['资料', '结构', '讲解', '检验']) await expect(workbenchNav.filter({ hasText: new RegExp(`^${label}`) })).toBeVisible()
  for (const radio of formRadios) await expect(radio.locator('span')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
