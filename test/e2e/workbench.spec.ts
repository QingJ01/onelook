import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
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
  await expect(page.getByLabel('讲解标题')).toBeVisible()
  await saved(page)
}

/** The four top-level sections: 资料 / 结构 / 讲解 / 检验. */
async function nav(page: Page, name: '资料' | '结构' | '讲解' | '检验') {
  await page.locator('.workbench-nav .nav-item').filter({ hasText: new RegExp(`^${name}`) }).click()
}

async function structure(page: Page, name: '图' | '链路与决策' | '方案与验收' | '管理视图') {
  await nav(page, '结构')
  await page.getByRole('tab', { name, exact: true }).click()
}

const formNames = { graph: '关系图', tree: '思维图', flow: '流程图', matrix: '对比表', timeline: '时间线' } as const
async function setForm(page: Page, form: keyof typeof formNames) {
  await page.getByRole('radiogroup', { name: '呈现形式' }).getByRole('radio', { name: formNames[form], exact: true }).click()
  await saved(page)
}

/** On narrow screens the secondary header actions fold into the “更多操作” menu. */
async function headerAction(page: Page, role: 'button' | 'link', name: string | RegExp) {
  const target = page.getByRole(role, { name, exact: typeof name === 'string' })
  if (!(await target.isVisible())) await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await target.click()
}

async function enableAI(page: Page) {
  await headerAction(page, 'button', 'AI 设置')
  await page.getByLabel(/API Key/).fill('synthetic-test-not-a-real-secret')
  await page.getByRole('checkbox', { name: /我同意/ }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
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
  await structure(page, '链路与决策')
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
  await structure(page, '链路与决策')
  await expect(page.getByLabel('消息 / 操作')).toHaveValue('提交登录信息（已人工整理）')
  await page.setViewportSize({ width: 1600, height: 1022 })
  await noPageOverflow(page)
  await page.locator('.workbench-nav .node-list-item').last().scrollIntoViewIfNeeded()
  await expect(page.locator('.workbench-nav .node-list-item').last()).toBeInViewport()
})

test('product separates claims and requires evidence before passing acceptance', async ({ page }) => {
  await sample(page, 1)
  await structure(page, '方案与验收')
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
  await nav(page, '检验')
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

test('views share content but keep form and drag positions independent, then render a selected view', async ({ page }) => {
  await sample(page)
  const initial = (await state(page))[0]
  await structure(page, '管理视图')
  await page.getByLabel('视图名称', { exact: true }).fill('登录另一张图')
  await page.getByLabel('新视图的形式').selectOption('graph')
  await page.getByRole('button', { name: '创建视图', exact: true }).click(); await saved(page)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await change(page, '解释', '这段正文由两个视图共享。')
  const node = page.locator('.graph-node').first()
  await node.scrollIntoViewIfNeeded()
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + 45, box.y + 40); await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 65, { steps: 5 }); await page.mouse.up(); await saved(page)
  const doc = (await state(page))[0]
  const created = doc.views.at(-1)!
  expect(doc.views).toHaveLength(initial.views.length + 1)
  expect(created).toMatchObject({ title: '登录另一张图', form: 'graph' })
  expect(Object.keys(created.positions)).toEqual([doc.nodes[0].id])
  expect(doc.views[0].positions).toEqual(initial.views[0].positions)
  await setForm(page, 'tree')
  await expect(page.locator('.semantic-graph.form-tree')).toBeVisible()
  const switched = (await state(page))[0]
  expect(switched.views.at(-1)).toMatchObject({ form: 'tree', positions: created.positions })
  expect(switched.views[0].form).toBe(initial.views[0].form)
  await page.getByLabel('当前视图', { exact: true }).selectOption(doc.views[0].id)
  await expect(page.getByLabel('解释', { exact: true })).toHaveValue('这段正文由两个视图共享。')
  await page.getByRole('button', { name: '精修图', exact: true }).click()
  await page.getByRole('button', { name: '生成视图', exact: true }).click()
  await expect(page.getByTitle('Archify 隔离交互视图')).toBeVisible({ timeout: 30_000 })
  expect(await page.getByTitle('Archify 隔离交互视图').getAttribute('sandbox')).toBe('allow-scripts')
  await noPageOverflow(page)
})

