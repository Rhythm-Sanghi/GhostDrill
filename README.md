# Ghost Drill

Ghost Drill is a browser-based rehearsal for network maintenance. Its synthetic warehouse scenarios distinguish a completed rollback from verified service recovery. The evidence compares required checks for label printing and the queue endpoint across Baseline and Rollback.

## Try the warehouse drill

1. Select **Try the warehouse drill**. The runbook reports **Rollback completed** while verification reports **Failed** and printing stays down.
2. Select **Inspect responsible step** in Evidence to jump to the Change step that pointed the queue at backup. Select earlier steps to inspect their snapshots.
3. Under **Edit rollback**, add **Restore label queue endpoint** and select **Rerun drill**. The new run starts from Baseline and reports **Verified**.
4. Select **Reset** to restore the original plan and starting snapshot.

Choose **Missing Print Path Evidence** from **Scenario** and run it to reproduce **Unknown**. The queue endpoint is restored, but reachability from the primary gateway to the print service was not observed. Reset and rerun to repeat it.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The simulation runs entirely in the browser.

## Verify

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser suite builds and serves the app under a repository subpath. It covers desktop, mobile emulation, and desktop keyboard operation. Set `PLAYWRIGHT_CHANNEL=chrome` in your environment to use installed Google Chrome.

## GitHub Pages

The build emits relative asset paths into `dist/`. To publish, choose **GitHub Actions** as the Pages source in repository settings and manually dispatch **Publish Ghost Drill**. The workflow follows the [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy#github-pages).

## Contributions and license

The project brief and Threadmark visual reference came from Rhythm Sanghi. OpenAI Codex implemented and tested the browser rehearsal. See the [verified recovery requirements](.kiro/specs/verified-service-recovery/requirements.md) for the verdict rules and acceptance criteria.

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
