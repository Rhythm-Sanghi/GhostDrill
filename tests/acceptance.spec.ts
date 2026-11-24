import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { sampleReviewJson } from '../src/replay'

async function download(page: Page, name: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()])
  return { filename: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

async function importReplay(page: Page, text: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.getByRole('button', { name: 'Open replay file' }).click(),
  ])
  await chooser.setFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(text) })
}

async function tabTo(page: Page, control: Locator) {
  for (let index = 0; index < 36; index++) {
    if (await control.evaluate((element) => document.activeElement === element)) break
    await page.keyboard.press('Tab')
  }
  await expect(control).toBeFocused()
  await expect(control).toHaveCSS('outline-style', 'solid')
}

test('sample review opens the exact attempts and transfers the corrected review', async ({ page, browser, baseURL }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop'
  if (!desktop) await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  const activate = async (control: Locator) => {
    if (desktop) {
      await tabTo(page, control)
      await page.keyboard.press('Enter')
    } else await control.tap()
  }
  const outcome = page.getByRole('region', { name: 'Drill outcome' })
  const sample = page.getByRole('button', { name: 'Open sample review' })
  await expect(page.getByRole('button', { name: 'Try the warehouse drill' })).toBeInViewport()
  await expect(sample).toBeInViewport()
  await activate(sample)
  await expect(outcome).toBeFocused()
  await expect(outcome.getByText('Verified', { exact: true })).toBeInViewport()
  await expect(outcome.getByRole('status').filter({ hasText: /^Violation$/ })).toBeInViewport()
  await expect(page.getByRole('status').filter({ hasText: 'Sample review opened' })).toContainText('Run 01 rebuilt as Verified')

  const map = page.getByRole('region', { name: 'Service map' })
  const early = outcome.getByRole('button', { name: 'Violation at step 1' })
  await activate(early)
  await expect(map).toBeFocused()
  await expect(map.getByText('Reopen dispatch queue', { exact: true })).toBeVisible()
  await expect(map.getByText('Connector offline', { exact: true })).toBeVisible()
  await expect(map.getByText(/Step 1 · Connector ready before every reopen attempt/)).toBeVisible()
  await activate(map.getByRole('button', { name: 'Back to acceptance checks' }))
  const acceptance = page.getByRole('region', { name: 'Acceptance checks' })
  await expect(acceptance.getByRole('heading', { name: 'Acceptance checks' })).toBeFocused()
  await activate(acceptance.getByRole('button', { name: /Inspect Step 3 · Retry reopening dispatch queue/ }))
  await expect(map.getByText('Retry reopening dispatch queue', { exact: true })).toBeVisible()
  await expect(map.getByText('Connector ready', { exact: true })).toBeVisible()

  await activate(page.getByRole('button', { name: 'Move up: Restore shipping connector' }))
  await expect(outcome.getByRole('status').filter({ hasText: /^Violation$/ })).toHaveCount(1)
  await activate(page.getByRole('button', { name: 'Rerun drill' }))
  await expect(outcome.getByText('Verified', { exact: true })).toBeVisible()
  await expect(outcome.getByRole('status').filter({ hasText: /^Meets requirements$/ })).toHaveCount(1)
  const comparison = page.getByRole('region', { name: 'Run comparison' })
  await activate(outcome.getByRole('button', { name: 'Verified → Verified · View comparison' }))
  await expect(comparison.getByText('The final verdict stayed Verified.')).toBeVisible()
  await expect(comparison.getByText(/Violation → Meets requirements/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  const replay = await download(page, 'Export replay file')
  const report = await download(page, 'Download rehearsal report')
  expect(replay.filename).toBe('ghost-drill-dispatch-review-replay-run-02.json')
  expect(report.text).toContain('Acceptance transition** — Violation → Meets requirements')

  const reviewer = await browser.newContext({ baseURL, viewport: page.viewportSize()!, reducedMotion: 'reduce' })
  try {
    const fresh = await reviewer.newPage()
    await fresh.goto('./')
    await importReplay(fresh, replay.text)
    await expect(fresh.getByRole('status').filter({ hasText: /^Meets requirements$/ })).toHaveCount(1)
    expect(await download(fresh, 'Download rehearsal report')).toEqual(report)
    await fresh.getByRole('button', { name: 'Previous acceptance checks' }).click()
    await fresh.getByRole('button', { name: /Inspect Step 1 · Reopen dispatch queue/ }).click()
    await expect(fresh.getByRole('region', { name: 'Service map' }).getByText('Viewing previous run · Run 01')).toBeVisible()
    await expect(fresh.getByRole('region', { name: 'Service map' }).getByText('Connector offline')).toBeVisible()
  } finally {
    await reviewer.close()
  }
})

test('requirement drafts leave the recording unchanged and reset restores defaults', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Open sample review' }).click()
  const original = await download(page, 'Export replay file')
  const editor = page.getByText('Edit acceptance requirements', { exact: true })
  await editor.click()
  const checkbox = page.getByRole('checkbox', { name: 'Connector ready before every reopen attempt' })
  await checkbox.uncheck()
  expect(await download(page, 'Export replay file')).toEqual(original)
  await expect(page.getByRole('status').filter({ hasText: /^Violation$/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Needs evidence$/ })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Requirements changed' })).toBeVisible()
  await expect(page.getByText('Latest run · None selected')).toBeVisible()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(checkbox).toBeChecked()
  await expect(page.getByRole('region', { name: 'Acceptance checks' })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Scenario' }).selectOption('missing-print-path')
  await page.getByRole('button', { name: 'Try the missing evidence drill' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Needs evidence$/ })).toHaveCount(1)
})

test('the largest imported run ID can rerun, export and reopen with safe numbering', async ({ page }) => {
  await page.goto('./')
  const file = JSON.parse(sampleReviewJson)
  file.formatVersion = 1
  file.scenario = 'dispatch-queue'
  file.latest.steps = file.latest.steps.slice(0, 2)
  delete file.latest.acceptanceChecks
  file.latest.number = Number.MAX_SAFE_INTEGER - 1
  await importReplay(page, JSON.stringify(file))
  await expect(page.getByRole('status').filter({ hasText: /^Unevaluated$/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  const atLimit = await download(page, 'Export replay file')
  expect(JSON.parse(atLimit.text).latest.number).toBe(Number.MAX_SAFE_INTEGER)
  await importReplay(page, atLimit.text)
  await expect(page.getByRole('status').filter({ hasText: 'Replay opened' })).toContainText(String(Number.MAX_SAFE_INTEGER))
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  const replay = await download(page, 'Export replay file')
  expect(JSON.parse(replay.text).previous.number).toBe(1)
  expect(JSON.parse(replay.text).latest.number).toBe(2)
  await importReplay(page, replay.text)
  await expect(page.getByRole('status').filter({ hasText: 'Replay opened' })).toContainText('Run 02 rebuilt as Failed.')
})