test('source updates retain exact historical citations and locally extract text PDF', async ({ page }) => {
  await sample(page)
  await nav(page, '资料')
  await page.getByRole('button', { name: '更新原文', exact: true }).click()
  await page.getByLabel('原文', { exact: true }).fill('当前资料已更新，不改变旧引用。')
  await page.getByRole('button', { name: '保存资料', exact: true }).click(); await saved(page)
  await nav(page, '结构')
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
  await change(page, '讲解标题', '另一个标签页的新版本')
  await other.bringToFront()
  await expect(other.locator('.conflict-banner')).toBeVisible()
  await other.locator('.conflict-banner').getByRole('button', { name: '保留本地副本' }).click()
  await expect(other.getByLabel('讲解标题')).toHaveValue(/本地副本/)
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
  await page.getByLabel('讲解标题').fill('容量恢复后再保存')
  await page.getByLabel('讲解标题').press('Tab')
  await expect(page.locator('.save-status')).toHaveText('保存失败')
  expect((await state(page))[0].title).toBe(title)
  await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved(page)
  expect((await state(page))[0].title).toBe('容量恢复后再保存')
})

test('import preflight rejects future schemas and preserves legacy entry', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('input[type=file][accept=".json,.olook"]')
  await input.setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') })
  await expect(page.locator('.error-banner')).toBeVisible()
  expect(await state(page)).toHaveLength(0)
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  const old = { schemaVersion: 1, id: 'old-backup', title: '旧版备份', scenario: 'course', summary: '', sources: [], nodes: [], relations: [], path: [], questions: [], attempts: [], createdAt: 10, updatedAt: 20 }
  await input.setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) })
  await expect(page.getByRole('dialog', { name: '导入预检' })).toBeVisible()
  expect(await state(page)).toHaveLength(0)
  await page.getByRole('button', { name: '确认导入', exact: true }).click(); await saved(page)
  expect((await state(page))[0]).toMatchObject({ schemaVersion: 3, template: 'course', views: [expect.anything()], story: [] })
  expect((await state(page))[0].id).not.toBe(old.id)
  await headerAction(page, 'link', /经典导图/)
  await expect(page).toHaveURL(/editor=classic/)
  await expect(page.locator('.ol-app')).toHaveCount(0)
  await expect(page.locator('body')).toContainText('中心主题')
})

test('controlled AI previews cannot overwrite edits; cancellation discards late responses', async ({ page }) => {
  await sample(page)
  await nav(page, '结构')
  await enableAI(page)
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
  await page.getByRole('button', { name: '新建讲解', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('AI 初稿协议验收')
  await page.getByRole('button', { name: '创建讲解', exact: false }).click(); await saved(page)
  await page.route('**/api/generate', route => route.fulfill({ json: { generated: generatedFixture() } }))
  await page.getByRole('button', { name: '生成初稿', exact: true }).click()
  await expect(page.getByRole('heading', { name: '初稿预览' })).toBeVisible()
  await page.getByRole('button', { name: '采用这份初稿', exact: true }).click(); await saved(page)
  await expect(page.locator('.detail-panel')).toContainText('AI 生成 · 待核实')
  const drafted = (await state(page)).find(doc => doc.title === 'Generated workspace')!
  expect(drafted.story.map(step => [step.reveal, step.provenance])).toEqual([[['generated-a'], 'ai']])
  expect(drafted.nodes[0].certainty).toBe('inferred')
  await noPageOverflow(page)
})

test('folder and GitHub imports keep manifests, and the AI understanding report stays verifiable', async ({ page }) => {
  await sample(page)
  await nav(page, '资料')

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

  await enableAI(page)
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
        suggestedViews: [{ title: '逻辑图', form: 'graph', reason: '结构化' }],
        gaps: ['缺少基准数据'],
        questions: [{ prompt: '检查题', answer: '参考答案' }],
      },
    },
  }))
  await nav(page, '结构')
  await page.getByRole('button', { name: '理解材料', exact: true }).click()
  await expect(page.getByRole('heading', { name: /材料理解报告/ })).toBeVisible()
  await expect(page.locator('.ol-modal .certainty-chip.supported')).toContainText('原文支持')
  await expect(page.locator('.ol-modal .certainty-chip.inferred').first()).toContainText('AI 推断')
  await expect(page.locator('.ol-modal')).toContainText('导致')
  await expect(page.locator('.ol-modal')).toContainText('关系图 · 逻辑图')
  await page.locator('.citation-chip').first().click()
  await expect(page.locator('.source-original mark')).toContainText(quote)
  expect(JSON.stringify(await state(page))).not.toContain('synthetic-test-not-a-real-secret')
  await noPageOverflow(page)
})

