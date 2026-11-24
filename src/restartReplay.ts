import { exploreRestart, type Exploration, type RestartCase } from './restartEngine.ts'
import {
  actions, boundaryLabels, caseOrder, defaultRevision, maxCases, observationLabels, requirements,
  restartFixtures, restartLabels, type RestartRevision, type ScenarioId,
} from './restartModel.ts'
import { replayByteLimit } from './replay.ts'

const format = 'ghost-drill-replay'
const formatVersion = 3
const modelVersion = 1
export const noteLimit = 500
export const dispositionOptions = ['Request changes', 'Ready for next review'] as const

export interface ReviewNote {
  fingerprint: string
  disposition: typeof dispositionOptions[number]
  note: string
}

export interface RestartReplay {
  scenario: ScenarioId
  original: RestartRevision
  revised?: RestartRevision
  review?: ReviewNote
}

export function caseLabel(testCase: RestartCase) {
  return 'boundary' in testCase
    ? `${boundaryLabels[testCase.boundary]} · ${restartLabels[testCase.restart]} · ${observationLabels[testCase.observation]}`
    : 'Uninterrupted run'
}

function normalizedScope(revision: RestartRevision) {
  return {
    requirements: [...revision.requirements].sort(),
    boundaries: [...revision.boundaries].sort(),
    observations: [...revision.observations].sort(),
    restartPolicies: [...revision.restartPolicies].sort(),
    limit: revision.limit,
  }
}

export function revisionFingerprint(scenario: ScenarioId, revision: RestartRevision) {
  const input = JSON.stringify([modelVersion, scenario, revision.actions, revision.releasePolicy, normalizedScope(revision)])
  let hash = 0xcbf29ce484222325n
  for (const char of input) hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n)
  return hash.toString(16).padStart(16, '0')
}

export function compareRestart(original: RestartRevision, revised: RestartRevision, before: Exploration, after: Exploration) {
  const beforeScope = normalizedScope(original)
  const afterScope = normalizedScope(revised)
  const changed = (Object.keys(beforeScope) as (keyof typeof beforeScope)[])
    .filter((key) => JSON.stringify(beforeScope[key]) !== JSON.stringify(afterScope[key]))
  const beforeById = new Map(before.results.map((result) => [result.testCase.id, result.status]))
  const afterById = new Map(after.results.map((result) => [result.testCase.id, result.status]))
  let fixed = 0
  let remaining = 0
  let introduced = 0
  let inconclusive = 0
  let matched = 0
  for (const [id, prior] of beforeById) {
    const current = afterById.get(id)
    if (!current) continue
    matched++
    if (prior === 'Violation' && current === 'Pass') fixed++
    if (prior === 'Violation' && current === 'Violation') remaining++
    if (prior === 'Violation' && current === 'Needs evidence') inconclusive++
    if (prior !== 'Violation' && current === 'Violation') introduced++
  }
  return { changed, matched, notRepeated: beforeById.size - matched, newCases: afterById.size - matched, fixed, remaining, introduced, inconclusive }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readList<T extends string>(input: unknown, allowed: readonly T[], label: string, allowEmpty = false): T[] {
  if (!Array.isArray(input) || input.length > allowed.length || (!allowEmpty && !input.length) || new Set(input).size !== input.length) {
    throw new Error(`Invalid or duplicate ${label} in the restart replay.`)
  }
  return input.map((value: unknown) => {
    const item = allowed.find((candidate) => candidate === value)
    if (!item) throw new Error(`Unrecognized ${label} in the restart replay.`)
    return item
  })
}

function readRevision(scenario: ScenarioId, value: unknown): RestartRevision {
  if (!record(value) || typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > maxCases) {
    throw new Error(`The case limit must be between 1 and ${maxCases}.`)
  }
  const fixture = restartFixtures[scenario]
  if (value.releasePolicy !== 'repeat' && (value.releasePolicy !== 'stable-key' || scenario !== 'shipping-release')) {
    throw new Error('The release policy is unsupported for this scenario.')
  }
  return {
    actions: readList(value.actions, fixture.actions, 'actions'),
    requirements: readList(value.requirements, fixture.requirements, 'requirements', true),
    releasePolicy: value.releasePolicy,
    boundaries: readList(value.boundaries, fixture.boundaries, 'interruption boundaries'),
    observations: readList(value.observations, fixture.observations, 'observations'),
    restartPolicies: readList(value.restartPolicies, caseOrder.restartPolicies, 'restart policies'),
    limit: value.limit,
  }
}

function readReview(value: unknown): ReviewNote {
  if (!record(value) || typeof value.fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(value.fingerprint)
    || typeof value.note !== 'string' || value.note.length > noteLimit) {
    throw new Error('The restart replay contains an invalid review note.')
  }
  const disposition = dispositionOptions.find((item) => item === value.disposition)
  if (!disposition) throw new Error('The restart replay contains an unsupported review disposition.')
  return { fingerprint: value.fingerprint, disposition, note: value.note }
}

export function looksLikeRestartReplay(value: unknown) {
  return record(value) && (value.formatVersion === 3 || value.reviewType === 'restart')
}

export function readRestartReplay(json: string): RestartReplay {
  if (new TextEncoder().encode(json).length > replayByteLimit) throw new Error('This replay exceeds the 16 KB limit.')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('This file is not readable JSON.')
  }
  if (!record(value) || value.format !== format || value.reviewType !== 'restart'
    || value.formatVersion !== formatVersion || value.modelVersion !== modelVersion) {
    throw new Error('This restart replay format or model version is unsupported.')
  }
  if (value.scenario !== 'shipping-release' && value.scenario !== 'routing-verification') {
    throw new Error('The restart replay uses an unsupported scenario.')
  }
  const scenario = value.scenario
  return {
    scenario,
    original: readRevision(scenario, value.original),
    revised: value.revised === undefined ? undefined : readRevision(scenario, value.revised),
    review: value.review === undefined ? undefined : readReview(value.review),
  }
}

