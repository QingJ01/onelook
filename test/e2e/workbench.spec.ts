import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { Workspace } from '../../src/workbench/types'
import { generatedFixture } from '../workbench/fixtures'

async function state(page: Page): Promise<Workspace[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('OneLookWorkbench')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, rows = db.transaction('workspaces').objectStore('workspaces').getAll()
      rows.onsuccess = () => { db.close(); resolve(rows.result) }
      rows.onerror = () => { db.close(); reject(rows.error) }
    }
  }))
}

async function sample(page: Page, index = 0) {
  await page.goto('/')
  await page.getByRole('button', { name: /示例$/ }).nth(index).click()
  await expect(page.getByLabel('工作空间标题')).toBeVisible()
  await saved(page)
}

async function saved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText('已保存到本地')
  await expect(page.locator('.error-banner')).toHaveCount(0)
}

async function change(page: Page, label: string | RegExp, value: string) {
  const input = page.getByLabel(label, { exact: typeof label === 'string' })
  await input.fill(value); await input.press('Tab'); await saved(page)
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const footer = page.locator('.workbench-nav .nav-bottom')
  if (await footer.isVisible()) {
    const listBottom = await page.locator('.workbench-nav .node-list').evaluate(element => element.getBoundingClientRect().bottom)
    const footerTop = await footer.evaluate(element => element.getBoundingClientRect().top)
    expect(footerTop).toBeGreaterThanOrEqual(listBottom)
  }
}

function textPdf() {
  const stream = 'BT /F1 18 Tf 30 100 Td (Local PDF evidence) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const start = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(pdf)
}

test('architecture keeps ordered normal/failure paths, evidence labels and decisions', async ({ page }) => {
  await sample(page)
  await page.getByRole('button', { name: '请求链路与决策', exact: true }).click()
  await expect(page.getByRole('heading', { name: '架构决策', exact: true })).toBeVisible()
  await expect(page.locator('.sequence-scroll')).toContainText('返回统一认证失败')
  await expect(page.getByLabel('证据性质', { exact: false })).toHaveValue('unverified')
  await change(page, '消息 / 操作', '提交登录信息（已人工整理）')
  await change(page, '问题与约束', '保留会话与授权的安全边界')
  const [doc] = await state(page)
  expect(doc.flows[0].steps).toHaveLength(7)
  expect(doc.flows[0].steps.some(step => step.branch === 'failure')).toBe(true)
  expect(doc.decisions[0].context).toBe('保留会话与授权的安全边界')
  await noPageOverflow(page)
  await page.reload()
  await page.getByRole('button', { name: /一次登录请求/ }).first().click()
  await page.getByRole('button', { name: '请求链路与决策', exact: true }).click()
  await expect(page.getByLabel('消息 / 操作')).toHaveValue('提交登录信息（已人工整理）')
  await page.setViewportSize({ width: 1600, height: 1022 })
  await noPageOverflow(page)
  await page.locator('.workbench-nav .node-list-item').last().scrollIntoViewIfNeeded()
  await expect(page.locator('.workbench-nav .node-list-item').last()).toBeInViewport()
})

test('product separates claims and requires evidence before passing acceptance', async ({ page }) => {
  await sample(page, 1)
  await page.getByRole('button', { name: '产品方案与验收', exact: true }).click()
  await expect(page.locator('.product-column')).toHaveCount(3)
  await expect(page.getByLabel('核实状态')).toHaveValue('unverified')
  await expect(page.getByLabel('验收结果').locator('option[value=passed]')).toHaveAttribute('disabled', '')
  await change(page, '实际验证依据', '人工验收：冲突后保留了输入')
  await page.getByLabel('验收结果').selectOption('passed'); await saved(page)
  await page.getByRole('button', { name: '添加备选方案', exact: true }).click(); await saved(page)
  expect((await state(page))[0].productItems[0].alternatives).toHaveLength(2)
  expect((await state(page))[0].productItems[0].criteria[0].state).toBe('passed')
  const evidenceColumn = page.locator('.product-column').filter({ has: page.getByRole('heading', { name: '用户证据', exact: true }) })
  await evidenceColumn.getByRole('button', { name: '+ 添加' }).click(); await saved(page)
  await expect(page.getByLabel('核实状态').locator('option[value=confirmed]')).toHaveAttribute('disabled', '')
  await noPageOverflow(page)
})