test('authors a five-step explanation from scratch, checks clarity and plays it with the keyboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建讲解', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('HTTP 缓存')
  await page.getByLabel(/要讲清的问题/).fill('浏览器怎么决定用不用缓存？')
  await page.getByRole('button', { name: '创建讲解', exact: false }).click(); await saved(page)
  for (const title of ['缓存副本', '新鲜度', '重新验证']) {
    await page.getByRole('button', { name: '+ 对象', exact: true }).click(); await saved(page)
    await change(page, '标题', title)
  }
  await nav(page, '讲解')
  await expect(page.getByLabel('要讲清的问题')).toHaveValue('浏览器怎么决定用不用缓存？')
  await expect(page.locator('.clarity-panel')).toContainText('缺一句话结论')
  await expect(page.locator('.clarity-panel')).toContainText('还没有讲解步骤')
  await expect(page.getByRole('button', { name: '播放', exact: true }).first()).toBeDisabled()

  const steps: [string, string | undefined][] = [['浏览器先留一份副本', '缓存副本'], ['副本有保质期', '新鲜度'], ['过期了先问服务器', '重新验证'], ['没变就继续用旧的', undefined], ['三步连起来看', undefined]]
  for (const [title, reveal] of steps) {
    await page.getByRole('button', { name: '+ 一步', exact: true }).click(); await saved(page)
    await change(page, '这一步的要点', title)
    if (reveal) { await page.locator('.story-notes fieldset').first().getByLabel(reveal).check(); await saved(page) }
  }
  await change(page, '讲述', '把前面三个对象连起来讲一遍。')
  await change(page, '一句话结论', '有副本、没过期就直接用；过期了先重新验证。')
  const doc = (await state(page))[0]
  expect(doc.story.map(step => step.title)).toEqual(steps.map(([title]) => title))
  expect(doc.story.map(step => step.reveal.length)).toEqual([1, 1, 1, 0, 0])
  expect(doc.takeaway).toBe('有副本、没过期就直接用；过期了先重新验证。')
  await expect(page.locator('.clarity-panel summary')).toContainText('4 项待看')
  await expect(page.locator('.clarity-panel')).not.toContainText('缺一句话结论')
  await expect(page.locator('.clarity-panel')).toContainText('第 4 步没有讲述，也没有指向任何对象')
  await expect(page.locator('.clarity-panel')).toContainText('「缓存副本」没有引用，也没有标为推断')

  // While authoring, objects that have not appeared yet stay faintly visible; a step can point at one already shown.
  await page.locator('.story-steps li button').first().click()
  await expect(page.locator('.story-stage .diagram-node.is-ghost')).toHaveCount(2)
  await page.locator('.story-steps li button').nth(3).click()
  await page.locator('.story-notes fieldset').nth(1).getByLabel('重新验证').check(); await saved(page)
  expect((await state(page))[0].story[3].focus).toEqual([doc.nodes[2].id])
  await expect(page.locator('.clarity-panel summary')).toContainText('3 项待看')

  await page.locator('.story-steps li button').first().click()
  await page.getByRole('button', { name: '播放', exact: true }).first().click()
  const play = page.locator('.story-play')
  await expect(play).toBeVisible()
  await expect(page.locator('.workbench-nav')).toBeHidden()
  await expect(play.locator('.play-count')).toHaveText('1 / 5')
  await expect(play.locator('.play-top')).toContainText('浏览器怎么决定用不用缓存？')
  await expect(play.locator('.diagram-node.is-hidden')).toHaveCount(2)
  await page.keyboard.press('ArrowRight')
  await expect(play.locator('.play-count')).toHaveText('2 / 5')
  await expect(play.locator('.diagram-node.is-hidden')).toHaveCount(1)
  await expect(play.locator('.play-notes h2')).toHaveText('副本有保质期')
  await play.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(play.locator('.diagram-node.is-hidden')).toHaveCount(0)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await expect(play.locator('.play-count')).toHaveText('5 / 5')
  await expect(play.locator('.play-takeaway')).toContainText('过期了先重新验证')
  await expect(play.getByRole('button', { name: '下一步', exact: true })).toBeDisabled()
  await page.keyboard.press('ArrowLeft')
  await expect(play.locator('.play-count')).toHaveText('4 / 5')
  await expect(play.locator('.diagram-node.is-focus')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.story-page')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: /HTTP 缓存/ }).first().click()
  await expect(page.locator('.story-steps li')).toHaveCount(5)
  await noPageOverflow(page)
})

