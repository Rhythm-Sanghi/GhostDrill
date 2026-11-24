# Ghost Drill

Ghost Drill combines an ordered human runbook, a state-based simulation of service dependencies, and a portable replay. The warehouse example checks where the label queue points and whether its print path works. Dispatch checks whether the connector is ready before the queue tries to reopen. A reviewer can rerun the same steps entirely in their browser.

**[Live demo](https://rhythm-sanghi.github.io/GhostDrill/)**

Download Markdown for a change ticket or export a JSON replay so a reviewer can independently rebuild the evidence.

## One-minute walkthrough

1. Start **Try the warehouse drill**. Open **View rollback proof** and use **Inspect responsible step** to see why printing failed.
2. Add **Restore label queue endpoint**, rerun, and select **Rehearse contingencies**. The repaired order gives Verified with reachability, Failed with a blocked path, and Unknown with no observation.
3. Open **Failed → Verified · View comparison**. Replay **Before** and **After**, then **Export replay file**. In a fresh browser, use **Open replay file** to rebuild both recordings and the contingency results.

Try **Dispatch Queue Rollback** for an ordering mistake, or **Missing Print Path Evidence** for an Unknown result. **Edit scenario assumptions** changes only the supported restoration observation on the next run. **Reset** restores the preset and clears recorded runs.

## Kiro contribution

Kiro authored and implemented **Compare rollback runs** using Quick Spec. The repeated-step browser test uses Tab and Enter to replay both recorded snapshots. [Requirement 4](.kiro/specs/compare-rollback-runs/requirements.md#requirement-4-link-changed-check-evidence-to-recorded-snapshots) · [Evidence controls](src/Evidence.tsx) · [Browser test](tests/drill.spec.ts#L362)

Rhythm Sanghi supplied the brief and design references. OpenAI Codex built the rehearsal and later additions, including the dispatch drill, report, contingency cases, and replay files. The Kiro save hook is registered and its automatic execution remains unverified. [Kiro specs, steering, and hook](.kiro)

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

Replay format 1 uses simulator version 1 and accepts up to 16 KiB. It stores supported preset IDs, completed plans, observations, and contingency inputs. Imports rebuild verdicts locally. Comparisons name any changed observation separately from plan edits. [Evaluation v1](evaluation-v1.md)

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
