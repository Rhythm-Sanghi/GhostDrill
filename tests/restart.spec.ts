import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function download(page: Page, name: string) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name }).click()])
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

async function openReplay(page: Page, text: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.getByRole('button', { name: 'Open replay file' }).click(),
  ])
  await chooser.setFiles({ name: 'restart.json', mimeType: 'application/json', buffer: Buffer.from(text) })
}

test('the restart review preserves the same cases and rebuilds the repair in a fresh browser', async ({ page, browser, baseURL }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop'
  if (!desktop) await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')
  const activate = async (control: Locator) => {
    if (!desktop) {
      await control.tap()
      return
    }
    for (let count = 0; count < 48; count++) {
      if (await control.evaluate((element) => element === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(control).toBeFocused()
    await expect(control).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
  }

  await activate(page.getByRole('button', { name: 'Open restart review' }))
  await expect(page.getByRole('heading', { name: 'Shipping batch restart' })).toBeFocused()
  const coverage = page.getByRole('region', { name: 'Exploration coverage' })
  await expect(coverage.getByText(/Uninterrupted run · Pass · Service recovered/)).toBeVisible()
  await expect(coverage.getByText('4 passed · 5 failed · 0 need evidence')).toBeVisible()
  await activate(page.getByRole('button', { name: 'Inspect first counterexample' }))
  const event = page.locator('.failed-event')
  await expect(event).toBeFocused()
  if (desktop) await expect(event).toHaveCSS('outline-style', 'solid')
  await expect(event).toContainText('Duplicate release committed')
  await expect(event).toContainText('2 committed releases')
  await expect(page.getByText(/committed RELEASE-1 for BATCH-1042/)).toBeVisible()
  await expect(page.getByText(/Event \d+ · Acknowledgement lost/)).toBeInViewport()
  await expect(page.getByText(/The saved checkpoint points to Release held batch/)).toBeVisible()
  await activate(page.getByRole('button', { name: 'Back to repair' }))
  await expect(page.getByRole('heading', { name: 'Repair the draft' })).toBeFocused()

  const initial = await download(page, 'Export restart replay')
  await activate(page.getByRole('button', { name: 'Use a stable batch key' }))
  expect(await download(page, 'Export restart replay')).toEqual(initial)
  await page.getByRole('combobox', { name: /Execution case/ }).selectOption('uninterrupted')
  await activate(page.getByRole('button', { name: 'Rerun interruption cases' }))
  const comparison = page.getByRole('region', { name: 'Coverage comparison' })
  await expect(comparison.getByRole('heading')).toBeFocused()
  await expect(comparison).toContainText('9 cases rechecked · 0 original cases not repeated')
  await expect(comparison).toContainText('5 fixed · 0 still failing · 0 newly failing')
  await expect(coverage.getByText('9 passed · 0 failed · 0 need evidence')).toBeVisible()
  await expect(page.getByRole('combobox', { name: /Execution case/ })).toHaveValue('uninterrupted')
  await activate(comparison.getByRole('button', { name: 'Inspect repaired case' }))
  await expect(page.getByRole('combobox', { name: /Execution case · Revised plan/ })).toHaveValue('after-commit/standard/checkpoint')
  const reused = page.locator('.restart-trace li').filter({ hasText: 'Original receipt reused' })
  await expect(reused).toBeFocused()
  if (desktop) await expect(reused).toHaveCSS('outline-style', 'solid')
  await expect(reused).toBeInViewport()
  await expect(reused).toContainText('returned RELEASE-1 without committing another release')
  await expect(page.getByText(/Acknowledgement lost/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)

  const replay = await download(page, 'Export restart replay')
  const report = await download(page, 'Download restart report')
  expect(replay.name).toBe('ghost-drill-shipping-release-restart.json')
  expect(report.text).toContain('Duplicate release committed')
  expect(report.text).toContain('5 fixed, 0 still failing')
  const reviewer = await browser.newContext({ baseURL, viewport: page.viewportSize()!, reducedMotion: 'reduce' })
  try {
    const fresh = await reviewer.newPage()
    await fresh.goto('./')
    await openReplay(fresh, replay.text)
    await expect(fresh.getByRole('status').filter({ hasText: 'Restart replay opened' })).toBeVisible()
    await expect(fresh.getByRole('region', { name: 'Coverage comparison' })).toContainText('5 fixed')
    await fresh.getByRole('button', { name: 'Inspect first counterexample' }).click()
    await expect(fresh.locator('.failed-event')).toContainText('Duplicate release committed')
    await fresh.locator('.failed-event').getByRole('button', { name: 'Inspect repaired case' }).click()
    await expect(fresh.getByRole('combobox', { name: /Execution case · Revised plan/ })).toHaveValue('after-commit/standard/checkpoint')
    await expect(fresh.locator('.restart-trace li').filter({ hasText: 'Original receipt reused' })).toBeFocused()
    await expect(fresh.getByText(/Acknowledgement lost/)).toBeVisible()
    expect(await download(fresh, 'Download restart report')).toEqual(report)
    const invalid = JSON.parse(replay.text)
    invalid.original.actions = ['release-batch', 'release-batch']
    await openReplay(fresh, JSON.stringify(invalid))
    await expect(fresh.getByRole('status').filter({ hasText: 'Invalid or duplicate actions' })).toBeVisible()
    expect(await download(fresh, 'Export restart replay')).toEqual(replay)
  } finally {
    await reviewer.close()
  }
})

test('routing uses the same explorer and a saved disposition goes stale on draft edits', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Open restart review' }).click()
  await page.getByRole('combobox', { name: 'Restart scenario' }).selectOption('routing-verification')
  await page.getByRole('button', { name: 'Inspect first counterexample' }).click()
  await expect(page.locator('.failed-event')).toContainText('Required verification skipped')
  await page.getByText('Local reviewer disposition', { exact: true }).click()
  await page.getByLabel('Reviewer note').fill('Verify before saving progress.')
  await page.getByRole('button', { name: 'Save local disposition' }).click()
  await page.getByRole('button', { name: 'Move up: Verify restored routing' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Belongs to an earlier revision' })).toBeVisible()
  await page.getByRole('button', { name: 'Rerun interruption cases' }).click()
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('1 fixed · 0 still failing')
  await page.getByRole('region', { name: 'Coverage comparison' }).getByRole('button', { name: 'Inspect repaired case' }).click()
  await expect(page.getByRole('heading', { name: 'Inspect an execution' })).toBeFocused()
  await expect(page.getByRole('combobox', { name: /Execution case · Revised plan/ })).toHaveValue('routing-checkpoint/standard/checkpoint')
  await page.getByText('Edit requirements and exploration scope', { exact: true }).click()
  await page.getByLabel('Case limit').fill('1')
  await page.getByRole('button', { name: 'Rerun interruption cases' }).click()
  await expect(page.getByRole('region', { name: 'Exploration coverage' })).toContainText('Coverage incomplete')
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('2 original cases not repeated')
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('Repair totals withheld')
  await expect(page.getByRole('button', { name: 'Inspect repaired case' })).toHaveCount(0)
})