test('course records independent answers, reflection, knowledge links and due review', async ({ page }) => {
  await page.clock.install()
  await sample(page, 2)
  await page.getByRole('button', { name: '练习与复习', exact: true }).click()
  await expect(page.getByRole('button', { name: '核对参考答案' })).toBeDisabled()
  await expect(page.locator('.review-summary')).toContainText('0 已到期')
  await page.getByLabel('我的独立回答').fill('字节位置，而不是包编号')
  await page.getByRole('button', { name: '核对参考答案' }).click()
  await page.getByLabel('错因 / 本次反思').fill('混淆了分段与字节序号')
  await page.getByRole('button', { name: '还需回顾 · 10 分钟', exact: true }).click(); await saved(page)
  const attempt = (await state(page))[0].attempts[0]
  expect(attempt.errorReason).toBe('混淆了分段与字节序号')
  expect(attempt.dueAt - attempt.at).toBe(600_000)
  await page.clock.fastForward(630_000)
  await expect(page.locator('.review-summary')).toContainText('1 已到期')
  await page.getByRole('button', { name: '到期队列', exact: true }).click()
  await expect(page.locator('.attempt-card')).toContainText('混淆了分段与字节序号')
  await page.getByRole('button', { name: '序号 ↗', exact: true }).click()
  await expect(page.locator('.detail-panel h2')).toHaveText('序号')
  await noPageOverflow(page)
})

test('views share content but keep drag positions independent, then render a selected view', async ({ page }) => {
  await sample(page)
  const initial = (await state(page))[0]
  await page.getByRole('button', { name: '管理视图' }).click()
  await page.getByLabel('视图名称', { exact: true }).fill('登录产品视角')
  await page.getByLabel('视角', { exact: false }).selectOption('product')
  await page.getByRole('button', { name: '创建独立视图' }).click(); await saved(page)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await change(page, '解释', '这段正文由两个视图共享。')
  const node = page.locator('.graph-node').first()
  await node.scrollIntoViewIfNeeded()
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + 45, box.y + 40); await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 65, { steps: 5 }); await page.mouse.up(); await saved(page)
  const doc = (await state(page))[0]
  expect(doc.views[1].scenario).toBe('product')
  expect(doc.views[0].positions).toEqual(initial.views[0].positions)
  expect(doc.views[1].positions).not.toEqual(doc.views[0].positions)
  await page.getByLabel('当前视图', { exact: true }).selectOption(doc.views[0].id)
  await expect(page.getByLabel('解释', { exact: true })).toHaveValue('这段正文由两个视图共享。')
  await page.getByRole('button', { name: 'Archify 视图', exact: true }).click()
  await page.getByRole('button', { name: '生成视图', exact: true }).click()
  await expect(page.getByTitle('Archify 隔离交互视图')).toBeVisible({ timeout: 30_000 })
  expect(await page.getByTitle('Archify 隔离交互视图').getAttribute('sandbox')).toBe('allow-scripts')
  await noPageOverflow(page)
})

test('source updates retain exact historical citations and locally extract text PDF', async ({ page }) => {
  await sample(page)
  await page.getByRole('button', { name: /资料与依据/ }).click()
  await page.getByRole('button', { name: '更新原文', exact: true }).click()
  await page.getByLabel('原文', { exact: true }).fill('当前资料已更新，不改变旧引用。')
  await page.getByRole('button', { name: '保存资料', exact: true }).click(); await saved(page)
  await page.getByRole('button', { name: /关系地图/ }).first().click()
  await expect(page.locator('.detail-panel')).toContainText('资料已更新 · 待重新核对')
  await page.locator('.detail-panel .citation-jump').first().click()
  await expect(page.locator('.source-original mark')).toContainText('收集登录信息')
  await expect(page.getByLabel('查看版本')).toHaveValue('1')
  await page.getByRole('button', { name: '添加资料', exact: true }).click()
  await page.locator('.source-document input[type=file]').setInputFiles({ name: 'local-evidence.pdf', mimeType: 'application/pdf', buffer: textPdf() })
  await expect(page.getByLabel('原文', { exact: true })).toHaveValue('Local PDF evidence', { timeout: 20_000 })
  await page.getByRole('button', { name: '保存资料', exact: true }).click(); await saved(page)
  expect((await state(page))[0].sources[0].versions).toHaveLength(1)
  expect((await state(page))[0].sources[1].filePath).toBe('local-evidence.pdf')
  await noPageOverflow(page)
})

