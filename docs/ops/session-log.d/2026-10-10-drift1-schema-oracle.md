## 2026-10-10, lane DRIFT-1 (drift1-schema-oracle-562): the schema oracle's 562 differing objects, classified, canonicalised and given a structural record

Work in progress; this file is completed before the PR is opened.

### Accomplished

1. `fsi-app/scripts/proof/schema-diff.mjs`: the catalog is read as definition text (was an md5 of it); both sides are read with `PGOPTIONS=-c search_path=pg_catalog`; `canonicalise` and `buildDetail` and `runGate` are new; the gate writes `replay-schema-diff-detail.json` beside its report when anything differs.
2. `fsi-app/scripts/proof/schema-diff-drift1.test.mjs` (new) and `schema-diff.test.mjs` (two assertions updated): attack tests for the pass condition and the canonical form.
