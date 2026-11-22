# Verified service recovery tasks

- [x] Add fixture-driven named checks, recorded evidence, and verdict aggregation.
- [x] Integrate phase proof, snapshot replay, a fresh scenario selector, and previous-plan feedback.
- [x] Add regression coverage for both fixtures, unhealthy baselines, and failure precedence.
- [x] Configure the Kiro save hook to run `npm test` for simulator and fixture changes.
- [ ] Observe a matching save fire the hook in an authenticated Kiro session.
- [x] Run lint, typecheck, simulator tests, production build, and desktop/mobile browser checks.

The starting UI derived recovery from the final printing result alone. The simulator regression now starts with an unreachable primary path and ends with healthy printing. Verification stays **Failed** and identifies **Baseline**. A second case confirms that an unknown rollback observation cannot mask the same baseline failure.