test('multi-tab conflicts preserve both versions through a local copy', async ({ page, context }) => {
  await sample(page)
  const originalId = (await state(page))[0].id
  const other = await context.newPage(); await other.goto('/')
  await other.getByRole('button', { name: /一次登录请求/ }).first().click()
  await change(page, '工作空间标题', '另一个标签页的新版本')
  await other.bringToFront()
  await expect(other.locator('.conflict-banner')).toBeVisible()
  await other.locator('.conflict-banner').getByRole('button', { name: '保留本地副本' }).click()
  await expect(other.getByLabel('工作空间标题')).toHaveValue(/本地副本/)
  const docs = await state(other)
  expect(docs).toHaveLength(2)
  expect(docs.find(doc => doc.id === originalId)?.title).toBe('另一个标签页的新版本')
  await other.close()
})

test('quota failures roll back storage, never claim saved, and can retry', async ({ page }) => {
  await sample(page)
  const title = (await state(page))[0].title
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === 'workspaces') { IDBObjectStore.prototype.put = put; throw new DOMException('Test quota exceeded', 'QuotaExceededError') }
      return put.apply(this, args)
    }
  })
  await page.getByLabel('工作空间标题').fill('容量恢复后再保存')
  await page.getByLabel('工作空间标题').press('Tab')
  await expect(page.locator('.save-status')).toHaveText('保存失败')
  expect((await state(page))[0].title).toBe(title)
  await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved(page)
  expect((await state(page))[0].title).toBe('容量恢复后再保存')
})

test('import preflight rejects future schemas and preserves legacy entry', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('input[type=file][accept=".json"]')
  await input.setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') })
  await expect(page.locator('.error-banner')).toBeVisible()
  expect(await state(page)).toHaveLength(0)
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  const old = { schemaVersion: 1, id: 'old-backup', title: '旧版备份', scenario: 'course', summary: '', sources: [], nodes: [], relations: [], path: [], questions: [], attempts: [], createdAt: 10, updatedAt: 20 }
  await input.setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) })
  await expect(page.getByRole('dialog', { name: '导入预检' })).toBeVisible()
  expect(await state(page)).toHaveLength(0)
  await page.getByRole('button', { name: '确认导入', exact: true }).click(); await saved(page)
  expect((await state(page))[0]).toMatchObject({ schemaVersion: 2, views: [expect.anything()] })
  expect((await state(page))[0].id).not.toBe(old.id)
  await page.getByRole('link', { name: /经典导图/ }).click()
  await expect(page).toHaveURL(/editor=classic/)
  await expect(page.locator('.ol-app')).toHaveCount(0)
  await expect(page.locator('body')).toContainText('中心主题')
})

test('controlled AI previews cannot overwrite edits; cancellation discards late responses', async ({ page }) => {
  await sample(page)
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  await page.getByLabel(/API Key/).fill('synthetic-test-not-a-real-secret')
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.route('**/api/explain', route => route.fulfill({ json: { explanation: '受控建议，仅用于协议验收' } }))
  const original = (await state(page))[0].nodes[0].body
  await page.getByRole('button', { name: '生成建议', exact: true }).click()
  await expect(page.locator('.ai-draft')).toBeVisible()
  expect((await state(page))[0].nodes[0].body).toBe(original)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await change(page, '解释', '生成后新增的人工解释')
  await page.getByRole('button', { name: '采用解释', exact: true }).click()
  await expect(page.locator('.error-banner')).toContainText('原文已被修改')
  expect((await state(page))[0].nodes[0].body).toBe('生成后新增的人工解释')
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  await page.getByRole('button', { name: '放弃', exact: true }).click()
  await page.unroute('**/api/explain')
  let release: (() => Promise<void>) | undefined
  await page.route('**/api/explain', route => new Promise<void>(resolve => {
    release = async () => { await route.fulfill({ json: { explanation: '取消后迟到的受控建议' } }).catch(() => {}); resolve() }
  }))
  await page.getByRole('button', { name: '生成建议', exact: true }).click()
  await expect.poll(() => !!release).toBe(true)
  await page.getByRole('button', { name: '取消请求', exact: true }).click()
  await release!()
  await expect(page.locator('.busy-bar')).toHaveCount(0)
  await expect(page.locator('.ai-draft')).toHaveCount(0)
  expect(JSON.stringify(await state(page))).not.toContain('synthetic-test-not-a-real-secret')

  await page.getByRole('button', { name: 'OneLook 首页', exact: true }).click()
  await page.getByRole('button', { name: '新建空间', exact: true }).click()
  await page.getByLabel('空间名称', { exact: true }).fill('AI 初稿协议验收')
  await page.getByRole('button', { name: '创建工作空间', exact: false }).click(); await saved(page)
  await page.route('**/api/generate', route => route.fulfill({ json: { generated: generatedFixture() } }))
  await page.getByRole('button', { name: '生成初稿', exact: true }).click()
  await expect(page.getByRole('heading', { name: '初稿预览' })).toBeVisible()
  await page.getByRole('button', { name: '采用这份初稿', exact: true }).click(); await saved(page)
  await expect(page.locator('.detail-panel')).toContainText('AI 生成 · 待核实')
  await noPageOverflow(page)
})

