import { Activity, ArrowDown, ArrowUp, ChevronRight, ClipboardList, Download, FlaskConical, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRollbackPlan, restoreQueue, scenarios, warehouseOutage, type DrillScenario, type Phase, type RunbookStep } from './scenario'
import { createBaselineSnapshot, findRecordedStep, getCheck } from './simulator'
import { compareRuns, resolveComparisonTitles, type ResolvedRunComparison, type RunRef } from './comparison'
import { ServiceMap } from './ServiceMap'
import { Evidence } from './Evidence'
import { describeFinalService, verificationNotes } from './outcome'
import { buildRehearsalReport, downloadFile, downloadRehearsalReport, formatRunId } from './report'
import { assumptionLabels, assumptionOptions, defaultAssumption, recordDrill, recordedPlan, recordedRequirements, replayContingencies, restorationStep, type RecordedDrill, type ScenarioAssumption } from './rehearsal'
import { buildReplayFile, nextRunNumber, readReplayFile, replayByteLimit, sampleReviewJson } from './replay'
import { Contingencies } from './Contingencies'
import { acceptanceRules, compareAcceptance, requirementName, sameRequirements, type AcceptanceEvidence, type AcceptanceRuleId } from './acceptance'
import { AcceptanceChecks, acceptanceTones } from './AcceptanceChecks'
import { RestartReview } from './RestartReview'
import { looksLikeRestartReplay, readRestartReplay, sampleRestartReplay, type RestartReplay } from './restartReplay'
import type { ScenarioId } from './restartModel'

const phases: readonly Phase[] = ['Baseline', 'Change', 'Rollback']
const verdictTones = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

function focusSection(id: string) {
  const target = document.getElementById(id)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start', behavior: 'instant' })
}

