## 2026-10-09, executor EXEC-3: harness ledger export regenerated after DORMANT-1 landed

### Accomplished

- Regenerated `fsi-app/.discipline/governance/harness-ledger-export.json` with `export-harness-ledger.mjs` (one read-only SELECT of harness_runs through the main checkout's local env): 232 runs, 22 families (was 201 runs, 22 families on 2026-10-08).
- Local closure gate (no GITHUB_TOKEN, so the live-run lookup DORMANT-1 added does not run): NEVER-RUN lists 8 workflows with no run in the committed export (chain-proof, data-audit-lane, date-chain, design-audit, layout-baseline-renewal, source-monitoring, spot-check-monthly, uptime-probes), identical before and after this regeneration. CI runs the gate with the token; the master push run of DORMANT-1 (b98a7632) was green.
- Not done here: no workflow was dispatched; the three disabled workflows cannot be (HTTP 422 per the DORMANT-1 log). chain-proof run 37876624407 (2026-10-09) failed at its oracle step.
