# Restart evaluation · Model 1

The browser and Node checker use the same deterministic executor. The committed ledger is outside the interrupted process. Checkpoint position and recorded receipts are durable. The pending acknowledgement disappears on restart. All data and effects are synthetic.

## Reproduce

```sh
npm ci
node --test tests/restart.test.ts tests/release-boundary.test.ts
node scripts/check-restart.ts examples/shipping-restart-review.json
node scripts/check-restart.ts examples/routing-restart-review.json
npm run test:browser
```

Open either fixture with **Open replay file** to rebuild the traces and download a Markdown report. The checker exits 0 for a passing latest evaluated revision with comparable scope, 1 for a confirmed latest violation, 2 for inconclusive coverage or changed comparison scope, and 3 for invalid input.

[Shipping replay](examples/shipping-restart-review.json) · [Routing replay](examples/routing-restart-review.json)

## Expected and observed cases

| Case | Expected | Observed |
| --- | --- | --- |
| Uninterrupted shipping recovery | Service recovered and one committed release | Pass, 1 release |
| Interrupted before the first effect | The restarted release commits once | Pass, 1 release |
| Release committed before acknowledgement, resume at checkpoint | The ledger survives and the unkeyed retry commits again | Violation, 2 releases. First counterexample at the duplicate commit. |
| Receipt recorded, resume from saved checkpoint | Restart proceeds to the optional shipping state inspection | Pass, 1 release and saved receipt |
| Stable key, same retry payload | The response can be lost and the retry returns the first receipt | Pass, 1 release and `RELEASE-1` reused |
| Stable key, changed retry payload | Downstream rejects the conflict without a new effect | Violation under the receipt requirement, 1 release |
| Release action omitted | At most once passes and recovery fails | Violation, 0 releases despite restored printing |
| Receipt evidence unavailable | The ledger can contain one release without a durable receipt | Needs evidence, 1 release |
| Limit of one on the repaired plan | Only the uninterrupted case is evaluated | Inconclusive, 1/9 cases evaluated |
| Routing checkpoint saved before verification | Checkpoint restart skips required verification even though service recovered | Violation at the skipped check. Reordering verification first gives 3/3 passes. |
| Same scope, shipping original versus repaired | Every failing case repeats on the repaired plan | 9 rechecked, 5 fixed, 0 still failing, 0 introduced |

## Search scope

Each execution starts from the same fixture and allows at most one interruption. The order is the uninterrupted standard case first, then boundaries in preset order, then observations in the order available, unavailable, and changed payload, then checkpoint before beginning. The explorer returns the first violation in that order. Each case starts with a new ledger. Each exploration runs the uninterrupted case once.

Shipping offers four boundaries and at most 25 cases. The `after-checkpoint` replay identifier means after the receipt-recording step, which can leave the checkpoint unchanged if the receipt is unavailable. Routing offers one boundary and at most three cases.

The evaluated count includes cases whose targeted interruption boundary never occurred. Those cases need evidence unless another requirement already has a confirmed violation. The browser, report and checker display the unreached count separately. A case limit can stop enumeration early. A narrower scope never counts unevaluated original cases as fixed.

The shipping verdict evaluates the selected requirements. The defaults check for at most one release, recovered printing with exactly one release, and a durable receipt. The optional shipping state inspection records the simulated state at that point in the runbook.

The browser suite drives real downloads and imports, desktop Tab and Enter navigation, reduced motion, and a 320 px viewport. Human feedback remains blank until independent sessions take place.

The shipping browser check follows **Inspect repaired case** from the comparison and from the original duplicate after import. Both links select the same modeled boundary, observation, and restart choice in the revised plan and focus the event that returned `RELEASE-1`. The routing check confirms the link stays hidden when the comparison scope changes. Run `npm run test:browser -- tests/restart.spec.ts`.

The Node checker regression confirms exit 2 when a changed case limit leaves the revised plan passing but changes comparison scope. Run `node --test tests/restart.test.ts`.