test('the same content switches between graph, mind map, flow, table and timeline without overlap', async ({ page }) => {
  await sample(page, 2)
  await nav(page, '结构')
  const overlapping = () => page.locator('.diagram-node').evaluateAll(nodes => {
    const boxes = nodes.map(node => node.getBoundingClientRect())
    return boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1))
  })
  for (const form of ['graph', 'tree', 'flow', 'timeline'] as const) {
    await setForm(page, form)
    await expect(page.locator(`.semantic-graph.form-${form}`)).toBeVisible()
    await expect(page.locator('.diagram-node')).toHaveCount(6)
    await page.waitForTimeout(600)
    expect(await overlapping()).toBe(false)
    expect((await state(page))[0].views[0].form).toBe(form)
  }
  await expect(page.locator('.diagram-axis .tick')).toHaveCount(6)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await change(page, '解释', '换了形式，正文还是同一份。')
  await setForm(page, 'matrix')
  await expect(page.locator('.matrix-table tbody tr')).toHaveCount(6)
  await expect(page.locator('.matrix-table tbody tr').first()).toContainText('换了形式，正文还是同一份。')
  await expect(page.locator('.matrix-table thead')).toContainText('常见误区')
  await noPageOverflow(page)
  await page.reload()
  await page.getByRole('button', { name: /计算机网络/ }).first().click()
  await nav(page, '结构')
  await expect(page.locator('.matrix-table tbody tr')).toHaveCount(6)

  // The second view of the example is a mind map of the same six objects.
  const doc = (await state(page))[0]
  await page.getByLabel('当前视图', { exact: true }).selectOption(doc.views[1].id)
  await expect(page.locator('.semantic-graph.form-tree .diagram-node')).toHaveCount(6)
  expect(doc.views[1].nodeIds).toEqual(doc.views[0].nodeIds)
})

test('step transitions animate in play mode and fall back to plain switching with reduced motion', async ({ page, browser }) => {
  await sample(page)
  await page.getByRole('button', { name: '播放', exact: true }).first().click()
  const play = page.locator('.story-play')
  await page.keyboard.press('ArrowRight')
  await expect(play.locator('.play-count')).toHaveText('2 / 6')
  // The step points at three connected objects: a marker runs along the two edges between them.
  await expect(play.locator('.diagram-token')).toHaveCount(2)
  await expect(play.locator('.diagram-node.is-focus')).toHaveCount(3)
  await expect(play.locator('.diagram-node.is-hidden')).toHaveCount(2)
  await expect.poll(() => play.locator('.diagram-node.is-hidden').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).opacity))).toEqual(['0', '0'])
  expect(await play.locator('.diagram-camera').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.6s')
  const before = await play.locator('.diagram-camera').evaluate(node => getComputedStyle(node).transform)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => play.locator('.diagram-camera').evaluate(node => getComputedStyle(node).transform)).not.toBe(before)
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight')
  await expect(play.locator('.sequence-scroll')).toContainText('返回统一认证失败')
  await page.keyboard.press('ArrowRight')
  await expect(play.locator('.stage-card')).toContainText('放弃的备选')
  await expect(play.locator('.play-takeaway')).toBeVisible()

  const calm = await browser.newContext({ reducedMotion: 'reduce', viewport: page.viewportSize()!, baseURL: new URL(page.url()).origin })
  const quiet = await calm.newPage()
  await sample(quiet)
  await quiet.getByRole('button', { name: '播放', exact: true }).first().click()
  await quiet.keyboard.press('ArrowRight')
  await expect(quiet.locator('.story-play .play-count')).toHaveText('2 / 6')
  await expect(quiet.locator('.story-play .diagram-node.is-focus')).toHaveCount(3)
  await expect(quiet.locator('.story-play .diagram-token')).toHaveCount(0)
  expect(await quiet.locator('.story-play .diagram-camera').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s')
  expect(await quiet.locator('.story-play .diagram-node').first().evaluate(node => getComputedStyle(node).transitionDuration)).toMatch(/^0s(, 0s)*$/)
  await calm.close()
})

