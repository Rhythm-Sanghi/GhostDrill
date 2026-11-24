import { actions, boundaryLabels, caseOrder, maxCases, observationLabels, requirements, restartFixtures, restartLabels,
  type RestartRevision, type ScenarioId,
} from './restartModel'

function Choices<T extends string>({ title, available, selected, labels, onChange, allowEmpty = false }: {
  title: string
  available: readonly T[]
  selected: readonly T[]
  labels: Record<T, string>
  onChange: (next: T[]) => void
  allowEmpty?: boolean
}) {
  return (
    <fieldset className="restart-choices">
      <legend>{title}</legend>
      {available.map((id) => (
        <label key={id}>
          <input type="checkbox" checked={selected.includes(id)}
            disabled={!allowEmpty && selected.length === 1 && selected.includes(id)}
            onChange={(event) => onChange(event.currentTarget.checked ? [...selected, id] : selected.filter((item) => item !== id))} />
          {labels[id]}
        </label>
      ))}
    </fieldset>
  )
}

export function RestartDraft({ scenario, draft, pending, onChange, onRerun }: {
  scenario: ScenarioId
  draft: RestartRevision
  pending: boolean
  onChange: (revision: RestartRevision) => void
  onRerun: () => void
}) {
  const fixture = restartFixtures[scenario]
  function move(index: number, direction: -1 | 1) {
    const order = [...draft.actions]
    const [action] = order.splice(index, 1)
    order.splice(index + direction, 0, action)
    onChange({ ...draft, actions: order })
  }
  return (
    <section className="panel restart-draft" aria-labelledby="restart-draft-heading">
      <header className="panel-header"><h2 id="restart-draft-heading" tabIndex={-1}>Repair the draft</h2></header>
      <div className="restart-panel-body">
        {scenario === 'shipping-release' && (
          <>
            <p>{draft.releasePolicy === 'stable-key' ? 'Retries use the same batch key.' : 'Each retry can commit another release.'}</p>
            <button className="button secondary" type="button" onClick={() => onChange({
              ...draft, releasePolicy: draft.releasePolicy === 'repeat' ? 'stable-key' : 'repeat',
            })}>{draft.releasePolicy === 'repeat' ? 'Use a stable batch key' : 'Repeat without a stable key'}</button>
          </>
        )}
        <details open={scenario === 'routing-verification' ? true : undefined}>
          <summary>Edit ordered actions</summary>
          <ol className="restart-plan">
            {draft.actions.map((id, index) => (
              <li key={id}>
                <span>{actions[id]}</span>
                <div>
                  <button type="button" className="button move-button" aria-label={`Move up: ${actions[id]}`} disabled={!index} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" className="button move-button" aria-label={`Move down: ${actions[id]}`}
                    disabled={index === draft.actions.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" className="button move-button" aria-label={`Remove ${actions[id]}`}
                    disabled={draft.actions.length === 1} onClick={() => onChange({ ...draft, actions: draft.actions.filter((item) => item !== id) })}>×</button>
                </div>
              </li>
            ))}
          </ol>
          {fixture.actions.filter((id) => !draft.actions.includes(id)).map((id) => (
            <button type="button" className="step-link" key={id}
              onClick={() => onChange({ ...draft, actions: [...draft.actions, id] })}>Add {actions[id]}</button>
          ))}
        </details>
        <details>
          <summary>Edit requirements and exploration scope</summary>
          <Choices title="Requirements" available={fixture.requirements} selected={draft.requirements} labels={requirements}
            onChange={(next) => onChange({ ...draft, requirements: next })} allowEmpty />
          <Choices title="Interruption boundaries" available={fixture.boundaries} selected={draft.boundaries} labels={boundaryLabels}
            onChange={(next) => onChange({ ...draft, boundaries: next })} />
          <Choices title="Observations" available={fixture.observations} selected={draft.observations} labels={observationLabels}
            onChange={(next) => onChange({ ...draft, observations: next })} />
          <Choices title="Restart choices" available={caseOrder.restartPolicies} selected={draft.restartPolicies} labels={restartLabels}
            onChange={(next) => onChange({ ...draft, restartPolicies: next })} />
          <label>Case limit <input type="number" min={1} max={maxCases} value={draft.limit} onChange={(event) => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isInteger(value) && value >= 1 && value <= maxCases) onChange({ ...draft, limit: value })
          }} /></label>
        </details>
        {pending && <p className="warning" role="status">Draft changes pending. Exports use evaluated revisions.</p>}
        <button className="button primary" type="button" onClick={onRerun}>Rerun interruption cases</button>
      </div>
    </section>
  )
}
