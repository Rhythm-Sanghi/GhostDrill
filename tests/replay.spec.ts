import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: button }).click()])
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

async function openFile(page: Page, text: string) {
  const open = page.getByRole('button', { name: 'Open replay file' })
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    open.click(),
  ])
  await chooser.setFiles({ name: 'rehearsal.json', mimeType: 'application/json', buffer: Buffer.from(text) })
}

async function repairWarehouse(page: Page) {
  await page.getByRole('button', { name: 'Try the warehouse drill' }).click()
  await page.getByRole('button', { name: 'Restore label queue endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Rerun drill' }).click()
}

test('a fresh reviewer rebuilds the warehouse runs, reruns contingencies and downloads the same evidence', async ({ browser, page, baseURL }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop'
  if (!desktop) await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  await repairWarehouse(page)
  const outcome = page.getByRole('region', { name: 'Drill outcome' })
  const rehearse = outcome.getByRole('button', { name: 'Rehearse contingencies' })
  await expect(rehearse).toBeInViewport()
  if (desktop) {
    for (let index = 0; index < 4; index++) await page.keyboard.press('Tab')
    await expect(rehearse).toBeFocused()
    await expect(rehearse).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
  } else {
    await rehearse.tap()
  }
  const results = page.getByRole('region', { name: 'Contingency results' })
  await expect(results.getByRole('heading', { name: 'Contingency results' })).toBeFocused()
  await expect(results.getByRole('article')).toHaveCount(3)
  await expect(results.getByText('Verified', { exact: true })).toBeVisible()
  await expect(results.getByText('Failed', { exact: true })).toBeVisible()
  await expect(results.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Contingency results for Run 02/ })).toContainText('Unknown')

  const exported = await download(page, 'Export replay file')
  const report = await download(page, 'Download rehearsal report')
  expect(exported.name).toBe('ghost-drill-warehouse-outage-replay-run-02.json')
  expect(JSON.parse(exported.text).latest.steps.map(({ id }: { id: string }) => id)).toEqual(['restore-primary', 'restore-queue'])
  expect(report.text).toContain('Failed → Verified')
  expect(report.text).toContain('Original Run 02 verdict — **Verified**')
  expect(report.text).toContain('Missing observation:')

  await page.getByRole('button', { name: 'Remove endpoint restore' }).click()
  const comparison = page.getByRole('region', { name: 'Run comparison' })
  await comparison.getByRole('article', { name: 'Label printing' }).getByRole('group', { name: 'Before · Rollback' }).getByRole('button').click()
  expect(await download(page, 'Export replay file')).toEqual(exported)

  const reviewer = await browser.newContext({ baseURL, viewport: page.viewportSize()!, reducedMotion: 'reduce' })
  try {
    const fresh = await reviewer.newPage()
    await fresh.goto('./')
    await fresh.bringToFront()
    await openFile(fresh, exported.text)
    const replayOutcome = fresh.getByRole('region', { name: 'Drill outcome' })
    await expect(replayOutcome).toBeFocused()
    await expect(replayOutcome.getByText('Local replay · Synthetic rehearsal')).toBeVisible()
    await expect(fresh.getByRole('status').filter({ hasText: 'Replay opened' })).toContainText('Run 02 rebuilt as Verified')
    await replayOutcome.getByRole('button', { name: 'Rehearse contingencies' }).click()
    await expect(fresh.getByRole('region', { name: 'Contingency results' })).toContainText('Primary gateway cannot reach the print service.')
    const proof = fresh.getByRole('region', { name: 'Run comparison' }).getByRole('article', { name: 'Label printing' })
    const map = fresh.getByRole('region', { name: 'Service map' })
    await proof.getByRole('group', { name: 'Before · Rollback' }).getByRole('button').click()
    await expect(map.getByText('Viewing previous run · Run 01')).toBeVisible()
    await expect(map.getByText('gw-backup')).toBeVisible()
    await map.getByRole('button', { name: 'Back to comparison' }).click()
    await proof.getByRole('group', { name: 'After · Rollback' }).getByRole('button').click()
    await expect(map.getByText('gw-primary')).toBeVisible()
    expect(await download(fresh, 'Download rehearsal report')).toEqual(report)
    expect(await fresh.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    await fresh.getByRole('button', { name: 'Reset' }).click()
    await expect(fresh.getByRole('button', { name: 'Export replay file' })).toHaveCount(0)
  } finally {
    await reviewer.close()
  }
})

