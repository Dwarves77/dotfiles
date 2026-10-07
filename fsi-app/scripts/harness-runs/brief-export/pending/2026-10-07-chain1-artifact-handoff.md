## Change

Lane CHAIN-1, 2026-10-07: .github/workflows/brief-export.yml (a brief-export governing file) changed in one place: the chained dry-run guard call now passes --requested-mode read-only instead of a hardcoded apply (chain-fire-2026-10-06 finding F5). This workflow has no mode input and never writes, so the run itself is unchanged.

## Planned run

No run is owed beyond the next brief-export firing, which behaves as before. Delete this file whenever the next brief-export run lands.
