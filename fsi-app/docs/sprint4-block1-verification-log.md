# Sprint 4 Block 1 — verification log

Per-task verification evidence captured during direct main-thread execution
(after the Dynamic Workflow runtime was found to bypass the permission-hook
pipeline; build switched to direct execution under the PreToolUse Bash hook).

Branch: `sprint4/block-1-invariant-landing`. Static checks (tsc / node --check)
run per task. Runtime / live-render / live-DB-trigger checks are consolidated at
HARD CHECKPOINT 1, where the dev server + synthetic-test gate are stood up.

| Task | Static verification | Result | Runtime/render check |
|---|---|---|---|
| 1.0a install WDK deps | `npm list workflow` shows 4.2.x | PASS (run, `a6f0dbc`) | n/a |
| 1.0b `withWorkflow` wiring | next.config wraps config | PASS (run, `8fb13e0`) | `npx workflow health` (HC1) |
| 1.1 schema migration | DB query: enum + cols + 3 tables exist | PASS (run, `c6f4920`); 657 existing rows stayed `unverified` | — |
| 1.2 seed required slots | DB query: 5 D1 item_types seeded | PASS (run, `8c15c3b`) | — |
| 1.3 `validate_item_provenance` | synthetic 6-criteria cases | PASS (run, `1d7a5ba`) | re-exercised at HC1 |
| 1.4 `set_provenance_status` trigger | 3 terminal states via synthetic INSERTs | PASS (run, `4b1aefb`) | re-exercised at HC1 |
| 1.0c generate-brief skeleton | `tsc --noEmit` | PASS exit 0 (`11fbdaf`) | `start()` returns runId + `inspect run` shows named-step checkpoints (HC1 substrate verification) |
| 1.0d Vercel plan tier | `npx workflow inspect runs --backend vercel` | PASS exit 0; project detected; empty runs list (non-error = pass) | — |

## Notes

- 1.0c runtime proof (start + inspect checkpoints) is folded into the HC1
  substrate verification rather than standing up the dev server per task. The
  skeleton type-checks clean against the real WDK types
  (`createHook`/`RetryableError` from `workflow`, `DurableAgent` from
  `@workflow/ai/agent`, `"use step"`/`"use workflow"` directives).
- All work is on the branch; master is untouched until the operator merges
  post-HC1. No customer/launch-corpus data writes in Block 1.