test('exports a single HTML player that runs offline with no network requests', async ({ page, context }) => {
  await sample(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出播放页', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/\.html$/)
  const file = join(tmpdir(), `onelook-player-${crypto.randomUUID()}.html`)
  await download.saveAs(file)
  const html = readFileSync(file, 'utf8')
  expect(html).toContain("default-src 'none'")

  await context.setOffline(true)
  const player = await context.newPage()
  const requests: string[] = [], errors: string[] = []
  player.on('request', request => requests.push(request.url()))
  player.on('pageerror', error => errors.push(String(error)))
  await player.goto(`file://${file}`)
  await expect(player.locator('header h1')).toHaveText('一次登录请求，如何抵达系统深处')
  await expect(player.locator('.counter')).toHaveText('1 / 6')
  await expect(player.locator('aside h2')).toHaveText('请求从浏览器出发，到达认证接口')
  await expect(player.locator('.node.hidden')).toHaveCount(4)
  await expect(player.locator('.check')).toHaveCount(1)
  await player.keyboard.press('ArrowRight')
  await expect(player.locator('.counter')).toHaveText('2 / 6')
  await expect(player.locator('.node.hidden')).toHaveCount(2)
  await expect(player.locator('.node.focus')).toHaveCount(3)
  // Objects that have not been introduced must be invisible, not merely dimmed.
  await expect.poll(() => player.locator('.node.hidden').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).opacity))).toEqual(['0', '0'])
  await expect(player.locator('.node.hidden.dim')).toHaveCount(0)
  await player.getByRole('button', { name: '下一步' }).click()
  await player.getByRole('button', { name: '下一步' }).click()
  await expect(player.locator('.node.hidden')).toHaveCount(0)
  await player.getByRole('button', { name: '下一步' }).click()
  await expect(player.locator('.block')).toContainText('返回统一认证失败')
  await player.getByRole('button', { name: '下一步' }).click()
  await expect(player.locator('.takeaway')).toContainText('登录成功不等于获得授权')
  await expect(player.getByRole('button', { name: '下一步' })).toBeDisabled()
  expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
  expect(requests.filter(url => !url.startsWith('file://'))).toEqual([])
  expect(requests).toHaveLength(1)
  await player.close()
  await context.setOffline(false)
  rmSync(file, { force: true })
})

