import { compareRuns } from './comparison.ts'
import { verificationNotes } from './outcome.ts'
import { assumptionLabels, type ContingencyResult, type RecordedDrill } from './rehearsal.ts'
import { checkNames, checkStatusLabels, evidenceSource, findRecordedStep, type CheckResult, type DrillRun } from './simulator.ts'

interface CompletedRun {
  number: number
  run: DrillRun & Partial<Pick<RecordedDrill, 'assumption'>>
}

export function formatRunId(number: number) {
  return `Run ${String(number).padStart(2, '0')}`
}

function rollbackOrder(run: DrillRun) {
  return run.executedRollbackStepIds.length
    ? run.executedRollbackStepIds.map((id, index) => `${index + 1}. ${findRecordedStep(run, id)?.title ?? id}`)
    : ['No rollback steps were recorded.']
}

function evidenceLine(label: string, result: CheckResult, run: DrillRun) {
  const title = evidenceSource(run, result)?.title
  return `- ${label} — **${checkStatusLabels[result.status]}**. ${result.reason}${title ? ` Recorded source step — ${title}.` : ''}`
}

export function buildRehearsalReport(scenarioTitle: string, latest: CompletedRun, previous?: CompletedRun, contingencies: readonly ContingencyResult[] = []) {
  const { run } = latest
  const latestId = formatRunId(latest.number)
  const lines = [
    '# Ghost Drill rehearsal report',
    '',
    `**Scenario** — ${scenarioTitle}`,
    '',
    'This browser rehearsal uses synthetic data. Its verdict applies only to the modeled checks.',
    '',
    `## Latest completed run · ${latestId}`,
    '',
    '- **Runbook execution** — Rollback completed',
    `- **Verification verdict** — ${run.verdict}`,
    ...(run.assumption ? [`- **Recorded assumption** — ${assumptionLabels[run.assumption]}`] : []),
    ...verificationNotes(run).map((note) => `- ${note}`),
    '',
    '### Recorded rollback order',
    '',
    ...rollbackOrder(run),
    '',
    '### Required checks',
  ]

  for (const { id, baseline, rollback } of run.comparisons) {
    lines.push('', `#### ${checkNames[id]}`, '', evidenceLine('Baseline', baseline, run), evidenceLine('Rollback', rollback, run))
  }

  if (previous) {
    const prior = previous.run
    const comparison = compareRuns(prior, run)
    const priorId = formatRunId(previous.number)
    lines.push(
      '', '## Run comparison', '',
      `- **Previous completed run** — ${priorId} · ${comparison.priorVerdict}`,
      `- **Verdict transition** — ${comparison.priorVerdict} → ${comparison.currentVerdict}`,
      ...(prior.assumption && run.assumption && prior.assumption !== run.assumption
        ? [`- **Assumption changed** — ${assumptionLabels[prior.assumption]} → ${assumptionLabels[run.assumption]}`]
        : []),
      '', `### Previous rollback order · ${priorId}`, '', ...rollbackOrder(prior),
      '', `### Latest rollback order · ${latestId}`, '', ...rollbackOrder(run),
      '', '### Rollback actions added or removed', '',
    )
    if (comparison.addedStepIds.length + comparison.removedStepIds.length === 0) {
      lines.push('No rollback actions were added or removed.')
    }
    for (const id of comparison.addedStepIds) lines.push(`- Added — ${findRecordedStep(run, id)?.title ?? id}`)
    for (const id of comparison.removedStepIds) lines.push(`- Removed — ${findRecordedStep(prior, id)?.title ?? id}`)
    lines.push('', '### Changed check evidence', '')
    if (!comparison.changedChecks.length) lines.push('Required check results stayed the same in Baseline and Rollback.')
    for (const { id, phases } of comparison.changedChecks) {
      for (const { phase, before, after } of phases) {
        lines.push(`#### ${checkNames[id]} · ${phase}`, '', evidenceLine('Before', before, prior), evidenceLine('After', after, run), '')
      }
    }
  }

  if (contingencies.length) {
    lines.push('', '## Contingency rehearsals', '', `Original ${latestId} verdict — **${run.verdict}**. Each alternate used the same recorded rollback order.`, '')
    for (const result of contingencies) {
      lines.push(`- **${result.verdict}** — ${assumptionLabels[result.assumption]}. ${result.title ? `Affected action — ${result.title}. ` : ''}${result.evidence}`)
    }
  }

  return {
    filename: `ghost-drill-${run.scenarioId}-rehearsal-${latestId.toLowerCase().replace(' ', '-')}.md`,
    markdown: `${lines.join('\n').trimEnd()}\n`,
  }
}

export function downloadRehearsalReport({ filename, markdown }: ReturnType<typeof buildRehearsalReport>) {
  downloadFile(filename, markdown, 'text/markdown;charset=utf-8')
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
