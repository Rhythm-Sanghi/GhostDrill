import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function readDownload(page: Page, activate: () => Promise<void>, filename: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), activate()])
  expect(download.suggestedFilename()).toBe(filename)
  return readFile(await download.path(), 'utf8')
}

async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 30; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

test('the first-minute warehouse flow downloads the recorded report at desktop and narrow mobile widths', async ({ page }, testInfo) => {
  const keyboard = testInfo.project.name === 'desktop'
  if (!keyboard) await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('./')

  const activate = async (target: Locator) => {
    if (!keyboard) {
      await target.tap()
      return
    }
    await tabTo(page, target)
    await expect(target).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
  }
  const report = page.getByRole('button', { name: 'Download rehearsal report' })
  const proof = page.getByRole('region', { name: 'Rollback proof' })
  const comparison = page.getByRole('region', { name: 'Run comparison' })
  const map = page.getByRole('region', { name: 'Service map' })
  const printing = comparison.getByRole('article', { name: 'Label printing' })
  const previous = printing.getByRole('group', { name: 'Before · Rollback' }).getByRole('button')
  const latest = printing.getByRole('group', { name: 'After · Rollback' }).getByRole('button')
  const heading = comparison.getByRole('heading', { name: 'Run comparison' })
  const outcome = page.getByRole('region', { name: 'Drill outcome' })

  await expect(report).toHaveCount(0)
  await activate(page.getByRole('button', { name: 'Try the warehouse drill' }))
  await expect(outcome.getByText('Failed', { exact: true })).toBeVisible()
  await expect(report).toHaveAccessibleDescription('Latest completed run · Run 01 Markdown for a change ticket.')
  const first = await readDownload(page, () => activate(report), 'ghost-drill-warehouse-outage-rehearsal-run-01.md')
  expect(first).toContain('Verification verdict** — Failed')

  const proofShortcut = page.getByRole('button', { name: 'View rollback proof' })
  await expect(proofShortcut).toBeInViewport()
  await activate(proofShortcut)
  await expect(proof.getByRole('heading', { name: 'Rollback proof' })).toBeFocused()
  const responsible = proof.getByRole('button', { name: /Inspect responsible step for Label printing/ })
  await expect(responsible).toBeInViewport()
  await activate(responsible)
  await expect(map.getByText('Switch queue to backup', { exact: true })).toBeInViewport()
  await activate(page.getByRole('button', { name: 'Restore label queue endpoint', exact: true }))
  await expect(report).toHaveAccessibleDescription('Latest completed run · Run 01 · Draft edits excluded Markdown for a change ticket.')
  expect(await readDownload(page, () => activate(report), 'ghost-drill-warehouse-outage-rehearsal-run-01.md')).toBe(first)
  await activate(page.getByRole('button', { name: 'Rerun drill' }))
  await activate(page.getByRole('button', { name: 'Failed → Verified · View comparison' }))
  await expect(heading).toBeFocused()
  await expect(comparison.getByRole('button', { name: 'Download rehearsal report' })).toBeInViewport()

  await activate(previous)
  await expect(map.getByText('Viewing previous run · Run 01')).toBeInViewport()
  await activate(map.getByRole('button', { name: 'Back to comparison' }))
  await expect(heading).toBeFocused()
  await expect(report).toHaveAccessibleDescription('Latest completed run · Run 02 Markdown for a change ticket.')
  const repaired = await readDownload(page, () => activate(report), 'ghost-drill-warehouse-outage-rehearsal-run-02.md')
  expect(repaired).toContain('Verdict transition** — Failed → Verified')
  expect(repaired).toContain('Added — Restore label queue endpoint')
  expect(repaired).toContain('After — **Healthy**. Primary gateway can reach the print service.')

  await activate(latest)
  await expect(map.getByText('Latest run · Run 02')).toBeInViewport()
  await activate(map.getByRole('button', { name: 'Back to comparison' }))
  expect(await readDownload(page, () => activate(report), 'ghost-drill-warehouse-outage-rehearsal-run-02.md')).toBe(repaired)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('reset and scenario changes clear downloads and the new download contains only the active scenario', async ({ page }) => {
  await page.goto('./')
  const report = page.getByRole('button', { name: 'Download rehearsal report' })
  const launch = page.getByRole('button', { name: 'Try the warehouse drill' })
  const scenario = page.getByRole('combobox', { name: 'Scenario' })
  await launch.click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(report).toHaveCount(0)
  await launch.click()
  await page.getByRole('button', { name: 'Rerun drill' }).click()
  await expect(report).toBeVisible()
  await scenario.selectOption('missing-print-path')
  await expect(report).toHaveCount(0)
  await page.getByRole('button', { name: 'Try the missing evidence drill' }).click()
  const unknown = await readDownload(page, () => report.click(), 'ghost-drill-missing-print-path-rehearsal-run-01.md')
  expect(unknown).toContain('Verification verdict** — Unknown')
  expect(unknown).toContain('Missing observation: reachability from the primary gateway to the print service.')
  expect(unknown).not.toContain('Run comparison')
  expect(unknown).not.toContain('Warehouse Label Outage')
})
