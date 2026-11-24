import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Activity, ArrowLeft, Download, FlaskConical } from 'lucide-react'
import { RestartDraft } from './RestartDraft'
import type { CaseResult, Exploration } from './restartEngine'
import { actions, boundaryLabels, observationLabels, requirements, restartFixtures, restartLabels, type ScenarioId } from './restartModel'
import {
  buildRestartReplay, caseLabel, dispositionOptions, evaluateRestartReplay, noteLimit,
  restartMarkdown, revisionFingerprint, type RestartReplay, type ReviewNote,
} from './restartReplay'
import { downloadFile } from './report'

const tones = { Pass: 'good', Violation: 'bad', 'Needs evidence': 'warning', Inconclusive: 'warning' }
const scopeLabels = {
  requirements: 'requirements', boundaries: 'boundaries', observations: 'observations',
  restartPolicies: 'restart choices', limit: 'case limit',
}

function focusReview(id: string) {
  const target = document.getElementById(id)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
}

function Coverage({ title, exploration, onInspect, inspectLabel }: {
  title: string
  exploration: Exploration
  onInspect: () => void
  inspectLabel: string
}) {
  const clean = exploration.results[0]
  return (
    <div className="summary-cell">
      <span className="eyebrow">{title}</span>
      <strong className={tones[exploration.outcome]}>{exploration.outcome}</strong>
      <p>Uninterrupted run · {clean.status} · Service {clean.serviceRecovered ? 'recovered' : 'down'}</p>
      <p>{exploration.counts.Pass} passed · {exploration.counts.Violation} failed · {exploration.counts['Needs evidence']} need evidence</p>
      <p>{exploration.complete ? 'Coverage complete' : 'Coverage incomplete · Case limit reached'} · {exploration.results.length}/{exploration.total}</p>
      {!exploration.complete && <p>Unexamined cases remain inconclusive.</p>}
      {exploration.counterexample && <button type="button" className="step-link comparison-jump" onClick={onInspect}>{inspectLabel}</button>}
    </div>
  )
}

