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

**harness_version at INCLAUSE-CLASS's write time (superseded below, see task 3.4):** `sha256:4dd5b697820c0069`

**The planned run that would have superseded THAT marker:** the next `.github/workflows/corpus-turn.yml`
dispatch would have landed `corpus-turn-run-003.json` with `harness_version: sha256:4dd5b697820c0069`; no
such run landed before task 3.4's own edit moved the hash again (see the re-pin below).

---

## Re-pin (task 3.4, brief-chain build plan Part 3, 2026-09-11)

**[CONFIRMED]** (method: `git stash` the whole task-3.4 working tree and re-ran
`node --test .discipline/fitness/functions/F28-harness-run-integrity.test.mjs` against the committed
branch tip before this task's own edits: the identical STALE PENDING-RUN.md finding was already present).
This drift is PRE-EXISTING, inherited from task 3.3 fix round 1's own edit to
`export-corpus-for-extraction.mjs` (one of `corpus-turn`'s two governing files, stamping
`hashSourcePool(pool)` onto each exported item): that edit moved `corpus-turn`'s own hash without this
marker being re-pinned at the time. Fixed in the same motion per CLAUDE.md rule 13 (a flag is a
commitment), not left as a second flagged item for a later lane: this task made no further edits of its
own to either `corpus-turn` governing file (`consume-turn-requests.mjs`, `export-corpus-for-extraction.mjs`).

**harness_version at task 3.4's write time (superseded below, see task 6.2b):** `sha256:c6d5cb842b67944a`
(recomputed via `hashHarnessVersion` against `governing-files.mjs`'s own `GOVERNING_FILES['corpus-turn']`
array; supersedes `sha256:4dd5b697820c0069` outright).

**The planned run that would have superseded THAT marker:** unchanged in kind, the next
`.github/workflows/corpus-turn.yml` dispatch, landing the next `corpus-turn-run-NNN.json` under that hash.
No such run landed before task 6.2b's own edit moved the hash again (see the re-pin below).

---

## Re-pin (task 6.2b, 2026-09-12 -- task-6.1-audit.md fix 3)

**What changed.** `scripts/turns/export-corpus-for-extraction.mjs` (one of `corpus-turn`'s two governing
files) gained the `forward_events`/`timelines` export fields under `--with-pool-text` (reading
`item_forward_events` and `item_timelines`, grouped by item in `buildCorpusItems`) -- the record-briefs
family's own need (task-6.1-audit.md fix 3: forward events recorded in the database never reached a
lane-authored brief's own forward-intelligence section). This is additive and scoped to the
`--with-pool-text` path only; `consume-turn-requests.mjs` (this family's other governing file) and the
default (non-`--with-pool-text`) export path are byte-identical to before this task, confirmed by
`export-corpus-for-extraction.test.mjs`'s own "forward_events/timelines are OMITTED by default" case.

**harness_version at write time:** `sha256:873a68f9eb398ea9` (recomputed via `hashHarnessVersion` against
`GOVERNING_FILES['corpus-turn']`, the same 2 files, unreordered; supersedes `sha256:c6d5cb842b67944a`
outright).

**The planned run that supersedes this marker:** unchanged in kind, the next
`.github/workflows/corpus-turn.yml` dispatch, landing the next `corpus-turn-run-NNN.json` under this hash.