test('folder and GitHub imports keep manifests, and the AI understanding report stays verifiable', async ({ page }) => {
  await sample(page)
  await page.getByRole('button', { name: /资料与依据/ }).click()

  await page.route('**/api/repo', route => route.fulfill({
    json: {
      repo: 'demo/project',
      ref: 'abc123def456',
      files: [
        { path: 'src/index.ts', text: 'export const entry = true' },
        { path: 'README.md', text: '# Demo project' },
      ],
      skipped: [{ path: 'pnpm-lock.yaml', reason: '不支持的类型或位于跳过目录' }],
    },
  }))
  await page.getByLabel('GitHub 仓库地址').fill('https://github.com/demo/project')
  await page.getByRole('button', { name: '从 GitHub 导入', exact: true }).click()
  await expect(page.locator('.import-report')).toContainText('已导入 2 个文件')
  await expect(page.locator('.import-report')).toContainText('pnpm-lock.yaml')
  await saved(page)
  const repoSources = (await state(page))[0].sources.filter(s => s.url === 'https://github.com/demo/project')
  expect(repoSources).toHaveLength(2)
  expect(repoSources[0].revision).toBe('abc123def456')

  const fixtureDir = join(tmpdir(), `onelook-folder-${crypto.randomUUID()}`)
  mkdirSync(join(fixtureDir, 'src'), { recursive: true })
  mkdirSync(join(fixtureDir, 'node_modules', 'lib'), { recursive: true })
  writeFileSync(join(fixtureDir, 'src', 'index.ts'), 'const entry = true')
  writeFileSync(join(fixtureDir, 'README.md'), '# Demo')
  writeFileSync(join(fixtureDir, 'node_modules', 'lib', 'index.js'), 'vendored')
  writeFileSync(join(fixtureDir, 'logo.png'), 'img')
  await page.locator('input[type=file][webkitdirectory]').setInputFiles(fixtureDir)
  await expect(page.locator('.import-report').last()).toContainText('已导入 2 个文件')
  await expect(page.locator('.import-report').last()).toContainText('node_modules')
  await saved(page)
  const all = (await state(page))[0].sources
  expect(all.some(s => s.filePath?.endsWith('src/index.ts'))).toBe(true)
  expect(all.some(s => s.filePath?.includes('node_modules'))).toBe(false)
  rmSync(fixtureDir, { recursive: true, force: true })

  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  await page.getByLabel(/API Key/).fill('synthetic-test-not-a-real-secret')
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  const sourceId = (await state(page))[0].sources[0].id
  const quote = (await state(page))[0].sources[0].text.slice(0, 12)
  await page.route('**/api/understand', route => route.fulfill({
    json: {
      understanding: {
        documentType: 'article',
        summary: '受控理解报告',
        coverage: { analyzedSourceIds: [sourceId], skippedSourceIds: [], omissions: ['未读取运行时数据'] },
        entities: [
          { id: 'entity-a', title: '受控实体', kind: 'concept', description: '有原文支持。', certainty: 'supported', citations: [{ sourceId, quote }] },
          { id: 'entity-b', title: '推断实体', kind: 'concept', description: '推断内容。', certainty: 'inferred', citations: [] },
        ],
        relations: [{ id: 'rel-a', from: 'entity-a', to: 'entity-b', semantic: 'causes', label: '导致', certainty: 'inferred', citations: [] }],
        suggestedViews: [{ title: '逻辑图', scenario: 'architecture', kind: 'map', reason: '结构化' }],
        gaps: ['缺少基准数据'],
        questions: [{ prompt: '检查题', answer: '参考答案' }],
      },
    },
  }))
  await page.getByRole('button', { name: /关系地图/ }).first().click()
  await page.getByRole('button', { name: '理解材料', exact: true }).click()
  await expect(page.getByRole('heading', { name: /材料理解报告/ })).toBeVisible()
  await expect(page.locator('.certainty-chip.supported')).toContainText('原文支持')
  await expect(page.locator('.certainty-chip.inferred').first()).toContainText('AI 推断')
  await expect(page.locator('.ol-modal')).toContainText('导致')
  await page.locator('.citation-chip').first().click()
  await expect(page.locator('.source-original mark')).toContainText(quote)
  expect(JSON.stringify(await state(page))).not.toContain('synthetic-test-not-a-real-secret')
  await noPageOverflow(page)
})
