import { readFile, stat } from 'node:fs/promises'
import { replayByteLimit } from '../src/replay.ts'
import { caseLabel, evaluateRestartReplay, formerFailuresNeedEvidence, readRestartReplay, restartCoverageNotes } from '../src/restartReplay.ts'

const filename = process.argv[2]

try {
  if (!filename || process.argv.length !== 3) throw new Error('Usage: node scripts/check-restart.ts <restart-replay.json>')
  if ((await stat(filename)).size > replayByteLimit) throw new Error('This replay exceeds the 16 KB limit.')
  const replay = readRestartReplay(await readFile(filename, 'utf8'))
  const { before, after, comparison } = evaluateRestartReplay(replay)
  const latest = after ?? before
  for (const [label, result] of [['Original', before], ['Revised', after]] as const) {
    if (!result) continue
    const [evaluated, ...notes] = restartCoverageNotes(result)
    console.log(`${label} — ${result.outcome}, ${evaluated}`)
    for (const note of notes) console.log(note)
    console.log(`${result.counts.Pass} passed, ${result.counts.Violation} failed, ${result.counts['Needs evidence']} need evidence`)
    if (result.counterexample) {
      console.log(`First counterexample — ${caseLabel(result.counterexample.testCase)}. ${result.counterexample.firstFailure?.reason}`)
    }
  }
  if (comparison) {
    console.log(`${comparison.matched} cases rechecked, ${comparison.notRepeated} original cases not repeated.`)
    console.log(comparison.changed.length ? `Scope changed — ${comparison.changed.join(', ')}. Repair totals withheld.`
      : `${comparison.fixed} fixed, ${comparison.remaining} still failing, ${comparison.introduced} newly failing, ${formerFailuresNeedEvidence(comparison.inconclusive)}.`)
  }
  process.exitCode = latest.outcome === 'Violation' ? 1 : latest.outcome === 'Inconclusive' || comparison?.changed.length ? 2 : 0
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The restart replay could not be evaluated.')
  process.exitCode = 3
}
