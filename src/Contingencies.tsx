import { assumptionLabels, type ContingencyResult, type RecordedDrill } from './rehearsal'
import { formatRunId } from './report'
import { getCheck } from './simulator'
import type { DrillScenario } from './scenario'

const tones = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

export function Contingencies({ scenario, run, number, results, onReturn }: {
  scenario: DrillScenario
  run: RecordedDrill
  number: number
  results: readonly ContingencyResult[]
  onReturn: () => void
}) {
  const original = getCheck(run.finalSnapshot, scenario.serviceCheck)
  return (
    <section className="panel contingencies" aria-labelledby="contingencies-heading">
      <header className="panel-header">
        <h2 id="contingencies-heading" tabIndex={-1}>Contingency results</h2>
        <button type="button" className="step-link" onClick={onReturn}>Back to run outcome</button>
      </header>
      <p className="contingency-note">Every case uses the same recorded rollback order.</p>
      <div className="contingency-grid">
        <article className="proof-check">
          <h3>Original {formatRunId(number)}</h3>
          <strong className={tones[run.verdict]}>{run.verdict}</strong>
          <p>{assumptionLabels[run.assumption]}.</p>
          <p>{original.reason}</p>
        </article>
        {results.map(({ assumption, verdict, title, evidence }) => (
          <article className="proof-check" key={assumption}>
            <h3>{title}</h3>
            <strong className={tones[verdict]}>{verdict}</strong>
            <p>{assumptionLabels[assumption]}.</p>
            <p>{evidence}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