test('a controlled AI outline is previewed, edited and adopted; a rewritten step cannot overwrite newer edits', async ({ page }) => {
  await sample(page, 2)
  await enableAI(page)
  const before = (await state(page))[0]
  const [a, b, c] = before.nodes.map(node => node.id)
  const quote = before.sources[0].text.slice(0, 10)
  let sent: any
  await page.route('**/api/outline', route => {
    sent = route.request().postDataJSON()
    return route.fulfill({ json: { outline: {
      question: '受控提纲的问题', takeaway: '受控提纲的结论', audience: '',
      steps: [
        { title: '受控第一步', narration: '先看起点。', form: 'timeline', reveal: [a], focus: [a], citations: [{ sourceId: before.sources[0].id, quote }] },
        { title: '受控第二步', narration: '推断：再看序号。', form: 'timeline', reveal: [b], focus: [a, b], citations: [] },
        { title: '要去掉的一步', narration: '多余。', form: 'matrix', reveal: [c], focus: [c], citations: [] },
      ],
    } } })
  })
  await page.getByRole('button', { name: '生成提纲', exact: true }).click()
  await expect(page.getByRole('heading', { name: '讲解提纲预览' })).toBeVisible()
  expect(sent.settings.apiKey).toBe('synthetic-test-not-a-real-secret')
  expect((await state(page))[0].story).toEqual(before.story)
  await page.getByLabel('第 1 步要点').fill('改过的第一步')
  await page.locator('.outline-list li').nth(2).getByRole('button', { name: '去掉' }).click()
  await expect(page.locator('.outline-list li')).toHaveCount(2)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '采用这份提纲', exact: true }).click(); await saved(page)
  const adopted = (await state(page))[0]
  expect(adopted).toMatchObject({ question: '受控提纲的问题', takeaway: '受控提纲的结论' })
  expect(adopted.story.map(step => [step.title, step.provenance, step.citations.length])).toEqual([['改过的第一步', 'ai', 1], ['受控第二步', 'ai', 0]])
  expect(adopted.nodes).toEqual(before.nodes)
  const timeline = adopted.views.find(view => view.id === adopted.story[0].stageId)!
  expect(timeline.form).toBe('timeline')
  await expect(page.locator('.story-notes')).toContainText('AI 生成 · 待核实')
  await expect(page.locator('.story-stage .semantic-graph.form-timeline')).toBeVisible()

  await page.route('**/api/restep', route => route.fulfill({ json: { narration: '类比，非原文：像给每页书编页码。' } }))
  await page.getByRole('button', { name: '打个比方', exact: true }).click()
  await expect(page.locator('.story-notes .ai-draft')).toContainText('像给每页书编页码')
  expect((await state(page))[0].story[0].narration).toBe('先看起点。')
  await change(page, '讲述', '生成之后我自己改的讲述。')
  await page.getByRole('button', { name: '采用这段讲述', exact: true }).click()
  await expect(page.locator('.error-banner')).toContainText('已被修改')
  expect((await state(page))[0].story[0]).toMatchObject({ narration: '生成之后我自己改的讲述。', provenance: 'user' })
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  await page.getByRole('button', { name: '放弃', exact: true }).click()
  await page.getByRole('button', { name: '更简单', exact: true }).click()
  await page.getByRole('button', { name: '采用这段讲述', exact: true }).click(); await saved(page)
  expect((await state(page))[0].story[0]).toMatchObject({ narration: '类比，非原文：像给每页书编页码。', provenance: 'ai' })
  expect(JSON.stringify(await state(page))).not.toContain('synthetic-test-not-a-real-secret')
  await noPageOverflow(page)
})

test('a wrong answer leads back to its step, and the question can then be answered again', async ({ page }) => {
  await sample(page, 2)
  await nav(page, '检验')
  await page.getByLabel('我的独立回答').fill('是数据包的编号')
  await page.getByRole('button', { name: '核对参考答案' }).click()
  await page.getByLabel('错因 / 本次反思').fill('把字节序号当成了包编号')
  await page.getByRole('button', { name: /^还需回顾/ }).click(); await saved(page)
  await page.getByRole('button', { name: '回到第 2 步再看一遍', exact: true }).click()
  await expect(page.locator('.story-steps button[aria-current="step"]')).toContainText('序号给每个字节一个位置')
  await expect(page.locator('.story-notes')).toContainText('TCP 序号标识的是数据包编号还是字节位置')
  await nav(page, '检验')
  await page.getByLabel('我的独立回答').fill('标识字节流里的位置')
  await page.getByRole('button', { name: '核对参考答案' }).click()
  await page.getByRole('button', { name: /^自评理解/ }).click(); await saved(page)
  const doc = (await state(page))[0]
  expect(doc.attempts.map(attempt => attempt.rating)).toEqual(['again', 'good'])
  expect(doc.questions[0].stepId).toBe(doc.story[1].id)
  await expect(page.locator('.attempt-card')).toHaveCount(2)
  await noPageOverflow(page)
})

