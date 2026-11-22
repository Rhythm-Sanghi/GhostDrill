import { Activity, ChevronRight, ClipboardList, FlaskConical, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createRollbackPlan, restoreQueue, scenarios, warehouseOutage, type DrillScenario, type Phase, type RunbookStep } from './scenario'
import { createBaselineSnapshot, runDrill, type DrillRun } from './simulator'
import { compareRuns, resolveComparisonTitles, type ResolvedRunComparison, type RunRef } from './comparison'
import { ServiceMap } from './ServiceMap'
import { Evidence } from './Evidence'

const phases: readonly Phase[] = ['Baseline', 'Change', 'Rollback']
const printOutcomes = {
  healthy: { description: 'Service recovered', tone: 'good' },
  unhealthy: { description: 'Service still down', tone: 'bad' },
  unknown: { description: 'Printing unconfirmed', tone: 'warning' },
}
const verdictTones = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

function rollbackStepTitleFor(scenario: DrillScenario): (id: string) => string {
  const universe: readonly RunbookStep[] = [...scenario.rollbackSteps, restoreQueue]
  return (id: string) => universe.find((step) => step.id === id)?.title ?? id
}

export function App() {
  const [scenario, setScenario] = useState(warehouseOutage)
  const [includeRestore, setIncludeRestore] = useState(false)
  const [run, setRun] = useState<DrillRun | null>(null)
  const [previousRun, setPreviousRun] = useState<DrillRun | null>(null)
  const [selectedRef, setSelectedRef] = useState<{ run: RunRef; id: string }>({ run: 'current', id: 'baseline' })
  const [runCount, setRunCount] = useState(0)
  const initialSnapshot = run?.snapshots[0] ?? createBaselineSnapshot(scenario)
  const plan = createRollbackPlan(scenario, includeRestore)
  const activeRun = selectedRef.run === 'prior' ? previousRun : run
  const currentRunLabel = `Current run · Run ${String(runCount).padStart(2, '0')}`
  const inspectedRunLabel = selectedRef.run === 'prior'
    ? `Previous run · Run ${String(runCount - 1).padStart(2, '0')}`
    : currentRunLabel
  const selected = activeRun?.snapshots.find(({ id }) => id === selectedRef.id) ?? initialSnapshot
  const pending = Boolean(run && (run.executedRollbackStepIds.length !== plan.length
    || plan.some(({ id }, index) => id !== run.executedRollbackStepIds[index])))
  const printOutcome = run && printOutcomes[run.finalSnapshot.checks['label-printing'].status]
  const comparison = useMemo<ResolvedRunComparison | null>(() => {
    if (!previousRun || !run) return null
    return resolveComparisonTitles(compareRuns(previousRun, run), rollbackStepTitleFor(scenario))
  }, [previousRun, run, scenario])
  const steps = [
    initialSnapshot,
    ...scenario.changeSteps.map((step) => ({ ...step, phase: 'Change' as const })),
    ...plan.map((step) => ({ ...step, phase: 'Rollback' as const })),
  ]
  if (scenario.canEditRollback && !includeRestore && run?.executedRollbackStepIds.includes(restoreQueue.id)) {
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
    setSelectedRef({ run: runRef, id })
    if (runRef === 'current') {
      document.getElementById(`step-${id}`)?.focus()
    } else {
      document.getElementById('service-map')?.focus()
    }
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
            <p className="eyebrow scenario-label">Warehouse drill</p>
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
              {run && <button type="button" className="button secondary" onClick={reset}><RotateCcw size={16} /> Reset</button>}
              <button type="button" className="button primary" id="execute-drill" onClick={executeDrill}>
                <Play size={16} fill="currentColor" /> {run ? 'Rerun drill' : scenario.launchLabel}
              </button>
            </div>
          </div>
        </section>

        <section className="summary" aria-label="Drill outcome" aria-live="polite" aria-atomic="true">
          <div className="summary-cell"><span className="eyebrow">Runbook execution</span>
            <strong><i className={`status-dot ${run ? 'good' : 'neutral'}`} />{run ? 'Rollback completed' : 'Ready to run'}</strong>
          </div>
          <div className="summary-cell"><span className="eyebrow">Service verification</span>
            <strong className={run ? verdictTones[run.verdict] : 'neutral'}>
              <i className="status-dot" />{run?.verdict ?? 'Awaiting rollback'}
            </strong>
            {run && run.failedPhases.length > 0 && <span className="summary-note">Failed in {run.failedPhases.join(' and ')}</span>}
          </div>
          <div className="summary-cell summary-detail">
            <span className="eyebrow">{run ? `Run ${String(runCount).padStart(2, '0')}` : 'Starting state'}</span>
            {printOutcome
              ? <strong className={printOutcome.tone}>{printOutcome.description}</strong>
              : <span className="summary-note">Queue points to the primary gateway</span>}
            {pending && <span className="summary-note warning">Showing the previous plan</span>}
          </div>
        </section>

        <div className="workspace-grid">
          <section className="panel runbook" aria-labelledby="runbook-heading">
            <header className="panel-header"><h2 id="runbook-heading"><ClipboardList size={17} /> Runbook</h2><span className="panel-meta">{run ? currentRunLabel : 'Timeline'}</span></header>
            <div className="timeline">
              {phases.map((phase) => (
                <div className="phase" key={phase}>
                  <h3>{phase}</h3>
                  <ol>
                    {steps.filter((step) => step.phase === phase).map((step) => {
                      const snapshot = run?.snapshots.find(({ id }) => id === step.id)
                        ?? (step.id === initialSnapshot.id ? initialSnapshot : undefined)
                      const removed = scenario.canEditRollback && step.id === restoreQueue.id && !includeRestore
                      return (
                        <li key={step.id}>
                          <button type="button" className="step" id={`step-${step.id}`}
                            aria-current={selectedRef.run === 'current' && selectedRef.id === step.id ? 'step' : undefined}
                            disabled={!snapshot} onClick={() => setSelectedRef({ run: 'current', id: step.id })}>
                            <span className={`step-marker ${snapshot?.checks['label-printing'].status ?? ''}`} />
                            <span>{step.title}{removed && <small>Removed from plan</small>}
                              {scenario.canEditRollback && step.id === restoreQueue.id && !snapshot && <small>Pending execution</small>}
                            </span>
                            {selectedRef.run === 'current' && selectedRef.id === step.id && <ChevronRight className="step-chevron" size={15} aria-hidden="true" />}
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
            {scenario.canEditRollback && <div className="plan-editor">
              <h3>Edit rollback</h3>
              <p>{includeRestore ? restoreQueue.description : 'Add a step to point the queue back to gw-primary.'}</p>
              <button type="button" className="button edit-button" disabled={!run} onClick={() => setIncludeRestore(!includeRestore)}>
                {includeRestore ? <X size={16} /> : <Plus size={16} />}
                {includeRestore ? 'Remove endpoint restore' : restoreQueue.title}
              </button>
              <div className="pending" role="status">{pending && 'Pending edit · Rerun to apply'}</div>
            </div>}
          </section>

          <ServiceMap snapshot={selected} runLabel={activeRun ? inspectedRunLabel : undefined} />
          <Evidence snapshot={selected} requiredChecks={scenario.requiredChecks} run={activeRun} runLabel={inspectedRunLabel} comparison={comparison} selectedRunRef={selectedRef.run} onSelectSnapshot={selectSnapshot} />
        </div>

        <footer className="workspace-footer"><FlaskConical size={15} aria-hidden="true" /> Synthetic data <span>·</span> Checks the queue endpoint and its active path to the print service.</footer>
      </main>
    </>
  )
}
