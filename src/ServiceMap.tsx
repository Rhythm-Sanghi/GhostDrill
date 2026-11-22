import { Database, GitFork, Printer, Router } from 'lucide-react'
import { endpoints, type Endpoint, type Reachability } from './scenario'
import type { Snapshot } from './simulator'

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

export function ServiceMap({ snapshot }: { snapshot: Snapshot }) {
  const { state, checks } = snapshot
  const printer = printerLabels[checks['label-printing'].status]

  return (
    <section className="panel map" aria-labelledby="map-heading">
      <header className="panel-header">
        <h2 id="map-heading"><GitFork size={17} /> Service map</h2>
        <span className="panel-meta">{snapshot.phase} snapshot</span>
      </header>
      <div className="map-canvas">
        <div className="map-context">
          <span className="eyebrow">Warehouse network</span>
          <strong>{snapshot.title}</strong>
        </div>
        <div className="topology">
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
        </div>
      </div>
      <div className="map-legend">
        <span><i className="legend-line active" /> Active route</span>
        <span><i className="legend-line inactive" /> Inactive route</span>
        <span><i className="legend-line failed" /> Blocked route</span>
        {printer.node === 'unobserved' && <span><i className="legend-line unobserved" /> Unobserved route</span>}
      </div>
    </section>
  )
}
