import { Activity, Check, ChevronRight, ClipboardList, FlaskConical, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { changeSteps, createRollbackPlan, endpoints, restoreQueue, type Phase } from './scenario'
import { createBaselineSnapshot, runWarehouse, type Snapshot, type WarehouseRun } from './simulator'
import { ServiceMap } from './ServiceMap'

const initialSnapshot = createBaselineSnapshot()
const phases: readonly Phase[] = ['Baseline', 'Change', 'Rollback']

export function App() {
  const [includeRestore, setIncludeRestore] = useState(false)
  const [run, setRun] = useState<WarehouseRun | null>(null)
  const [selectedId, setSelectedId] = useState(initialSnapshot.id)
  const [runCount, setRunCount] = useState(0)
  const plan = createRollbackPlan(includeRestore)
  const selected = run?.snapshots.find(({ id }) => id === selectedId) ?? initialSnapshot
  const firstFailure = selected.phase === 'Baseline' ? undefined : run?.firstFailure
  const pending = Boolean(run && run.completedRollbackSteps !== plan.length)
  const runPassed = run?.finalSnapshot.check.status === 'pass'
  const steps = [
    { ...initialSnapshot, phase: 'Baseline' as const },
    ...changeSteps.map((step) => ({ ...step, phase: 'Change' as const })),
    ...plan.map((step) => ({ ...step, phase: 'Rollback' as const })),
  ]
  if (!includeRestore && run?.snapshots.some(({ id }) => id === restoreQueue.id)) {
    steps.push({ ...restoreQueue, phase: 'Rollback' })
  }

  function executeDrill() {
    const nextRun = runWarehouse(plan)
    setRun(nextRun)
    setSelectedId(nextRun.finalSnapshot.id)
    setRunCount(runCount + 1)
  }

  function reset() {
    setIncludeRestore(false)
    setRun(null)
    setSelectedId(initialSnapshot.id)
    setRunCount(0)
    document.getElementById('execute-drill')?.focus()
  }

  function jumpToStep(id: string) {
    setSelectedId(id)
    document.getElementById(`step-${id}`)?.focus()
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
            <h1 id="scenario-heading">Warehouse Label Outage</h1>
            <p className="intro-description">Rehearse a gateway change and see whether rollback brings shipping label printing back.</p>
          </div>
          <div className="intro-actions">
            {run && <button type="button" className="button secondary" onClick={reset}><RotateCcw size={16} /> Reset</button>}
            <button type="button" className="button primary" id="execute-drill" onClick={executeDrill}>
              <Play size={16} fill="currentColor" /> {run ? 'Rerun drill' : 'Try the warehouse drill'}
            </button>
          </div>
        </section>

        <section className="summary" aria-label="Drill outcome" aria-live="polite" aria-atomic="true">
          <div className="summary-cell"><span className="eyebrow">Runbook execution</span>
            <strong><i className={`status-dot ${run ? 'good' : 'neutral'}`} />{run ? 'Rollback completed' : 'Ready to run'}</strong>
          </div>
          <div className="summary-cell"><span className="eyebrow">Service outcome</span>
            <strong className={run && !runPassed ? 'bad' : 'good'}>
              <i className="status-dot" />{run ? runPassed ? 'Service recovered' : 'Service still down' : 'Service available'}
            </strong>
          </div>
          <div className="summary-cell summary-detail">
            <span className="eyebrow">{run ? `Run ${String(runCount).padStart(2, '0')}` : 'Starting state'}</span>
            <span>{run ? `${run.completedRollbackSteps} rollback ${run.completedRollbackSteps === 1 ? 'step' : 'steps'} executed` : 'Queue points to the primary gateway'}</span>
          </div>
        </section>

        <div className="workspace-grid">
          <section className="panel runbook" aria-labelledby="runbook-heading">
            <header className="panel-header"><h2 id="runbook-heading"><ClipboardList size={17} /> Runbook</h2><span className="panel-meta">Timeline</span></header>
            <div className="timeline">
              {phases.map((phase) => (
                <div className="phase" key={phase}>
                  <h3>{phase}</h3>
                  <ol>
                    {steps.filter((step) => step.phase === phase).map((step) => {
                      const snapshot = run?.snapshots.find(({ id }) => id === step.id)
                        ?? (step.id === initialSnapshot.id ? initialSnapshot : undefined)
                      const removed = step.id === restoreQueue.id && !includeRestore
                      return (
                        <li key={step.id}>
                          <button type="button" className="step" id={`step-${step.id}`}
                            aria-current={selected.id === step.id ? 'step' : undefined}
                            disabled={!snapshot} onClick={() => setSelectedId(step.id)}>
                            <span className={`step-marker ${snapshot?.check.status ?? ''}`} />
                            <span>{step.title}{removed && <small>Removed from plan</small>}
                              {step.id === restoreQueue.id && !snapshot && <small>Pending execution</small>}
                            </span>
                            {selected.id === step.id && <ChevronRight className="step-chevron" size={15} aria-hidden="true" />}
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
            <div className="plan-editor">
              <h3>Edit rollback</h3>
              <p>{includeRestore ? restoreQueue.description : 'Add a step to point the queue back to gw-primary.'}</p>
              <button type="button" className="button edit-button" disabled={!run} onClick={() => setIncludeRestore(!includeRestore)}>
                {includeRestore ? <X size={16} /> : <Plus size={16} />}
                {includeRestore ? 'Remove endpoint restore' : restoreQueue.title}
              </button>
              <div className="pending" role="status">{pending && 'Pending edit · Rerun to apply'}</div>
            </div>
          </section>

          <ServiceMap snapshot={selected} />
          <Evidence snapshot={selected} firstFailure={firstFailure} jumpToStep={jumpToStep} />
        </div>

        <footer className="workspace-footer"><FlaskConical size={15} aria-hidden="true" /> Synthetic data <span>·</span> Scope limited to the label queue’s path to the print service.</footer>
      </main>
    </>
  )
}

function Evidence({ snapshot, firstFailure, jumpToStep }: {
  snapshot: Snapshot
  firstFailure?: Snapshot
  jumpToStep: (id: string) => void
}) {
  const { check } = snapshot
  const passed = check.status === 'pass'
  return (
    <section className="panel evidence" aria-labelledby="evidence-heading">
      <header className="panel-header"><h2 id="evidence-heading"><Activity size={17} /> Evidence</h2></header>
      <div className="evidence-body" aria-live="polite" aria-atomic="true">
        <div className="eyebrow">Label service check</div>
        <div className={`check-result ${passed ? 'good' : 'bad'}`}>
          {passed ? <Check size={18} /> : <X size={18} />}
          <strong>{passed ? 'Printing available' : 'Printing unavailable'}</strong>
        </div>
        <p className="evidence-explanation">
          {passed
            ? `The ${check.endpoint} gateway can reach the print service.`
            : `The queue points to the ${check.endpoint} gateway, which cannot reach the print service.`}
        </p>
        <dl className="facts">
          <div><dt>Queue endpoint</dt><dd className="mono">{endpoints[check.endpoint].address}</dd></div>
          <div><dt>Print path</dt><dd className={passed ? 'good' : 'bad'}>{passed ? 'Reachable' : 'Unreachable'}</dd></div>
          {firstFailure && <div><dt>First outage</dt><dd>{firstFailure.phase} · {firstFailure.title}</dd></div>}
        </dl>
        {!passed && (
          <button type="button" className="button evidence-link" onClick={() => jumpToStep(check.responsibleStepId)}>
            Inspect responsible step
          </button>
        )}
      </div>
    </section>
  )
}