test('invalid files preserve the workspace and a claimed verdict is rebuilt from the plan', async ({ page }) => {
  await page.goto('./')
  await repairWarehouse(page)
  const original = await download(page, 'Export replay file')
  const parse = () => JSON.parse(original.text)
  const version = parse()
  version.formatVersion = 100
  const invalidAction = parse()
  invalidAction.latest.steps[0].action = 'pause-dispatch'
  const duplicateStep = parse()
  duplicateStep.latest.steps[1] = duplicateStep.latest.steps[0]
  const unknownStep = parse()
  unknownStep.latest.steps[0].id = 'unknown'

  for (const [text, message] of [
    [JSON.stringify(version), 'version is unsupported'],
    [JSON.stringify(invalidAction), 'does not match its supported step'],
    [JSON.stringify(duplicateStep), 'unknown or duplicate step ID'],
    [JSON.stringify(unknownStep), 'unknown or duplicate step ID'],
    [' '.repeat(16 * 1024 + 1), 'exceeds the 16 KB limit'],
  ]) {
    await openFile(page, text)
    await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible()
    expect(await download(page, 'Export replay file')).toEqual(original)
  }

  const claimed = parse()
  claimed.latest = { ...claimed.previous, number: 2, verdict: 'Verified' }
  await openFile(page, JSON.stringify(claimed))
  await expect(page.getByRole('status').filter({ hasText: /Replay opened/ })).toContainText('rebuilt as Failed')
  await expect(page.getByRole('region', { name: 'Service map' }).getByText('Cannot print')).toBeVisible()
})

test('assumptions stay in the draft until execution and compare independently of rollback order', async ({ page }) => {
  await page.goto('./')
  await repairWarehouse(page)
  const original = await download(page, 'Export replay file')
  await page.getByText('Edit scenario assumptions', { exact: true }).click()
  const observation = page.getByLabel(/Restoration outcome/)
  await observation.selectOption('unreachable')
  expect(await download(page, 'Export replay file')).toEqual(original)
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  const comparison = page.getByRole('region', { name: 'Run comparison' })
  await expect(comparison.getByRole('heading', { name: 'Assumption changed' })).toBeVisible()
  await expect(comparison.getByText(/Latest run · Primary print path stays unreachable/)).toBeVisible()
  await expect(comparison.getByText('Rollback order changed')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Drill outcome' }).getByText('Failed', { exact: true })).toBeVisible()
  await observation.selectOption('unobserved')
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  await expect(page.getByRole('region', { name: 'Drill outcome' }).getByText('Unknown', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore preset defaults' }).click()
  await expect(observation).toHaveValue('reachable')
  await expect(page.getByRole('button', { name: 'Export replay file' })).toHaveCount(0)
  const scenario = page.getByRole('combobox', { name: 'Scenario' })
  await scenario.selectOption('dispatch-queue')
  await expect(observation).toHaveValue('restored')
  await page.getByRole('button', { name: 'Move up: Restore shipping connector' }).click()
  await observation.selectOption('offline')
  await page.getByRole('button', { name: 'Try the dispatch drill' }).click()
  await expect(page.getByRole('region', { name: 'Drill outcome' }).getByText('Failed', { exact: true })).toBeVisible()
  await scenario.selectOption('missing-print-path')
  await expect(observation).toHaveValue('unobserved')
  await expect(page.getByRole('button', { name: 'Export replay file' })).toHaveCount(0)
})
