---
inclusion: always
---

# Ghost Drill

- Keep the browser rehearsal deterministic, synthetic, and independent of network services.
- Start every run from its fixture baseline. Keep the draft plan separate from recorded snapshots and verdicts.
- Derive evidence from recorded state. When an observation is missing, explain which one and omit any causal step link.
- Keep runbook completion separate from verification. Confirmed failures take precedence over missing evidence.
- Reuse the existing simulator and compact Threadmark-inspired interface. Keep TypeScript readable and controls usable with a keyboard.
- Run `npm test` after simulator or fixture edits. Use the production subpath browser suite to check scenario switching, timeline replay, and Reset.
