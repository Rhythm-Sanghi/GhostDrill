# Ghost Drill

Ghost Drill combines an ordered runbook, a state-based simulator, and a replay another reviewer can independently evaluate. The restart review checks whether a recovered service also preserved the required effects and evidence.

**[Live demo](https://rhythm-sanghi.github.io/GhostDrill/)** · [Restart evaluation](restart-evaluation.md) · [Acceptance evaluation](evaluation-v1.md)

Download Markdown for a change ticket or export a JSON replay so a reviewer can independently rebuild the evidence.

## One-minute walkthrough

1. Select **Open restart review**. The uninterrupted shipping run passed. Select **Inspect first counterexample** to see the duplicate committed after restarting from the saved checkpoint.
2. Select **Use a stable batch key**, then **Rerun interruption cases**. The same nine cases run again and all five original failures are fixed.
3. Select **Export restart replay** and use **Open replay file** in a fresh browser. The review rebuilds both plans and their traces.

The restart view also includes **Routing verification restart**. The original drills remain on the landing screen. Draft edits take effect on the next run.

## Kiro contribution

Kiro authored and implemented **Compare rollback runs** using Quick Spec. The repeated-step browser test uses Tab and Enter to replay both recorded snapshots. [Requirement 4](.kiro/specs/compare-rollback-runs/requirements.md#requirement-4-link-changed-check-evidence-to-recorded-snapshots) · [Evidence controls](src/Evidence.tsx) · [Browser test](tests/drill.spec.ts#L364)

Kiro also wrote the Dispatch prerequisite spec, evaluator, and focused tests. Codex integrated the evaluator and built the remaining acceptance and release changes. Rhythm Sanghi supplied the brief and design references. The Kiro save hook is registered and its automatic execution remains unverified. [Dispatch spec](.kiro/specs/dispatch-prerequisite/requirements.md) · [Evaluator](src/dispatchPrerequisite.ts) · [Tests](tests/dispatch-prerequisite.test.ts#L7)

Kiro wrote the restart release boundary contract, implementation, and tests. Codex built the executor, review interface, replay, and release checks. [Restart spec](.kiro/specs/restart-release/requirements.md) · [Boundary code](src/releaseBoundary.ts) · [Lost-response test](tests/release-boundary.test.ts#L5)

## Run locally

Use Node.js 24 and npm. The simulator runs entirely in the browser.

```sh
npm ci
npm run dev
```

The release checks use the built app.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Playwright builds and serves the app at `/GhostDrill/` for desktop and mobile. To preview an existing build, run `npm run preview -- --base /GhostDrill/`. The manual **Publish Ghost Drill** workflow runs the release gates and deploys to GitHub Pages.

Restart replays use format 3. Existing v1/v2 drill replays still open. The explorer models one interruption per case and at most 25 cases. A local disposition fingerprint identifies evaluated inputs. [Model scope and Node checker](restart-evaluation.md)

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
