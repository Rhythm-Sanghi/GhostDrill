import { createRollbackPlan, dispatchReview, scenarios, type DrillScenario, type RunbookStep } from './scenario.ts'
import { assumptionOptions, recordDrill, recordedPlan, recordedRequirements, type CompletedRun, type ScenarioAssumption } from './rehearsal.ts'
import { acceptanceRules } from './acceptance.ts'

const format = 'ghost-drill-replay'
const formatVersion = 2
const simulatorVersion = 1
export const replayByteLimit = 16 * 1024

function encodeRun(scenario: DrillScenario, { number, run }: CompletedRun) {
  return {
    number,
    assumption: run.assumption,
    acceptanceChecks: recordedRequirements(run),
    steps: recordedPlan(scenario, run).map(({ id, action }) => ({ id, action: action.type })),
  }
}

export const sampleReviewJson = JSON.stringify({
  format, formatVersion, simulatorVersion,
  scenario: dispatchReview.id,
  latest: {
    number: 1,
    assumption: 'restored',
    steps: dispatchReview.rollbackSteps.map(({ id, action }) => ({ id, action: action.type })),
    acceptanceChecks: acceptanceRules(dispatchReview),
  },
  contingencies: [],
})

export function nextRunNumber(number: number) {
  // At the safe integer limit, renumber the two retained runs as 01 and 02.
  return number === Number.MAX_SAFE_INTEGER ? 2 : number + 1
}

export function buildReplayFile(scenario: DrillScenario, latest: CompletedRun, previous: CompletedRun | undefined, contingencies: readonly ScenarioAssumption[]) {
  return {
    filename: `ghost-drill-${scenario.id}-replay-run-${String(latest.number).padStart(2, '0')}.json`,
    json: JSON.stringify({
      format, formatVersion, simulatorVersion,
      scenario: scenario.id,
      latest: encodeRun(scenario, latest),
      previous: previous && encodeRun(scenario, previous),
      contingencies,
    }, null, 2) + '\n',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readAssumption(scenario: DrillScenario, value: unknown): ScenarioAssumption {
  const result = assumptionOptions(scenario).find((option) => option === value)
  if (!result) throw new Error('The replay contains an unsupported scenario assumption.')
  return result
}

function readPlan(scenario: DrillScenario, value: unknown): RunbookStep[] {
  const available = createRollbackPlan(scenario, true)
  if (!Array.isArray(value) || value.length < scenario.rollbackSteps.length || value.length > available.length) {
    throw new Error('The replay has an invalid number of rollback actions.')
  }
  const ids = new Set<string>()
  const plan = value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string') throw new Error('A replay action is missing its step ID.')
    const step = available.find(({ id }) => id === entry.id)
    if (!step || ids.has(step.id)) throw new Error('The replay contains an unknown or duplicate step ID.')
    if (entry.action !== step.action.type) throw new Error('A replay action does not match its supported step.')
    ids.add(step.id)
    return step
  })
  if (scenario.rollbackEditor !== 'order' && plan.some((step, index) => step.id !== available[index].id)) {
    throw new Error('The replay has an unsupported rollback order.')
  }
  return plan
}

function readAcceptanceChecks(scenario: DrillScenario, value: unknown) {
  if (value === null) return null
  const available = acceptanceRules(scenario)
  if (!Array.isArray(value) || value.length > available.length || new Set(value).size !== value.length) {
    throw new Error('The replay has invalid or duplicate acceptance checks.')
  }
  return value.map((id: unknown) => {
    const check = available.find((entry) => entry === id)
    if (!check) throw new Error('The replay contains an unsupported acceptance check.')
    return check
  })
}

function decodeRun(scenario: DrillScenario, value: unknown, version: number): CompletedRun {
  if (!isRecord(value) || typeof value.number !== 'number'
    || !Number.isSafeInteger(value.number) || value.number < 1) {
    throw new Error('The replay has an invalid completed run ID.')
  }
  const assumption = readAssumption(scenario, value.assumption)
  const checks = version === 1 ? null : readAcceptanceChecks(scenario, value.acceptanceChecks)
  return { number: value.number, run: recordDrill(scenario, readPlan(scenario, value.steps), assumption, checks) }
}

export function readReplayFile(json: string) {
  if (new TextEncoder().encode(json).length > replayByteLimit) throw new Error('This replay exceeds the 16 KB limit.')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('This file is not readable JSON. Choose a Ghost Drill replay file.')
  }
  if (!isRecord(value) || value.format !== format) throw new Error('Choose a Ghost Drill replay file.')
  if ((value.formatVersion !== 1 && value.formatVersion !== formatVersion) || value.simulatorVersion !== simulatorVersion) {
    throw new Error('This replay format or simulator version is unsupported.')
  }
  const scenario = scenarios.find(({ id }) => id === value.scenario)
  if (!scenario || (value.formatVersion === 1 && scenario.id === dispatchReview.id)) throw new Error('The replay uses an unsupported scenario.')
  const latest = decodeRun(scenario, value.latest, value.formatVersion)
  const previous = value.previous === undefined ? undefined : decodeRun(scenario, value.previous, value.formatVersion)
  if (previous && previous.number !== latest.number - 1) throw new Error('The replay has duplicate or out-of-order run IDs.')
  if (!Array.isArray(value.contingencies) || value.contingencies.length >= assumptionOptions(scenario).length) {
    throw new Error('The replay has an invalid number of contingency cases.')
  }
  const contingencies = value.contingencies.map((entry: unknown) => readAssumption(scenario, entry))
  if (contingencies.includes(latest.run.assumption) || new Set(contingencies).size !== contingencies.length) {
    throw new Error('The replay contains a duplicate contingency assumption.')
  }
  return { scenario, latest, previous, contingencies }
}
