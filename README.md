# Ghost Drill

Ghost Drill is a browser-based rehearsal for network maintenance. Its synthetic warehouse scenarios distinguish a completed rollback from verified service recovery. The evidence compares required checks for label printing and the queue endpoint across Baseline and Rollback.

## Try the warehouse drill

1. Select **Try the warehouse drill**. The runbook reports **Rollback completed** while verification reports **Failed** and printing stays down.
2. Select **Inspect responsible step** in Evidence to jump to the Change step that pointed the queue at backup. Select earlier steps to inspect their snapshots.
3. Under **Edit rollback**, add **Restore label queue endpoint** and select **Rerun drill**. The new run starts from Baseline and reports **Verified**.
4. Under **Run comparison**, use the **Before** and **After** evidence links to inspect each recorded run. **Reset** clears the comparison and restores the original plan.

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

The browser suite builds and serves the app under `/ghost-drill/` on desktop and mobile emulation, with keyboard checks on desktop. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome. To preview an existing build, run `npm run preview -- --base /ghost-drill/` and open the URL Vite prints.

## GitHub Pages

The build emits relative asset paths into `dist/`. For a ₹0 release, use a public GitHub repository named `ghost-drill`. After pushing `main`, choose **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. In **Actions → Publish Ghost Drill**, select **Run workflow** on `main` and open the deployment URL from the completed run. See the [GitHub Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Contributions and license

Rhythm Sanghi supplied the project brief and Threadmark visual reference. OpenAI Codex built the rehearsal, authored the [verified recovery spec](.kiro/specs/verified-service-recovery/requirements.md) and steering, and verified the release. Kiro used Quick Spec to author and implement [Compare rollback runs](.kiro/specs/compare-rollback-runs/requirements.md). The [Kiro save hook](.kiro/hooks/simulator-tests.json) is configured to run `npm test` when simulator or fixture files are saved.

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
