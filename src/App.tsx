import { Activity, ArrowDown, ArrowUp, ChevronRight, ClipboardList, FlaskConical, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRollbackPlan, restoreQueue, scenarios, warehouseOutage, type DrillScenario, type Phase, type RunbookStep } from './scenario'
import { createBaselineSnapshot, getCheck, runDrill, type DrillRun } from './simulator'
import { compareRuns, resolveComparisonTitles, type ResolvedRunComparison, type RunRef } from './comparison'
import { ServiceMap } from './ServiceMap'
import { Evidence } from './Evidence'
import { describeFinalService, verificationNotes } from './outcome'

const phases: readonly Phase[] = ['Baseline', 'Change', 'Rollback']
const verdictTones = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

export function App() {
  const [scenario, setScenario] = useState<DrillScenario>(warehouseOutage)
  const [includeRestore, setIncludeRestore] = useState(false)
  const [draftOrder, setDraftOrder] = useState<readonly RunbookStep[] | null>(null)
  const [run, setRun] = useState<DrillRun | null>(null)
  const [previousRun, setPreviousRun] = useState<DrillRun | null>(null)
  const [selectedRef, setSelectedRef] = useState<{ run: RunRef; id: string }>({ run: 'current', id: 'baseline' })
  const [runCount, setRunCount] = useState(0)
  const initialSnapshot = run?.snapshots[0] ?? createBaselineSnapshot(scenario)
  const plan = draftOrder ?? createRollbackPlan(scenario, includeRestore)
  const recordedRuns = { current: run, prior: previousRun }
  const activeRun = recordedRuns[selectedRef.run]
  const runLabels = {
    current: `Latest run · Run ${String(runCount).padStart(2, '0')}`,
    prior: `Viewing previous run · Run ${String(runCount - 1).padStart(2, '0')}`,
  }
  const inspectedRunLabel = runLabels[selectedRef.run]
  const selected = activeRun?.snapshots.find(({ id }) => id === selectedRef.id) ?? initialSnapshot
  const pending = Boolean(run && (run.executedRollbackStepIds.length !== plan.length
    || plan.some(({ id }, index) => id !== run.executedRollbackStepIds[index])))
  const serviceOutcome = run && describeFinalService(run)
  const comparison = useMemo<ResolvedRunComparison | null>(() => {
    if (!previousRun || !run) return null
    return resolveComparisonTitles(compareRuns(previousRun, run), (id, ref) =>
      (ref === 'prior' ? previousRun : run).snapshots.find((snapshot) => snapshot.id === id)?.title ?? id)
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
    setPreviousRun(run)
    const nextRun = runDrill(scenario, plan)
    setRun(nextRun)
    setSelectedRef({ run: 'current', id: nextRun.finalSnapshot.id })
    setRunCount((count) => count + 1)
  }

  function clearRun() {
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
    clearRun()
  }

  function selectSnapshot(id: string, runRef: RunRef = 'current') {
    flushSync(() => setSelectedRef({ run: runRef, id }))
    const step = runRef === 'current' && document.getElementById(`step-${id}`)
    const target = step || document.getElementById('service-map')
    target?.focus()
  }

  function returnToLatest() {
    if (!run) return
    flushSync(() => setSelectedRef({ run: 'current', id: run.finalSnapshot.id }))
    document.getElementById('service-map')?.focus()
  }

  function openComparison() {
    const heading = document.getElementById('run-comparison-heading')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }

  function moveStep(index: number, direction: number) {
    const destination = index + direction
    if (destination < 0 || destination >= plan.length) return
    const nextPlan = [...plan]
    const [step] = nextPlan.splice(index, 1)
    nextPlan.splice(destination, 0, step)
    setDraftOrder(nextPlan)
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
          </div>
        </section>

        <section className="summary" aria-label="Drill outcome">
          <div className="summary-cell"><span className="eyebrow">Runbook execution</span>
            <strong aria-live="polite"><i className={`status-dot ${run ? 'good' : 'neutral'}`} />{run ? 'Rollback completed' : 'Ready to run'}</strong>
          </div>
          <div className="summary-cell"><span className="eyebrow">Latest run verdict</span>
            <strong aria-live="polite" className={run ? verdictTones[run.verdict] : 'neutral'}>
              <i className="status-dot" />{run?.verdict ?? 'Awaiting rollback'}
            </strong>
            {run && verificationNotes(run).map((note) => <span key={note} className="summary-note">{note}</span>)}
            {comparison && <button type="button" className="step-link comparison-jump" onClick={openComparison}>
              {comparison.priorVerdict} → {comparison.currentVerdict} · View comparison
            </button>}
          </div>
          <div className="summary-cell summary-detail">
            <span className="eyebrow">{run ? 'Final service observation' : 'Starting state'}</span>
            {serviceOutcome
              ? <strong className={serviceOutcome.tone}>{serviceOutcome.description}</strong>
              : <span className="summary-note">{scenario.startingState}</span>}
            {pending && <span className="summary-note warning">Showing the previous plan</span>}
          </div>
        </section>

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
          </section>

          <ServiceMap snapshot={selected} runLabel={activeRun ? inspectedRunLabel : undefined}
            onReturnToLatest={selectedRef.run === 'prior' ? returnToLatest : undefined} />
          <Evidence snapshot={selected} requiredChecks={scenario.requiredChecks} runs={recordedRuns} runLabels={runLabels}
            comparison={comparison} selectedRunRef={selectedRef.run} onSelectSnapshot={selectSnapshot} />
        </div>

        <footer className="workspace-footer"><FlaskConical size={15} aria-hidden="true" /> Synthetic data <span>·</span> {scenario.scope}</footer>
      </main>
    </>
  )
}
