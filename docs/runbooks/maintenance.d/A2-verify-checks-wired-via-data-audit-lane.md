## Appendix: three more scripts/verify/ checks wired via the data-audit lane (lane F25-WAVE52, 2026-09-07)

Same shape as `holdings-audit` above - none of these three are `.github/workflows/maintenance.yml`
steps; all three are `run-data-audit-lane.mjs` `AUDITS` entries (SOFT/informational), dispatched via
`.github/workflows/data-audit-lane.yml`'s existing nightly/CI-with-secrets run. See
`docs/audits/f25-wave52-dispositions-2026-09-07.md` for why each was wired rather than deleted.

- **`admin-phrase-scan`** (`scripts/verify/admin-phrase-scan.mjs`) - Unit 0c Part 4 (operator ruling
  2026-07-13): scans `src/components/admin` + `src/components/profile` JSX for human-gate framing that
  contradicts RD-20 (the machine gates ARE the approval). Filesystem-only, no DB creds, always exits 0.
- **`defect-signature-scan`** (`scripts/verify/defect-signature-scan.mjs`) - ground-truth verification
  unit (2026-07-15, ADR-014): S-CONFLATE/S-NUMERIC heuristic triage over FACT claims. Lane F25-WAVE52
  gave the bare (no-flag) invocation this lane's own `AUDITS` entry now uses a default `--since 24h ago`
  frame (previously it required an explicit `--ids`/`--since`/`--all` flag and exited 2 with none given
  - the same "since 24h ago" wave-boundary proxy `wave-acceptance-audit.mjs` already uses). A hit HOLDS
  for live verification; never promotes or demotes anything itself.
- **`surface-visibility`** (`scripts/verify/surface-visibility-audit.mjs`) - the "verified item hidden
  from its surface" invariant (PPWR incident, 2026-07-08): opens `integrity_flags` rows (idempotent,
  guarded) for a live verified item whose domain routes to no surface (`no_surface`) or the wrong one
  (`cross_surface`).

**First dispatch** (coordinator): none needed to add - `data-audit-lane.yml`'s next scheduled/manual run
picks up all three automatically; confirm the run's own printed summary shows `admin-phrase-scan`,
`defect-signature-scan`, and `surface-visibility` lines (PASS/FAIL/ERROR, `[soft]`).

---

