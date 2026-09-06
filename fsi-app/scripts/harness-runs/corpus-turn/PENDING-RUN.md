# Pending run — corpus-turn

F28's staleness-coupling rule (rule (c)) fires because this family's governing files
(`scripts/turns/consume-turn-requests.mjs`, `export-corpus-for-extraction.mjs`) moved bytes after
`corpus-turn-run-002.json` was recorded, with no new run artifact yet landed under the changed code —
the exact "the harness changed without a run recording why" gap this marker exists to acknowledge
honestly rather than silently.

**What changed, and why (lane INCLAUSE-CLASS, 2026-09-06, the IN-CHUNK id-list class fix — see
`docs/audits/in-filter-audit-2026-09-06.md`).** F39 (`unbounded-in-filter`, new this lane) flagged a
`.in()` call in each of `consume-turn-requests.mjs` and `export-corpus-for-extraction.mjs` whose second
argument is a bare runtime identifier. Both sites were investigated individually and found already
correctly bounded at the call site (ticket selection is bounded by `--limit`; the `--ids` export list
traces back to that same bounded selection) — no chunking fix was needed. Each site was given a
`// fitness-allow: F39 (reason)` marker recording that investigation inline, per this lane's no-silent-
allowlist rule (F39 carries no ALLOWLIST-with-expiry escape hatch; every marker states its bound in
the comment itself, at the site, forever, not in a separate expiring file).

**No behavior change to ticket selection, corpus export, or anything either script reads or writes** —
only two added comment lines (no code, no logic, no control flow touched). Byte-identical output for any
given input versus the pre-lane code.

**harness_version at write time:** `sha256:4dd5b697820c0069`

**The planned run that supersedes this marker:** the next `.github/workflows/corpus-turn.yml` dispatch
will land `corpus-turn-run-003.json` with `harness_version: sha256:4dd5b697820c0069`, and this marker is
deleted the moment that artifact lands (or updated to a new hash, per rule (c), if the governing files
change again before that run lands).
