# Pending run — source-sweep

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`source-sweep` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it.

**What changed (2026-09-01, coordinator, after reading `source-sweep-run-003.json`'s DB effect back
from the live `portal_link_candidates` / `sources` tables):** `scripts/turns/run-source-sweep.mjs`
gained `resolvePortalSourceId` / `portalUrlKey`. The driver resolved its parent source through
db.mjs's host-keyed `registerSource` / `institutionKey` lookup; on eur-lex.europa.eu the registry
already holds 724 document-level rows, so the first one by id won and run-003's seven OJ candidates were
attached to "EUR-Lex / 76/456/EEC Commission Opinion (road vehicle type-approval Regulation)"
(`000d2ee5-…`), a 1976 opinion, as their portal. The driver now resolves by EXACT portal URL and, in
apply mode, registers a dedicated portal row with an `institutionKey` override the host-dedup cannot
match (`<host>#portal`); the exact-url lookup finds that row on every later run. `register-walk.mjs`
and `feed-walk.mjs` are unchanged.

**harness_version at write time:** `sha256:01508f9bb2e7ca58`

**The planned run that supersedes this marker:** `source-sweep-run-004.json`, a `register-eurlex`
APPLY re-walk of 2026-08-25..2026-08-31, expected to register the "EUR-Lex Official Journal" portal row
(`created: true`) and, through the ledger's `UNIQUE url` upsert, re-point the seven existing candidate
rows from `000d2ee5-…` to it (verified by reading the table back). Per F28's reverse-audit, this file is
deleted the moment an artifact carrying the hash above lands.
