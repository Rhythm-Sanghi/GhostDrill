import { Activity } from 'lucide-react'
import type { CheckId } from './scenario'
import { checkNames, type DrillRun, type Snapshot } from './simulator'

const resultLabels = {
  healthy: { text: 'Healthy', tone: 'good' },
  unhealthy: { text: 'Unhealthy', tone: 'bad' },
  unknown: { text: 'Unknown', tone: 'warning' },
}

type CheckResult = Snapshot['checks'][CheckId]

export function Evidence({ snapshot, requiredChecks, run, jumpToStep }: {
  snapshot: Snapshot
  requiredChecks: readonly CheckId[]
  run: DrillRun | null
  jumpToStep: (id: string) => void
}) {
  const firstFailure = run?.firstFailure
  const showSnapshot = !run || snapshot.id !== run.finalSnapshot.id
  const outageObserved = run && firstFailure && run.snapshots.indexOf(firstFailure) <= run.snapshots.indexOf(snapshot)

  function renderResult(id: CheckId, phase: string, result: CheckResult) {
    const { tone, text } = resultLabels[result.status]
    const responsible = id === 'label-printing' && phase === 'Rollback' && result.status === 'unhealthy'
    return (
      <div className="proof-result" role="group" aria-label={phase}>
        <div className="proof-status"><span>{phase}</span><strong className={tone}>{text}</strong></div>
        <p>{result.reason}</p>
        {'stepId' in result && (
          <button type="button" className="step-link" onClick={() => jumpToStep(result.stepId)}
            aria-label={responsible ? undefined : `View ${phase} step for ${checkNames[id]}`}>
            {responsible ? 'Inspect responsible step' : 'View step'}
          </button>
        )}
      </div>
    )
  }

  return (
    <section className="panel evidence" aria-labelledby="evidence-heading">
      <header className="panel-header"><h2 id="evidence-heading"><Activity size={17} /> Evidence</h2></header>
      <div className="evidence-body">
        {showSnapshot && (
          <section className="proof-group" aria-label="Selected snapshot" aria-live="polite">
            <h3 className="eyebrow">Selected snapshot</h3>
            {requiredChecks.map((id) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {renderResult(id, snapshot.phase, snapshot.checks[id])}
              </article>
            ))}
          </section>
        )}
        {outageObserved && <p className="first-outage">First outage <strong>{firstFailure.phase} · {firstFailure.title}</strong></p>}
        {run && (
          <section className="proof-group" aria-label="Rollback proof">
            <h3 className="eyebrow">Rollback proof</h3>
            {run.comparisons.length === 0 && <p>No required checks are configured.</p>}
            {run.comparisons.map(({ id, baseline, rollback }) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {renderResult(id, 'Baseline', baseline)}
                {renderResult(id, 'Rollback', rollback)}
              </article>
            ))}
          </section>
        )}
      </div>
    </section>
  )
}
