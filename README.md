# Ghost Drill

Ghost Drill combines an ordered human runbook, a state-based service simulator, and acceptance checks a second reviewer can independently replay. Warehouse checks printing, the queue endpoint, and reachability evidence. Dispatch checks the connector immediately before each reopen attempt.

**[Live demo](https://rhythm-sanghi.github.io/GhostDrill/)** · [Modeled evaluation](evaluation-v1.md)

Download Markdown for a change ticket or export a JSON replay so a reviewer can independently rebuild the evidence.

## One-minute walkthrough

1. Select **Open sample review**. The dispatch retry restored service, so the final state is Verified while acceptance is Violation.
2. Select **Violation at step 1** to inspect the first attempt. Move **Restore shipping connector** above **Reopen dispatch queue**, then rerun. Final verification stays Verified and acceptance changes to Meets requirements.
3. Open the comparison and select **Export replay file**. Use **Open replay file** in a fresh browser to independently reproduce the evidence.

**Try the warehouse drill** opens the original diagnosis-and-repair flow. **Missing Print Path Evidence** shows Unknown and Needs evidence. Draft plan, assumption, and requirement edits take effect on the next run.

## Kiro contribution

Kiro authored and implemented **Compare rollback runs** using Quick Spec. The repeated-step browser test uses Tab and Enter to replay both recorded snapshots. [Requirement 4](.kiro/specs/compare-rollback-runs/requirements.md#requirement-4-link-changed-check-evidence-to-recorded-snapshots) · [Evidence controls](src/Evidence.tsx) · [Browser test](tests/drill.spec.ts#L364)

For this release Kiro also wrote the Dispatch prerequisite spec, evaluator, and focused tests. Codex integrated the evaluator and built the remaining acceptance, replay, and release changes. Rhythm Sanghi supplied the brief and design references. The Kiro save hook is registered and its automatic execution remains unverified. [Dispatch spec](.kiro/specs/dispatch-prerequisite/requirements.md) · [Evaluator](src/dispatchPrerequisite.ts) · [Tests](tests/dispatch-prerequisite.test.ts#L7)

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

Replay format 2 records the selected requirements and rebuilds findings locally. Version 1 replays open with acceptance unevaluated. Files are limited to 16 KiB. At the safe run-number limit, rerunning renumbers the retained pair as Run 01 and Run 02.

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
