import { Database, GitFork, Printer, Router } from 'lucide-react'
import { endpoints, type Endpoint } from './scenario'
import type { Snapshot } from './simulator'

const gatewayOrder: readonly Endpoint[] = ['primary', 'backup']

export function ServiceMap({ snapshot }: { snapshot: Snapshot }) {
  const { state, check } = snapshot
  const available = check.status === 'pass'

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
            const reachable = state.printPaths[endpoint] === 'reachable'
            const connection = active ? 'active' : 'inactive'
            const printConnection = reachable ? connection : active ? 'failed' : 'inactive'
            return (
              <div className="gateway-route" key={endpoint}>
                <div className={`connection from-queue ${endpoint} ${connection}`} aria-hidden="true" />
                <div className={`map-node gateway-node ${endpoint} ${active ? 'selected' : ''}`}>
                  <Router size={19} aria-hidden="true" />
                  <strong>{endpoints[endpoint].name}</strong>
                  <span className={reachable ? 'good' : 'bad'}>{reachable ? 'Path reachable' : 'Path unreachable'}</span>
                  {active && <span className="active-endpoint mono">Queue target</span>}
                </div>
                <div className={`connection to-printer ${endpoint} ${printConnection}`} aria-hidden="true" />
              </div>
            )
          })}
          <div className={`map-node printer-node ${available ? 'available' : 'unavailable'}`}>
            <Printer size={19} aria-hidden="true" />
            <strong>Label service</strong>
            <span className={available ? 'good' : 'bad'}>{available ? 'Can print' : 'Cannot print'}</span>
          </div>
        </div>
      </div>
      <div className="map-legend">
        <span><i className="legend-line active" /> Active route</span>
        <span><i className="legend-line inactive" /> Inactive route</span>
        <span><i className="legend-line failed" /> Blocked route</span>
      </div>
    </section>
  )
}
