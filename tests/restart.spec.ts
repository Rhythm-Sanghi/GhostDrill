import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function download(page: Page, name: string) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name }).click()])
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

async function openReplay(page: Page, text: string, name = 'restart.json') {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.getByRole('button', { name: 'Open replay file' }).click(),
  ])
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })
}

test('a delayed replay cannot replace newer work or a newer import status', async ({ page }) => {
  const shipping = await readFile('examples/shipping-restart-review.json', 'utf8')
  const routing = await readFile('examples/routing-restart-review.json', 'utf8')
  await page.addInitScript(() => {
    const read = File.prototype.text
    const pending = new Map<string, () => void>()
    Object.assign(window, { pendingReplayReads: pending })
    File.prototype.text = async function () {
      const text = await read.call(this)
      if (this.name.startsWith('delayed-')) {
        await new Promise<void>((resolve) => pending.set(this.name, resolve))
      }
      return text
    }
  })
  async function hold(text: string, name: string) {
    await openReplay(page, text, name)
    await page.waitForFunction((file) => Reflect.get(window, 'pendingReplayReads').has(file), name)
  }
  async function finish(name: string) {
    await page.evaluate(async (file) => {
      const pending = Reflect.get(window, 'pendingReplayReads')
      pending.get(file)()
      pending.delete(file)
      // Let the file read and import continuation settle.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }, name)
  }
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  const openReview = page.getByRole('button', { name: 'Open restart review' })
  const shippingHeading = page.getByRole('heading', { name: 'Shipping batch restart' })
  const routingHeading = page.getByRole('heading', { name: 'Routing verification restart' })
  const rerun = page.getByRole('button', { name: 'Rerun interruption cases' })
  const scenario = page.getByRole('combobox', { name: 'Restart scenario' })

  await page.goto('./')
  await openReview.click()
  await hold(routing, 'delayed-edit.json')
  await page.getByRole('button', { name: 'Use a stable batch key' }).click()
  await finish('delayed-edit.json')
  await expect(shippingHeading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Repeat without a stable key' })).toBeVisible()
  await expect(status('Replay import cancelled')).toBeVisible()

  await hold(routing, 'delayed-rerun.json')
  await expect(status('Importing replay')).toBeVisible()
  await rerun.click()
  await finish('delayed-rerun.json')
  await expect(shippingHeading).toBeVisible()
  await expect(status('Replay import cancelled')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('5 fixed')

  await hold(shipping, 'delayed-scenario.json')
  await scenario.selectOption('routing-verification')
  await finish('delayed-scenario.json')
  await expect(routingHeading).toBeVisible()
  await expect(status('Replay import cancelled')).toBeVisible()

  await hold(routing, 'delayed-older.json')
  await openReplay(page, shipping)
  await expect(status('Restart replay opened')).toBeVisible()
  await finish('delayed-older.json')
  await expect(shippingHeading).toBeVisible()
  await expect(status('Restart replay opened')).toBeVisible()

  await hold(routing, 'delayed-before-invalid.json')
  await openReplay(page, '{')
  await expect(status('This file is not readable JSON')).toBeVisible()
  await finish('delayed-before-invalid.json')
  await expect(shippingHeading).toBeVisible()
  await expect(status('This file is not readable JSON')).toBeVisible()
})

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

  const restartLink = page.getByRole('button', { name: 'Open restart review' })
  await expect(page.getByText('Check whether restarting a rollback repeats an action that already committed.')).toBeInViewport()
  await expect(restartLink).toBeInViewport()
  expect((await restartLink.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { name: 'Runbook', exact: true }).boundingBox())!.y)
  await expect(restartLink).toHaveClass(/\bprimary\b/)
  await activate(restartLink)
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
  await expect(page.getByRole('region', { name: 'Exploration coverage' })).toContainText('1/3 cases evaluated')
  await expect(page.getByRole('region', { name: 'Exploration coverage' })).toContainText('Case limit reached')
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('2 original cases not repeated')
  await expect(page.getByRole('region', { name: 'Coverage comparison' })).toContainText('Repair totals withheld')
  await expect(page.getByRole('button', { name: 'Inspect repaired case' })).toHaveCount(0)
})

test('restart review explains optional shipping inspection, unreached boundaries, and former failures needing evidence', async ({ page }) => {
  const packet = JSON.parse(await readFile('examples/shipping-restart-review.json', 'utf8'))
  const coverage = page.getByRole('region', { name: 'Exploration coverage' })
  const comparison = page.getByRole('region', { name: 'Coverage comparison' })
  const inspection = 'Inspect simulated shipping state (optional)'
  await page.goto('./')
  await openReplay(page, JSON.stringify(packet))
  await expect(coverage).toContainText('The verdict evaluates the selected requirements. The optional inspection only records simulated state.')
  await expect(coverage).toContainText('Recover service and release exactly once')
  expect((await download(page, 'Download restart report')).text).toContain(inspection)

  const noInspection = packet.revised.actions.filter((id: string) => id !== 'verify-recovery')
  packet.revised.actions = ['verify-recovery', ...noInspection]
  await openReplay(page, JSON.stringify(packet))
  await page.getByRole('button', { name: 'View uninterrupted run' }).click()
  await expect(page.getByText('At this step, printing is down; downstream records show 0 committed releases.')).toBeVisible()
  await expect(coverage).toContainText('9 passed · 0 failed · 0 need evidence')
  await page.getByText('Edit ordered actions', { exact: true }).click()
  await page.getByRole('button', { name: `Remove ${inspection}`, exact: true }).click()
  await page.getByRole('button', { name: 'Rerun interruption cases' }).click()
  await expect(coverage).toContainText('9 passed · 0 failed · 0 need evidence')
  await expect(page.getByText(/Optional shipping state inspection/)).toHaveCount(0)

  packet.original.observations = ['receipt-unavailable']
  packet.revised.observations = ['receipt-unavailable']
  await openReplay(page, JSON.stringify(packet))
  await expect(comparison).toContainText('4 former failures need evidence')
  expect((await download(page, 'Download restart report')).text).toContain('4 former failures need evidence')

  packet.original.observations = ['standard']
  packet.revised.observations = ['standard']
  packet.revised.actions = packet.revised.actions.filter((id: string) => id !== 'record-receipt')
  await openReplay(page, JSON.stringify(packet))
  await expect(coverage).toContainText('9/9 cases evaluated')
  await expect(coverage).toContainText('2 evaluated cases did not reach their targeted interruption boundaries.')
  await expect(coverage).toContainText('Inconclusive')
  await expect(comparison).toContainText('0 fixed')
  await expect(page.getByRole('button', { name: 'Inspect repaired case' })).toHaveCount(0)
  const { text } = await download(page, 'Download restart report')
  expect(text).toContain('9/9 cases evaluated')
  expect(text).toContain('2 evaluated cases did not reach their targeted interruption boundaries.')
})
