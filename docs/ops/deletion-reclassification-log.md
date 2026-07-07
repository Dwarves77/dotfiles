# Deletion / reclassification log

Every value-ruled or dedup delete + every reclassify-to-source, appended at execution. Columns: when · key · id · title · action · reason · ruling · snapshot.

- 2026-07-06T21:52:29.025Z · g26 · 8ff93a7e-5256-4d31-959b-2172de16ae8f · "IRENA Abu Dhabi" · DELETE · 2012 IRENA press release mis-typed as regulation (shell) · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-28-312Z_intelligence_items.jsonl
- 2026-07-06T21:52:29.724Z · t6 · 658247c4-52e1-4af5-9073-2ab56c6e4ee0 · "ICAP ETS Map" · DELETE · ICAP ETS Map is a tool, not a regulation; ICAP research lives at abd29144 · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-29-324Z_intelligence_items.jsonl
- 2026-07-06T21:52:30.539Z · l8 · c8b4f1ae-45d1-4719-86a7-40809f709556 · "Drive Electric: Zero-Emission Freight" · DELETE · thin US-DOT program page; re-mintable via the gated intake if a genuine primary surfaces · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-29-985Z_intelligence_items.jsonl
- 2026-07-06T21:52:32.980Z · g22 · 935680f5-6915-4241-a9b5-7e450143bc0f · "China CCICED" · RECLASSIFY→source(tier 2) · China CCICED advisory-council page mis-typed as regulation → source · T5 operator ruling, dispatch 2026-07-06 (decision-package-2026-07-06.md) · C:\Users\jason\dotfiles\fsi-app\scripts\_snapshots\2026-07-06T21-52-32-174Z_intelligence_items.jsonl

## Related

- [[migrations]] — RECLASSIFY→source entries run through the migration-135 source-registration guard and migration-019 mistyped-tool reclassification — the DB…
- [[sprint4-dataops-ledger]] — Both are execution-time audit ledgers of durable intelligence_items mutations with snapshot/reversal columns; the dataops ledger's archive passes…
- [[sources-content-verification-2026-05-11]] — Confirms the 66 hard deletions this audit checks (0 remain, 0 agent_runs FK orphans) — the ops log of that deletion action
