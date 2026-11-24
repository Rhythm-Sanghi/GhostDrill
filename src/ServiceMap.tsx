import { Database, GitFork, Plug, Printer, Router } from 'lucide-react'
import { endpoints, type DispatchState, type Endpoint, type Reachability } from './scenario'
import { getCheck, type Snapshot } from './simulator'

const gatewayOrder: readonly Endpoint[] = ['primary', 'backup']
const pathLabels: Record<Reachability, { text: string; tone: string; connection: string }> = {
  reachable: { text: 'Path reachable', tone: 'good', connection: 'active' },
  unreachable: { text: 'Path unreachable', tone: 'bad', connection: 'failed' },
  unobserved: { text: 'Path unobserved', tone: 'warning', connection: 'unobserved' },
}
const printerLabels = {
  healthy: { text: 'Can print', tone: 'good', node: 'available' },
  unhealthy: { text: 'Cannot print', tone: 'bad', node: 'unavailable' },
  unknown: { text: 'Print status unknown', tone: 'warning', node: 'unobserved' },
}

export function ServiceMap({ snapshot, runLabel, onReturnToLatest, onBackToComparison }: {
  snapshot: Snapshot
  runLabel?: string
  onReturnToLatest?: () => void
  onBackToComparison?: () => void
}) {
  const { state } = snapshot
  const printer = state.kind === 'warehouse' ? printerLabels[getCheck(snapshot, 'label-printing').status] : null

  return (
    <section className="panel map" id="service-map" tabIndex={-1} aria-labelledby="map-heading" aria-describedby={runLabel ? 'map-run' : undefined}>
      <header className="panel-header">
        <h2 id="map-heading"><GitFork size={17} /> Service map</h2>
        <span className="panel-meta">{snapshot.phase} snapshot</span>
      </header>
      <div className="map-canvas">
        <div className="map-context">
          <span className="eyebrow" id="map-run">{runLabel ?? (state.kind === 'dispatch' ? 'Dispatch network' : 'Warehouse network')}</span>
          <strong>{snapshot.title}</strong>
          {(onBackToComparison || onReturnToLatest) && (
            <div className="map-actions">
              {onBackToComparison && <button type="button" className="step-link" onClick={onBackToComparison}>Back to comparison</button>}
              {onReturnToLatest && <button type="button" className="step-link" onClick={onReturnToLatest}>Return to latest run</button>}
            </div>
          )}
        </div>
        {state.kind === 'dispatch' && <DispatchTopology state={state} />}
        {state.kind === 'warehouse' && printer && <div className="topology">
          <div className="map-node queue-node">
            <Database size={19} aria-hidden="true" />
            <strong>Label queue</strong>
            <span className="mono">{endpoints[state.queueEndpoint].address}</span>
          </div>
          {gatewayOrder.map((endpoint) => {
            const active = state.queueEndpoint === endpoint
            const path = pathLabels[state.printPaths[endpoint]]
            const connection = active ? 'active' : 'inactive'
            const printConnection = active ? path.connection : 'inactive'
            return (
              <div className="gateway-route" key={endpoint}>
                <div className={`connection from-queue ${endpoint} ${connection}`} aria-hidden="true" />
                <div className={`map-node gateway-node ${endpoint} ${active ? 'selected' : ''}`}>
                  <Router size={19} aria-hidden="true" />
                  <strong>{endpoints[endpoint].name}</strong>
                  <span className={path.tone}>{path.text}</span>
                  {active && <span className="active-endpoint mono">Queue target</span>}
                </div>
                <div className={`connection to-printer ${endpoint} ${printConnection}`} aria-hidden="true" />
              </div>
            )
          })}
          <div className={`map-node printer-node ${printer.node}`}>
            <Printer size={19} aria-hidden="true" />
            <strong>Label service</strong>
            <span className={printer.tone}>{printer.text}</span>
          </div>
        </div>}
      </div>
      {printer && <div className="map-legend">
        <span><i className="legend-line active" /> Active route</span>
        <span><i className="legend-line inactive" /> Inactive route</span>
        <span><i className="legend-line failed" /> Blocked route</span>
        {printer.node === 'unobserved' && <span><i className="legend-line unobserved" /> Unobserved route</span>}
      </div>}
    </section>
  )
}

function DispatchTopology({ state }: { state: DispatchState }) {
  const open = state.queue === 'open'
  return (
    <div className="dispatch-topology">
      <div className={`map-node ${open ? 'available' : 'unavailable'}`}>
        <Database size={19} aria-hidden="true" />
        <strong>Dispatch queue</strong>
        <span className={open ? 'good' : 'bad'}>{open ? 'Queue open' : 'Queue paused'}</span>
      </div>
      <span className="dispatch-dependency">Requires <span aria-hidden="true">→</span></span>
      <div className={`map-node ${state.connectorReady ? 'available' : 'unavailable'}`}>
        <Plug size={19} aria-hidden="true" />
        <strong>Shipping connector</strong>
        <span className={state.connectorReady ? 'good' : 'bad'}>{state.connectorReady ? 'Connector ready' : 'Connector offline'}</span>
      </div>
    </div>
  )
}
