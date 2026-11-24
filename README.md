# Ghost Drill

Ghost Drill is a browser-based network maintenance rehearsal for Kiroween 2026 Frankenstein. It combines a human runbook, synthetic service dependencies, and replayable evidence. A completed rollback and a verification verdict answer different questions about the modeled service.

**[Live demo](https://rhythm-sanghi.github.io/GhostDrill/)**

## One-minute walkthrough

1. Run **Warehouse Label Outage**. Rollback completes, but printing fails. **Inspect responsible step** in the label printing proof shows the switch to the backup gateway.
2. Add **Restore label queue endpoint** and rerun. Open **Failed → Verified · View comparison**. Inspect **Before** to see the backup route in the previous run, then **After** to see the restored route. **Return to latest run** jumps back to the latest final snapshot.
3. Switch to **Dispatch Queue Rollback** and run it. The queue stays paused because reopening was attempted before the shipping connector was ready. Move **Restore shipping connector** up and rerun. The comparison shows both step orders and the verified result.

Run **Missing Print Path Evidence** twice to see **Unknown → Unknown** and the missing reachability observation. **Reset** restores the supplied plan and clears recorded runs.

## Kiro contribution

Kiro authored and implemented **Compare rollback runs** using Quick Spec. The repeated-step browser test uses Tab and Enter to replay both recorded snapshots. [Requirement 4](.kiro/specs/compare-rollback-runs/requirements.md#requirement-4-link-changed-check-evidence-to-recorded-snapshots) · [Evidence controls](src/Evidence.tsx) · [Browser tests](tests/drill.spec.ts)

Rhythm Sanghi supplied the brief and Threadmark visual reference. OpenAI Codex built the initial rehearsal and verified service recovery, then delivered this release pass with phase-aware comparisons, the dispatch drill, browser verification, and Pages publishing. The root [.kiro](.kiro) folder contains both specs, steering, and the save hook.

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

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
