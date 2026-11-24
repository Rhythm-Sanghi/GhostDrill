# Compare rollback runs checklist

Kiro authored the Quick Spec and implemented the comparison in commit `033306d`. The release pass extended that implementation with phase-specific proof, recorded order changes, and a comparison shortcut.

- [x] Retain the last two completed runs of the selected scenario. Clear them on reset and scenario switch. Leave recorded snapshots intact during draft edits.
- [x] Compare verdicts, added and removed steps, shared step order, and required checks by stable ID. Pair Before and After for each changed phase and preserve missing-observation reasons.
- [x] Render rollback proof and Run comparison in Evidence. Show unchanged check results and unchanged final verdicts independently of plan changes.
- [x] Give the latest verdict a shortcut that scrolls to and focuses Run comparison. Open Before and After from their recorded runs and offer Return to latest run.
- [x] Add concrete unit regressions and deterministic property tests for verdicts, step diffs, phase pairing, and identical runs.
- [x] Exercise comparison, replay, reset, scenario isolation, draft edits, and keyboard focus in the production preview on desktop and mobile.
- [x] Run the release gates against the production build at `/GhostDrill/`.
- [ ] Observe the configured `PostFileSave` hook execute automatically in Kiro and capture its output.

In the authenticated Kiro IDE, the hook appeared as enabled. A reversible edit saved in the editor and a separate native Kiro file edit produced no observed hook output. Both probes were reverted. The direct release-gate test run is tracked above.

For the judge path, start with [Requirement 4](requirements.md#requirement-4-link-changed-check-evidence-to-recorded-snapshots), read the snapshot controls in [Evidence.tsx](../../../src/Evidence.tsx), and find “comparison links resolve repeated step IDs in the right runs using Tab and Enter” in [drill.spec.ts](../../../tests/drill.spec.ts).