test('a stored V2 workspace is upgraded in the browser without losing content, and a classic map imports one way', async ({ page }) => {
  await page.goto('/api/health')
  const v2 = {
    schemaVersion: 2, revision: 2, id: 'old-v2', title: '旧版空间', scenario: 'course', summary: '旧摘要',
    sources: [{ id: 'src', title: '旧资料', text: '旧资料的原文片段', version: 1, createdAt: 1, versions: [] }],
    nodes: ['甲', '乙'].map((title, index) => ({ id: `n${index}`, title, kind: 'concept', body: `${title}的解释`, example: '', pitfall: '', notes: '我的笔记', acceptance: '', citations: index ? [] : [{ sourceId: 'src', quote: '原文片段', version: 1, start: 4, end: 8 }], provenance: 'user' })),
    relations: [{ id: 'r', from: 'n0', to: 'n1', kind: 'prerequisite', label: '先修' }],
    views: [{ id: 'v', title: '旧视图', scenario: 'course', kind: 'learning', nodeIds: ['n0', 'n1'], path: ['n0', 'n1'], positions: { n0: { x: 40, y: 50 } } }],
    flows: [], decisions: [], productItems: [],
    questions: [{ id: 'q', nodeId: 'n1', prompt: '乙是什么？', answer: '乙的解释', relatedNodeIds: [] }],
    attempts: [{ id: 'a', questionId: 'q', answer: '我的回答', rating: 'good', at: 100, dueAt: 200, errorReason: '' }],
    createdAt: 1, updatedAt: 2,
  }
  await page.evaluate(doc => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('OneLookWorkbench', 20)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('workspaces', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      const revisions = db.createObjectStore('revisions', { keyPath: 'id' })
      revisions.createIndex('workspaceId', 'workspaceId'); revisions.createIndex('createdAt', 'createdAt')
      const backups = db.createObjectStore('migrationBackups', { keyPath: 'id' })
      backups.createIndex('workspaceId', 'workspaceId'); backups.createIndex('createdAt', 'createdAt')
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('workspaces', 'readwrite')
      tx.objectStore('workspaces').put(doc)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  }), v2)
  await page.goto('/')
  await page.getByRole('button', { name: /旧版空间/ }).first().click()
  await expect(page.locator('.story-steps li')).toHaveCount(2)
  await expect(page.locator('.clarity-panel')).toContainText('还没写要讲清的问题')
  const migrated = (await state(page))[0]
  expect(migrated).toMatchObject({ schemaVersion: 3, template: 'course', summary: '旧摘要', revision: 2 })
  expect(migrated.nodes.map(node => [node.title, node.notes, node.certainty])).toEqual([['甲', '我的笔记', 'supported'], ['乙', '我的笔记', 'unverified']])
  expect(migrated.views[0]).toMatchObject({ form: 'graph', positions: { n0: { x: 40, y: 50 } } })
  expect(migrated.story.map(step => [step.title, step.reveal])).toEqual([['甲', ['n0']], ['乙', ['n1']]])
  expect(migrated.questions[0].stepId).toBe(migrated.story[1].id)
  expect(migrated.attempts).toEqual(v2.attempts)
  const backups = await page.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open('OneLookWorkbench')
    request.onsuccess = () => { const db = request.result, rows = db.transaction('migrationBackups').objectStore('migrationBackups').getAll(); rows.onsuccess = () => { db.close(); resolve(rows.result) }; rows.onerror = () => reject(rows.error) }
    request.onerror = () => reject(request.error)
  }))
  expect(backups).toHaveLength(1)
  expect(backups[0].snapshot).toEqual(v2)
  await nav(page, '结构')
  await expect(page.locator('.detail-panel')).toContainText('甲的解释')
  await page.getByRole('button', { name: '播放', exact: true }).first().click()
  await expect(page.locator('.story-play .play-notes')).toContainText('甲的解释')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'OneLook 首页', exact: true }).click()
  const classic = { version: '1.0.0', app: 'OneLook', document: { id: 'c', name: '经典导图样例', layout: 'mind', theme: 'light', createdAt: 1, updatedAt: 2, version: '1.0.0', root: { id: 'r', text: '中心主题', isExpanded: true, children: [
    { id: 'a', text: '分支一', isExpanded: true, children: [{ id: 'a1', text: '叶子', isExpanded: true, children: [] }] },
    { id: 'b', text: '分支二', isExpanded: true, children: [] },
  ] } } }
  await page.locator('input[type=file][accept=".json,.olook"]').setInputFiles({ name: 'classic.olook', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(classic)) })
  await expect(page.getByRole('dialog', { name: '导入预检' })).toContainText('经典导图文件')
  await page.getByRole('button', { name: '确认导入', exact: true }).click(); await saved(page)
  const imported = (await state(page)).find(doc => doc.title === '经典导图样例')!
  expect(imported.views[0].form).toBe('tree')
  expect(imported.nodes.map(node => node.title)).toEqual(['中心主题', '分支一', '叶子', '分支二'])
  expect(imported.story.map(step => step.title)).toEqual(['中心主题', '分支一'])
  await expect(page.locator('.story-stage .semantic-graph.form-tree .diagram-node')).toHaveCount(4)
  await noPageOverflow(page)
})
