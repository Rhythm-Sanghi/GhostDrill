# Ghost Drill

Ghost Drill is a browser-based rehearsal for a network maintenance change. The warehouse scenario uses synthetic gateway states to show whether shipping label printing comes back after rollback. The runbook, map, and evidence panel share the same recorded snapshots.

## Try the warehouse drill

1. Select **Try the warehouse drill**. The runbook reports **Rollback completed** while the service reports **Service still down**.
2. Select **Inspect responsible step** in Evidence to jump to the Change step that pointed the queue at backup. Select earlier steps to inspect their snapshots.
3. Under **Edit rollback**, add **Restore label queue endpoint** and select **Rerun drill**. The new run starts from Baseline and reports **Service recovered**.
4. Select **Reset** to restore the original plan and starting snapshot.

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

The project brief and Threadmark visual reference came from Rhythm Sanghi. OpenAI Codex implemented and tested this first pass. The source is new and the Threadmark screenshots informed the visual direction. Kiro’s implementation pass is pending.

Ghost Drill is released under the [MIT License](LICENSE). Bundled fonts, icons, and libraries retain their [third-party licenses](public/third-party-licenses.txt).