function Trace({ result, revisionLabel, onInspectRepaired }: {
  result: CaseResult
  revisionLabel: string
  onInspectRepaired?: () => void
}) {
  return (
    <div className="restart-trace">
      <h3>Execution trace · {revisionLabel}</h3>
      <ol>
        {result.trace.map((event, index) => (
          <li key={event.number} id={`restart-event-${event.number}`} tabIndex={-1}
            aria-label={`Event ${event.number} · ${event.title} · ${revisionLabel} · ${event.attempt}`}
            className={event.number === result.firstFailure?.event ? 'failed-event' : undefined}>
            {(event.attempt !== result.trace[index - 1]?.attempt || event.number === result.firstFailure?.event
              || event.title === 'Original receipt reused') && <span className="eyebrow">{revisionLabel} · {event.attempt}</span>}
            <strong>Event {event.number} · {event.title}</strong>
            <p>{event.detail}</p>
            <p className="trace-state">Saved checkpoint · {event.nextAction ? actions[event.nextAction] : 'End of runbook'}
              {result.scenario === 'shipping-release' ? ` · ${event.releases} committed ${event.releases === 1 ? 'release' : 'releases'}` : ''}
              {event.receipt ? ` · Saved receipt ${event.receipt}` : ''}
              {event.response !== 'Not requested' ? ` · Response ${event.response.toLowerCase()}` : ''}</p>
            {event.number === result.firstFailure?.event && (
              <div className="map-actions">
                <button type="button" className="step-link" onClick={() => focusReview('restart-draft-heading')}>Back to repair</button>
                {onInspectRepaired && <button type="button" className="step-link" onClick={onInspectRepaired}>Inspect repaired case</button>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function RestartReview({ initial, onBack, onScenario, onOpen, status }: {
  initial: RestartReplay
  onBack: () => void
  onScenario: (scenario: ScenarioId) => void
  onOpen: (file: File) => void
  status: { text: string; error?: boolean } | null
}) {
  const { scenario, original } = initial
  const fixture = restartFixtures[scenario]
  const [revised, setRevised] = useState(initial.revised)
  const [draft, setDraft] = useState(initial.revised ?? original)
  const [review, setReview] = useState<ReviewNote | undefined>(initial.review)
  const [view, setView] = useState<'before' | 'after'>(initial.revised ? 'after' : 'before')
  const evaluated = useMemo(() => evaluateRestartReplay({ scenario, original, revised }), [scenario, original, revised])
  const [caseId, setCaseId] = useState(evaluated.before.counterexample?.testCase.id ?? 'uninterrupted')
  const fileInput = useRef<HTMLInputElement>(null)
  const current = revised ?? original
  const currentFingerprint = revisionFingerprint(scenario, current)
  const draftFingerprint = revisionFingerprint(scenario, draft)
  const pending = draftFingerprint !== currentFingerprint
  const reviewedEarlier = review && (review.fingerprint !== currentFingerprint || pending)
  const exploration = view === 'after' && evaluated.after ? evaluated.after : evaluated.before
  const revision = view === 'after' && revised ? revised : original
  const result = exploration.results.find(({ testCase }) => testCase.id === caseId) ?? exploration.results[0]
  const { comparison } = evaluated
  const originalFailureId = evaluated.before.counterexample?.testCase.id
  const repairedCase = comparison?.changed.length === 0 && originalFailureId
    ? evaluated.after?.results.find(({ testCase, status: verdict }) => testCase.id === originalFailureId && verdict === 'Pass')
    : undefined

  function selectCase(id: string, target: 'before' | 'after' = view) {
    setView(target)
    setCaseId(id)
  }

  function firstFailure(target: 'before' | 'after') {
    const counterexample = evaluated[target]?.counterexample
    if (!counterexample) return
    flushSync(() => selectCase(counterexample.testCase.id, target))
    focusReview(`restart-event-${counterexample.firstFailure?.event}`)
  }

  function inspectRepairedCase() {
    if (!repairedCase) return
    flushSync(() => selectCase(repairedCase.testCase.id, 'after'))
    const receipt = repairedCase.trace.find(({ title }) => title === 'Original receipt reused')
    focusReview(receipt ? `restart-event-${receipt.number}` : 'restart-evidence-heading')
  }

  function rerun() {
    flushSync(() => {
      setRevised(draft)
      setView('after')
    })
    focusReview('restart-comparison-heading')
  }

  function exportReview(kind: 'json' | 'md') {
    const packet = { scenario, original, revised, review }
    const replay = buildRestartReplay(packet)
    if (kind === 'json') downloadFile(replay.filename, replay.json, 'application/json')
    else downloadFile(replay.filename.replace(/\.json$/, '.md'), restartMarkdown(packet, evaluated), 'text/markdown;charset=utf-8')
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-icon"><Activity size={21} aria-hidden="true" /></span> Ghost Drill</div>
          <span className="simulation-label"><FlaskConical size={15} aria-hidden="true" /> Simulation</span>
        </div>
      </header>
      <main className="workspace restart-workspace">
        <section className="intro" aria-labelledby="restart-heading">
          <div>
            <p className="eyebrow scenario-label">Restart review</p>
            <h1 id="restart-heading" tabIndex={-1}>{fixture.title}</h1>
            <p className="intro-description">{fixture.description}</p>
          </div>
          <div className="restart-controls">
            <label className="scenario-picker">Restart scenario
              <select value={scenario} onChange={(event) => onScenario(event.currentTarget.value === 'shipping-release'
                ? 'shipping-release' : 'routing-verification')}>
                <option value="shipping-release">{restartFixtures['shipping-release'].title}</option>
                <option value="routing-verification">{restartFixtures['routing-verification'].title}</option>
              </select>
            </label>
            <button type="button" className="step-link restart-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Back to drills</button>
            <button type="button" className="step-link" onClick={() => fileInput.current?.click()}>Open replay file</button>
            <input type="file" ref={fileInput} hidden accept=".json,application/json" aria-label="Choose a restart replay"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) onOpen(file)
              }} />
          </div>
        </section>
        <p className={status?.error ? 'import-status bad' : 'import-status'} role="status">{status?.text}</p>
        <section className="summary restart-summary" aria-label="Exploration coverage">
          <Coverage title="Original plan" exploration={evaluated.before}
            onInspect={() => firstFailure('before')} inspectLabel="Inspect first counterexample" />
          {evaluated.after && <Coverage title="Revised plan" exploration={evaluated.after}
            onInspect={() => firstFailure('after')} inspectLabel="Inspect revised counterexample" />}
        </section>
        {comparison && (
          <section className="panel restart-compare" aria-labelledby="restart-comparison-heading">
            <header className="panel-header"><h2 id="restart-comparison-heading" tabIndex={-1}>Coverage comparison</h2></header>
            <div className="restart-panel-body" role="status">
              <p>{comparison.matched} cases rechecked · {comparison.notRepeated} original cases not repeated · {comparison.newCases} newly evaluated</p>
              {comparison.changed.length
                ? <p className="warning">Scope changed · {comparison.changed.map((key) => scopeLabels[key]).join(', ')}. Repair totals withheld.</p>
                : <p>{comparison.fixed} fixed · {comparison.remaining} still failing · {comparison.introduced} newly failing · {comparison.inconclusive} need evidence after repair</p>}
            </div>
            {repairedCase && (
              <div className="restart-panel-body restart-comparison-action">
                <button type="button" className="step-link" onClick={inspectRepairedCase}>Inspect repaired case</button>
              </div>
            )}
          </section>
        )}
        <div className="restart-grid">
          <RestartDraft scenario={scenario} draft={draft} pending={pending} onChange={setDraft} onRerun={rerun} />
          <section className="panel restart-evidence" aria-labelledby="restart-evidence-heading">
            <header className="panel-header"><h2 id="restart-evidence-heading" tabIndex={-1}>Inspect an execution</h2></header>
            <div className="restart-panel-body">
              {revised && <div className="map-actions" aria-label="Evaluated plan">
                <button type="button" className="button secondary" aria-pressed={view === 'before'} onClick={() => setView('before')}>Original evidence</button>
                <button type="button" className="button secondary" aria-pressed={view === 'after'} onClick={() => setView('after')}>Revised evidence</button>
              </div>}
              <div className="restart-select">
                <label htmlFor="restart-case">Execution case · {view === 'before' ? 'Original plan' : 'Revised plan'}</label>
                <select id="restart-case" value={result.testCase.id} onChange={(event) => selectCase(event.currentTarget.value)}>
                  {exploration.results.map((item) => <option key={item.testCase.id} value={item.testCase.id}>
                    {caseLabel(item.testCase)} · {item.status}
                  </option>)}
                </select>
              </div>
              <div className="map-actions">
                {result.testCase.id !== 'uninterrupted' && <button type="button" className="step-link" onClick={() => selectCase('uninterrupted')}>View uninterrupted run</button>}
              </div>
              <p className={tones[result.status]}><strong>{result.status}</strong> · Service {result.serviceRecovered ? 'recovered' : 'down'}
                {scenario === 'shipping-release' ? ` · ${result.releases} committed ${result.releases === 1 ? 'release' : 'releases'}` : ''}</p>
              <ul className="restart-findings">
                {result.findings.map(({ id, status: findingStatus, reason, event }) => (
                  <li key={id}><strong className={tones[findingStatus]}>{findingStatus}</strong> · {requirements[id]}. {reason}
                    {event && <button className="step-link" type="button" aria-label={`Inspect event ${event} for ${requirements[id]}`}
                      onClick={() => focusReview(`restart-event-${event}`)}>Inspect event {event}</button>}
                  </li>
                ))}
              </ul>
              {!result.boundaryReached && <p className="warning">The selected interruption boundary did not occur in this execution.</p>}
              {!result.findings.length && <p className="warning">No requirements were selected.</p>}
              <details>
                <summary>Evaluated scope</summary>
                <dl className="restart-scope">
                  <dt>Boundaries</dt><dd>{revision.boundaries.map((id) => boundaryLabels[id]).join('; ')}</dd>
                  <dt>Observations</dt><dd>{revision.observations.map((id) => observationLabels[id]).join('; ')}</dd>
                  <dt>Restart choices</dt><dd>{revision.restartPolicies.map((id) => restartLabels[id]).join('; ')}</dd>
                  <dt>Case limit</dt><dd>{revision.limit}</dd>
                </dl>
              </details>
              <Trace result={result} revisionLabel={view === 'before' ? 'Original plan' : 'Revised plan'}
                onInspectRepaired={view === 'before' && repairedCase?.testCase.id === result.testCase.id ? inspectRepairedCase : undefined} />
            </div>
          </section>
          <section className="panel restart-share" aria-labelledby="restart-share-heading">
            <header className="panel-header"><h2 id="restart-share-heading">Share the review</h2></header>
            <div className="restart-panel-body">
              <button className="step-link report-download" type="button" onClick={() => exportReview('md')}><Download size={15} aria-hidden="true" /> Download restart report</button>
              <p>Markdown for a change ticket.</p>
              <button className="step-link report-download" type="button" onClick={() => exportReview('json')}><Download size={15} aria-hidden="true" /> Export restart replay</button>
              <p>JSON for independent verification.</p>
              <details>
                <summary>Local reviewer disposition</summary>
                <p>Revision fingerprint {currentFingerprint} identifies the evaluated inputs.</p>
                <p>Local notes record a model review only and carry no approval authority.</p>
                {review && <p role="status" className={reviewedEarlier ? 'warning' : 'good'}>{review.disposition}
                  {reviewedEarlier ? ' · Belongs to an earlier revision' : ` · Revision ${review.fingerprint}`}</p>}
                <form onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  const disposition = dispositionOptions.find((item) => item === data.get('disposition'))
                  if (disposition) setReview({ disposition, note: String(data.get('note') ?? ''), fingerprint: currentFingerprint })
                }}>
                  <label>Disposition<select name="disposition" defaultValue={review?.disposition ?? dispositionOptions[0]}>
                    {dispositionOptions.map((item) => <option key={item}>{item}</option>)}
                  </select></label>
                  <label>Reviewer note<textarea name="note" maxLength={noteLimit} defaultValue={review?.note ?? ''} /></label>
                  <button type="submit" className="button secondary" disabled={pending}>Save local disposition</button>
                </form>
              </details>
            </div>
          </section>
        </div>
        <footer className="workspace-footer"><FlaskConical size={15} aria-hidden="true" /> Synthetic data <span>·</span> One interruption per case. Conclusions apply to the evaluated model and scope.</footer>
      </main>
    </>
  )
}