export function buildRestartReplay(replay: RestartReplay) {
  return {
    filename: `ghost-drill-${replay.scenario}-restart.json`,
    json: JSON.stringify({ format, formatVersion, reviewType: 'restart', modelVersion, ...replay }, null, 2) + '\n',
  }
}

export function sampleRestartReplay(scenario: ScenarioId = 'shipping-release') {
  return readRestartReplay(buildRestartReplay({ scenario, original: defaultRevision(scenario) }).json)
}

export function evaluateRestartReplay(replay: RestartReplay) {
  const before = exploreRestart(replay.scenario, replay.original)
  const after = replay.revised && (replay.revised === replay.original ? before : exploreRestart(replay.scenario, replay.revised))
  return { before, after, comparison: replay.revised && after && compareRestart(replay.original, replay.revised, before, after) }
}

export function restartMarkdown(replay: RestartReplay, evaluated: ReturnType<typeof evaluateRestartReplay>) {
  const { before, after, comparison } = evaluated
  const current = replay.revised ?? replay.original
  const lines = [
    `# Ghost Drill restart review · ${restartFixtures[replay.scenario].title}`,
    '', 'Synthetic results apply to the selected requirements and evaluated cases.', '',
  ]
  function describe(title: string, revision: RestartRevision, coverage: Exploration) {
    lines.push(
      `## ${title}`, '', `- Revision — ${revisionFingerprint(replay.scenario, revision)}`,
      `- Ordered actions — ${revision.actions.map((id) => actions[id]).join(' → ')}`,
      `- Requirements — ${revision.requirements.map((id) => requirements[id]).join(', ') || 'None selected'}`,
      ...(replay.scenario === 'shipping-release'
        ? [`- Release policy — ${revision.releasePolicy === 'stable-key' ? 'Use a stable batch key' : 'Repeat without a stable key'}`]
        : []),
      `- Boundaries — ${revision.boundaries.map((id) => boundaryLabels[id]).join('; ')}`,
      `- Observations — ${revision.observations.map((id) => observationLabels[id]).join('; ')}`,
      `- Restart choices — ${revision.restartPolicies.map((id) => restartLabels[id]).join('; ')}`,
      `- Case limit — ${revision.limit}`,
      `- Uninterrupted service — ${coverage.results[0].serviceRecovered ? 'Recovered' : 'Down'}`,
      `- Coverage — ${coverage.results.length}/${coverage.total}, ${coverage.complete ? 'complete' : 'incomplete'}`,
      ...(coverage.complete ? [] : ['- Unexamined cases remain inconclusive.']),
      `- Result — ${coverage.outcome}. ${coverage.counts.Pass} passed, ${coverage.counts.Violation} failed, ${coverage.counts['Needs evidence']} need evidence.`, '',
    )
    const failure = coverage.counterexample
    if (failure) {
      const event = failure.trace.find(({ number }) => number === failure.firstFailure?.event)
      lines.push(`First counterexample — ${caseLabel(failure.testCase)}.`, '',
        failure.trace.find(({ title }) => title === 'Restart')?.detail ?? 'This case did not restart.', '',
        `${event ? `Event ${event.number} · ${event.title}. ${event.detail} ` : ''}${failure.firstFailure?.reason ?? ''}`, '')
    }
  }
  describe('Original plan', replay.original, before)
  if (replay.revised && after && comparison) {
    describe('Revised plan', replay.revised, after)
    lines.push('## Coverage comparison', '', `${comparison.matched} cases rechecked, ${comparison.notRepeated} original cases did not repeat, ${comparison.newCases} newly evaluated.`, '')
    lines.push(comparison.changed.length ? `Scope changed — ${comparison.changed.join(', ')}. Repair totals are withheld.`
      : `${comparison.fixed} fixed, ${comparison.remaining} still failing, ${comparison.introduced} newly failing, ${comparison.inconclusive} former failures need evidence.`, '')
  }
  if (replay.review) {
    const { disposition, note, fingerprint } = replay.review
    lines.push('## Local reviewer note', '',
      `${disposition} · Revision ${fingerprint}${fingerprint === revisionFingerprint(replay.scenario, current) ? '' : ' · Earlier revision'}`,
      '', 'This local note records a disposition for a model revision.', '',
      ...note.split(/\r?\n/).map((line) => `> ${line}`), '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