export function App() {
  const [restart, setRestart] = useState<{ key: number; replay: RestartReplay } | null>(null)
  const [scenario, setScenario] = useState<DrillScenario>(warehouseOutage)
  const [includeRestore, setIncludeRestore] = useState(false)
  const [draftOrder, setDraftOrder] = useState<readonly RunbookStep[] | null>(null)
  const [run, setRun] = useState<RecordedDrill | null>(null)
  const [previousRun, setPreviousRun] = useState<RecordedDrill | null>(null)
  const [assumption, setAssumption] = useState<ScenarioAssumption>(defaultAssumption(warehouseOutage))
  const [requirements, setRequirements] = useState<readonly AcceptanceRuleId[]>(() => acceptanceRules(warehouseOutage))
  const [contingencies, setContingencies] = useState<readonly ScenarioAssumption[]>([])
  const [localReplay, setLocalReplay] = useState(false)
  const [importStatus, setImportStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const importRequest = useRef(0)
  const [selectedRef, setSelectedRef] = useState<{
    run: RunRef; id: string; fromComparison?: boolean
    acceptance?: { rule: AcceptanceRuleId; finding: AcceptanceEvidence }
  }>({ run: 'current', id: 'baseline' })
  const [runCount, setRunCount] = useState(0)
  const initialSnapshot = run?.snapshots[0] ?? createBaselineSnapshot(scenario)
  const plan = draftOrder ?? createRollbackPlan(scenario, includeRestore)
  const recordedRuns = { current: run, prior: previousRun }
  const activeRun = recordedRuns[selectedRef.run]
  const runLabels = {
    current: `Latest run · ${formatRunId(runCount)}`,
    prior: `Viewing previous run · ${formatRunId(runCount - 1)}`,
  }
  const inspectedRunLabel = runLabels[selectedRef.run]
  const selected = findRecordedStep(activeRun, selectedRef.id) ?? initialSnapshot
  const pending = Boolean(run && (run.executedRollbackStepIds.length !== plan.length
    || plan.some(({ id }, index) => id !== run.executedRollbackStepIds[index]) || run.assumption !== assumption
    || !sameRequirements(recordedRequirements(run) ?? acceptanceRules(scenario), requirements)))
  const acceptanceResult = run?.acceptance?.result ?? 'Unevaluated'
  const firstAttemptViolation = run?.acceptance?.checks.flatMap(({ id, evidence }) => evidence.map((finding) => ({ id, finding })))
    .find(({ finding }) => finding.status === 'violation' && finding.stepId && finding.stepNumber)
  const affectedStep = restorationStep(scenario)
  const contingencyResults = useMemo(() => run && contingencies.length ? replayContingencies(scenario, run, contingencies) : [],
    [scenario, run, contingencies])
  const assumptionChange = previousRun && run && previousRun.assumption !== run.assumption
    ? { previous: assumptionLabels[previousRun.assumption], latest: assumptionLabels[run.assumption] }
    : undefined
  const serviceOutcome = run && describeFinalService(run)
  const comparison = useMemo<ResolvedRunComparison | null>(() => {
    if (!previousRun || !run) return null
    return resolveComparisonTitles(compareRuns(previousRun, run), (id, ref) =>
      findRecordedStep(ref === 'prior' ? previousRun : run, id)?.title ?? id)
  }, [previousRun, run])
  const steps = [
    initialSnapshot,
    ...scenario.changeSteps.map((step) => ({ ...step, phase: 'Change' as const })),
    ...plan.map((step) => ({ ...step, phase: 'Rollback' as const })),
  ]
  if (scenario.rollbackEditor === 'endpoint' && !includeRestore && run?.executedRollbackStepIds.includes(restoreQueue.id)) {
    steps.push({ ...restoreQueue, phase: 'Rollback' })
  }

  function executeDrill() {
    importRequest.current++
    setImportStatus(runCount === Number.MAX_SAFE_INTEGER
      ? { text: 'The two retained runs are now numbered Run 01 and Run 02.' }
      : null)
    setContingencies([])
    setPreviousRun(run)
    const nextRun = recordDrill(scenario, plan, assumption, requirements)
    setRun(nextRun)
    setSelectedRef({ run: 'current', id: nextRun.finalSnapshot.id })
    setRunCount(nextRunNumber)
  }

  function clearRun(nextScenario = scenario) {
    importRequest.current++
    setImportStatus(null)
    setLocalReplay(false)
    setAssumption(defaultAssumption(nextScenario))
    setRequirements(acceptanceRules(nextScenario))
    setContingencies([])
    setIncludeRestore(false)
    setDraftOrder(null)
    setRun(null)
    setPreviousRun(null)
    setSelectedRef({ run: 'current', id: 'baseline' })
    setRunCount(0)
  }

  function reset() {
    clearRun()
    document.getElementById('execute-drill')?.focus()
  }

  function selectScenario(id: string) {
    const nextScenario = scenarios.find((entry) => entry.id === id)
    if (!nextScenario || nextScenario.id === scenario.id) return
    setScenario(nextScenario)
    clearRun(nextScenario)
  }

  function selectSnapshot(id: string, runRef: RunRef, fromComparison: boolean) {
    flushSync(() => setSelectedRef({ run: runRef, id, fromComparison }))
    const step = runRef === 'current' && document.getElementById(`step-${id}`)
    if (step && !window.matchMedia('(max-width: 680px)').matches) step.focus()
    else focusSection('service-map')
  }

  function returnToLatest() {
    if (!run) return
    flushSync(() => setSelectedRef({ run: 'current', id: run.finalSnapshot.id }))
    focusSection('service-map')
  }

  function inspectAcceptance(rule: AcceptanceRuleId, finding: AcceptanceEvidence, runRef: RunRef) {
    if (!finding.stepId || !findRecordedStep(recordedRuns[runRef], finding.stepId)) return
    const id = finding.stepId
    flushSync(() => setSelectedRef({
      run: runRef, id, acceptance: { rule, finding },
      fromComparison: selectedRef.run === runRef && selectedRef.fromComparison,
    }))
    focusSection('service-map')
  }

  function openAcceptance() {
    if (run && selectedRef.run === 'prior') {
      flushSync(() => setSelectedRef({ run: 'current', id: run.finalSnapshot.id }))
    }
    focusSection('acceptance-heading')
  }

  function openComparison() {
    focusSection('run-comparison-heading')
  }

  function moveStep(index: number, direction: number) {
    const destination = index + direction
    if (destination < 0 || destination >= plan.length) return
    const nextPlan = [...plan]
    const [step] = nextPlan.splice(index, 1)
    nextPlan.splice(destination, 0, step)
    setDraftOrder(nextPlan)
  }

  function downloadReport() {
    if (!run) return
    const previous = previousRun ? { number: runCount - 1, run: previousRun } : undefined
    downloadRehearsalReport(buildRehearsalReport(scenario.title, { number: runCount, run }, previous, contingencyResults))
  }

  function exportReplay() {
    if (!run) return
    const previous = previousRun ? { number: runCount - 1, run: previousRun } : undefined
    const { filename, json } = buildReplayFile(scenario, { number: runCount, run }, previous, contingencies)
    downloadFile(filename, json, 'application/json')
  }

  function loadReplay(replay: ReturnType<typeof readReplayFile>, sample = false) {
    const latest = replay.latest.run
    flushSync(() => {
      setRestart(null)
      setScenario(replay.scenario)
      setRun(latest)
      setPreviousRun(replay.previous?.run ?? null)
      setRunCount(replay.latest.number)
      setAssumption(latest.assumption)
      setRequirements(recordedRequirements(latest) ?? acceptanceRules(replay.scenario))
      setIncludeRestore(latest.executedRollbackStepIds.includes(restoreQueue.id))
      setDraftOrder(replay.scenario.rollbackEditor === 'order' ? recordedPlan(replay.scenario, latest) : null)
      setSelectedRef({ run: 'current', id: latest.finalSnapshot.id })
      setContingencies(replay.contingencies)
      setLocalReplay(true)
      setImportStatus({ text: `${sample ? 'Sample review' : 'Replay'} opened. ${formatRunId(replay.latest.number)} rebuilt as ${latest.verdict}.` })
    })
    focusSection('drill-outcome')
  }

  function enterRestart(replay: RestartReplay, message?: string) {
    const key = ++importRequest.current
    flushSync(() => {
      setRestart({ key, replay })
      setImportStatus(message ? { text: message } : null)
    })
    document.getElementById('restart-heading')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function openRestartSample(scenario: ScenarioId = 'shipping-release') {
    enterRestart(sampleRestartReplay(scenario))
  }

  async function openReplay(file: File) {
    const request = ++importRequest.current
    try {
      if (file.size > replayByteLimit) throw new Error('This replay exceeds the 16 KB limit.')
      const json = await file.text()
      if (request !== importRequest.current) return
      let value: unknown
      try { value = JSON.parse(json) } catch { throw new Error('This file is not readable JSON. Choose a Ghost Drill replay file.') }
      if (looksLikeRestartReplay(value)) enterRestart(readRestartReplay(json), 'Restart replay opened. Evidence rebuilt locally.')
      else loadReplay(readReplayFile(json))
    } catch (error) {
      if (request !== importRequest.current) return
      setImportStatus({ error: true, text: error instanceof Error ? error.message : 'The replay file could not be read.' })
    }
  }

  function rehearseContingencies() {
    if (!run) return
    const cases = contingencies.length ? contingencies : assumptionOptions(scenario).filter((option) => option !== run.assumption)
    flushSync(() => setContingencies([...cases]))
    focusSection('contingencies-heading')
  }

  const reportAction = run && (
    <div className="report-action">
      <div className="report-actions">
        <button type="button" className="step-link report-download" onClick={downloadReport} aria-describedby="report-scope report-description">
          <Download size={15} aria-hidden="true" /> Download rehearsal report
        </button>
        <p id="report-description">Markdown for a change ticket.</p>
        <button type="button" className="step-link report-download" onClick={exportReplay} aria-describedby="report-scope replay-description">
          <Download size={15} aria-hidden="true" /> Export replay file
        </button>
        <p id="replay-description">Replay JSON for independent verification.</p>
      </div>
      <p id="report-scope">Latest completed run · {formatRunId(runCount)}{pending && ' · Draft edits excluded'}</p>
    </div>
  )

  if (restart) {
    return <RestartReview key={restart.key} initial={restart.replay}
      onBack={() => {
        importRequest.current++
        flushSync(() => { setRestart(null); setImportStatus(null) })
        focusSection('execute-drill')
      }}
      onScenario={openRestartSample} onOpen={(file) => void openReplay(file)} status={importStatus} />
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-icon"><Activity size={21} aria-hidden="true" /></span> Ghost Drill</div>
          <span className="topbar-divider" />
          <span className="product-type">Network maintenance rehearsal</span>
          <span className="simulation-label"><FlaskConical size={15} aria-hidden="true" /> Simulation</span>
        </div>
      </header>

      <main className="workspace">
        <section className="intro" aria-labelledby="scenario-heading">
          <div>
            <p className="eyebrow scenario-label">{scenario.baseline.kind === 'dispatch' ? 'Dispatch drill' : 'Warehouse drill'}</p>
            <h1 id="scenario-heading">{scenario.title}</h1>
            <p className="intro-description">{scenario.description}</p>
          </div>
          <div className="intro-controls">
            <label className="scenario-picker">
              <span className="eyebrow">Scenario</span>
              <select value={scenario.id} onChange={(event) => selectScenario(event.target.value)}>
                {scenarios.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
            <div className="intro-actions">
              {(run || draftOrder) && <button type="button" className="button secondary" onClick={reset}><RotateCcw size={16} /> Reset</button>}
              <button type="button" className="button primary" id="execute-drill" onClick={executeDrill}>
                <Play size={16} fill="currentColor" /> {run ? 'Rerun drill' : scenario.launchLabel}
              </button>
            </div>
            <div className="reviewer-actions">
              <button type="button" className="step-link" onClick={() => fileInput.current?.click()}>Open replay file</button>
              <button type="button" className="step-link" onClick={() => {
                importRequest.current++
                loadReplay(readReplayFile(sampleReviewJson), true)
              }}>Open sample review</button>
              {!run && <button type="button" className="step-link" onClick={() => openRestartSample()}>Open restart review</button>}
            </div>
            <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Choose a Ghost Drill replay file" hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void openReplay(file)
              }} />
          </div>
        </section>

        <p className={importStatus?.error ? 'import-status bad' : 'import-status'} role="status">{importStatus?.text}</p>
        <section className={run ? 'summary review-summary' : 'summary'} id="drill-outcome" tabIndex={-1} aria-label="Drill outcome">
          <div className="summary-cell"><span className="eyebrow">Runbook execution</span>
            <strong aria-live="polite"><i className={`status-dot ${run ? 'good' : 'neutral'}`} />{run ? 'Rollback completed' : 'Ready to run'}</strong>
          </div>
          <div className="summary-cell"><span className="eyebrow">Final service state</span>
            <strong aria-live="polite" className={run ? verdictTones[run.verdict] : 'neutral'}>
              <i className="status-dot" />{run?.verdict ?? 'Awaiting rollback'}
            </strong>
            {run && <span className="summary-note">{runLabels.current}</span>}
            {run && verificationNotes(run).map((note) => <span key={note} className="summary-note">{note}</span>)}
            {comparison && <button type="button" className="step-link comparison-jump" onClick={openComparison}>
              {comparison.priorVerdict} → {comparison.currentVerdict} · View comparison
            </button>}
            {!comparison && run?.verdict === 'Failed' && <button type="button" className="step-link comparison-jump"
              onClick={() => focusSection('rollback-proof-heading')}>View rollback proof</button>}
            {run && <button type="button" className="step-link comparison-jump" onClick={rehearseContingencies}>Rehearse contingencies</button>}
          </div>
          {run && <div className="summary-cell summary-acceptance">
            <span className="eyebrow">Acceptance result</span>
            <strong role="status" className={acceptanceTones[acceptanceResult]}>{acceptanceResult}</strong>
            {firstAttemptViolation && (
              <button type="button" className="step-link comparison-jump"
                onClick={() => inspectAcceptance(firstAttemptViolation.id, firstAttemptViolation.finding, 'current')}>
                Violation at step {firstAttemptViolation.finding.stepNumber}
              </button>
            )}
            <button type="button" className="step-link comparison-jump" onClick={openAcceptance}>View acceptance checks</button>
          </div>}
          <div className="summary-cell summary-detail">
            <span className="eyebrow">{run ? 'Final service observation' : 'Starting state'}</span>
            {serviceOutcome
              ? <strong className={serviceOutcome.tone}>{serviceOutcome.description}</strong>
              : <span className="summary-note">{scenario.startingState}</span>}
            {pending && <span className="summary-note warning">Showing the previous plan</span>}
            {localReplay && <span className="summary-note">Local replay · Synthetic rehearsal</span>}
            {!comparison && reportAction}
          </div>
        </section>
        <span className="sr-only" role="status">{contingencyResults.length > 0
          ? `Contingency results for ${formatRunId(runCount)}. ${contingencyResults.map(({ verdict, assumption }) => `${verdict}. ${assumptionLabels[assumption]}.`).join(' ')}`
          : ''}</span>
        {run && contingencyResults.length > 0 &&
          <Contingencies scenario={scenario} run={run} number={runCount} results={contingencyResults}
            onReturn={() => focusSection('drill-outcome')} />}

        <div className="workspace-grid">
          <section className="panel runbook" aria-labelledby="runbook-heading">
            <header className="panel-header"><h2 id="runbook-heading"><ClipboardList size={17} /> Runbook</h2><span className="panel-meta">{run ? runLabels.current : 'Timeline'}</span></header>
            <div className="timeline">
              {phases.map((phase) => (
                <div className="phase" key={phase}>
                  <h3>{phase}</h3>
                  <ol>
                    {steps.filter((step) => step.phase === phase).map((step, index) => {
                      const snapshot = run?.snapshots.find(({ id }) => id === step.id)
                        ?? (step.id === initialSnapshot.id ? initialSnapshot : undefined)
                      const removed = scenario.rollbackEditor === 'endpoint' && step.id === restoreQueue.id && !includeRestore
                      const canReorder = scenario.rollbackEditor === 'order' && phase === 'Rollback'
                      return (
                        <li key={step.id} className={canReorder ? 'reorder-step' : undefined}>
                          <button type="button" className="step" id={`step-${step.id}`}
                            aria-current={selectedRef.run === 'current' && selectedRef.id === step.id ? 'step' : undefined}
                            disabled={!snapshot} onClick={() => setSelectedRef({ run: 'current', id: step.id })}>
                            <span className={`step-marker ${snapshot ? getCheck(snapshot, scenario.serviceCheck).status : ''}`} />
                            <span>{step.title}{removed && <small>Removed from plan</small>}
                              {scenario.rollbackEditor === 'endpoint' && step.id === restoreQueue.id && !snapshot && <small>Pending execution</small>}
                            </span>
                            {selectedRef.run === 'current' && selectedRef.id === step.id && <ChevronRight className="step-chevron" size={15} aria-hidden="true" />}
                          </button>
                          {canReorder && <div className="move-controls">
                            <button type="button" className="button move-button" aria-label={`Move up: ${step.title}`}
                              aria-disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
                            <button type="button" className="button move-button" aria-label={`Move down: ${step.title}`}
                              aria-disabled={index === plan.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
                          </div>}
                          {step.id === affectedStep?.id && assumption !== defaultAssumption(scenario) &&
                            <p className="step-assumption">{run && run.assumption !== assumption ? 'Draft · ' : ''}
                              {assumptionLabels[assumption]}.</p>}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
            {scenario.rollbackEditor === 'endpoint' && <div className="plan-editor">
              <h3>Edit rollback</h3>
              <p>{includeRestore ? restoreQueue.description : 'Add a step to point the queue back to gw-primary.'}</p>
              <button type="button" className="button edit-button" disabled={!run} onClick={() => setIncludeRestore(!includeRestore)}>
                {includeRestore ? <X size={16} /> : <Plus size={16} />}
                {includeRestore ? 'Remove endpoint restore' : restoreQueue.title}
              </button>
              <div className="pending" role="status">{pending && 'Pending edit · Rerun to apply'}</div>
            </div>}
            {scenario.rollbackEditor === 'order' && pending &&
              <p className="pending reorder-pending" role="status">Pending edit · Rerun to apply</p>}
            {affectedStep && <details className="assumption-editor">
              <summary>Edit scenario assumptions</summary>
              <label htmlFor="restoration-assumption">Restoration outcome · {affectedStep.title}</label>
              <select id="restoration-assumption" value={assumption}
                onChange={(event) => setAssumption(event.currentTarget.value as ScenarioAssumption)}>
                {assumptionOptions(scenario).map((option) => <option key={option} value={option}>{assumptionLabels[option]}</option>)}
              </select>
              {assumption !== defaultAssumption(scenario) &&
                <button type="button" className="step-link" onClick={reset}>Restore preset defaults</button>}
            </details>}
            <details className="assumption-editor">
              <summary>Edit acceptance requirements</summary>
              <fieldset className="acceptance-options">
                <legend>Evaluate on the next run</legend>
                {acceptanceRules(scenario).map((id) => (
                  <label key={id}>
                    <input type="checkbox" checked={requirements.includes(id)} onChange={(event) =>
                      setRequirements(event.currentTarget.checked ? [...requirements, id] : requirements.filter((item) => item !== id))} />
                    {requirementName(id)}
                  </label>
                ))}
              </fieldset>
            </details>
          </section>

          <ServiceMap snapshot={selected} runLabel={activeRun ? inspectedRunLabel : undefined}
            onReturnToLatest={selectedRef.run === 'prior' ? returnToLatest : undefined}
            onBackToComparison={selectedRef.fromComparison ? openComparison : undefined}
            acceptanceEvidence={selectedRef.acceptance} onBackToAcceptance={() => focusSection('acceptance-heading')} />
          <Evidence snapshot={selected} requiredChecks={scenario.requiredChecks} runs={recordedRuns} runLabels={runLabels}
            comparison={comparison} selectedRunRef={selectedRef.run} onSelectSnapshot={selectSnapshot}
            reportAction={reportAction} assumptionChange={assumptionChange}
            acceptancePanel={activeRun && <AcceptanceChecks run={activeRun} runLabel={inspectedRunLabel}
              onBackToComparison={selectedRef.fromComparison ? openComparison : undefined}
              onInspect={(id, finding) => inspectAcceptance(id, finding, selectedRef.run)} />}
            acceptanceComparison={previousRun && run ? compareAcceptance(previousRun.acceptance, run.acceptance) : undefined}
            onViewAcceptance={(ref) => {
              const recorded = recordedRuns[ref]
              if (!recorded) return
              flushSync(() => setSelectedRef({ run: ref, id: recorded.finalSnapshot.id, fromComparison: true }))
              focusSection('acceptance-heading')
            }} />
        </div>

        <footer className="workspace-footer"><FlaskConical size={15} aria-hidden="true" /> Synthetic data <span>·</span> {scenario.scope}</footer>
      </main>
    </>
  )
}
