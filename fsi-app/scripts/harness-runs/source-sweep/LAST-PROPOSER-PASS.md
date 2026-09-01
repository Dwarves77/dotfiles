# Last proposer pass — source-sweep

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `source-sweep` now has **three** artifacts
(`source-sweep-run-001` … `source-sweep-run-003`); F28's rule (d) requires this file to name the latest
verbatim: **source-sweep-run-003**.

**Artifacts read:** source-sweep-run-001 (2026-09-01T22:31Z, `sha256:87e06e9784e8e21b`, the driver's
first execution, dry) and source-sweep-run-002 (2026-09-01T23:00:22Z → 23:00:26Z,
`sha256:7df464313565f9b4`, the dry re-walk after the fixes the run-001 reading demanded).

**Full traces read:** both raw results (`traces/source-sweep-run-001.raw-result.json` — counts only;
`traces/source-sweep-run-002.raw-result.json` — per-day act URLs), the two Actions job logs, and the
live EUR-Lex daily views for 28 and 30 August 2026 in the browser.

**Hypotheses (verified, with basis):**
1. **The two run-001 defects are real and the fix holds on the live site.** Run-001: 221 "extracted"
   over 7 days (31–32/day, weekends included). Run-002 over the same week: `extracted_total = 7`,
   `days_duplicate_edition = 2` (29 and 30 August, both `duplicate_of 2026-08-28`), and the 28 August
   day lists exactly the two acts the live page shows (`OJ:L_202601310`, `OJ:L_202601534`). Basis:
   run-002's trace against the page read by hand before the fix was written.
2. **The OJ L series published 7 acts in 25–31 August 2026 that the daily view exposes as
   `/legal-content/` links.** That is the register's real weekly volume at this filter (L series,
   `types=RULE` is a Federal Register parameter and does not apply here). Basis: run-002 per-day URLs.
   No claim is made about C series or about acts the daily view lists under other link shapes; the
   filter is `/legal-content/` OR `/eli/` and run-002 saw only the former.
3. **run_id collision under the PR-landing model (new defect, this pass).** The first APPLY walk
   (Actions run 33569152522, 23:03Z) was dispatched while run-002's PR had not merged; `claimRunId`
   counted master's artifacts and wrote a SECOND `source-sweep-run-002.json` (mode=apply, 7 upserted,
   `source_id 000d2ee5-…`). Its DB effect is real and correct (7 `portal_link_candidates` rows, the
   EUR-Lex portal source registered); its artifact is NOT landed — the collided branch is deleted and
   the apply walk is re-dispatched after this pass lands, producing `source-sweep-run-003` honestly
   numbered (upserts on `UNIQUE url` make the re-walk a `last_seen_at` refresh, no duplicate rows).
   Fix, structural: both workflows now hydrate unmerged sibling artifact branches before the runner
   claims an id. Basis: the branch's artifact read in full; `claimRunId`'s source.
4. **Dry-mode wording and timestamps now carry the meaning they should.** Run-002's verdicts read
   "planned (dry, nothing written)"; `started_at` precedes `finished_at` by 3.7 s. Run-001's
   "221 upserted"/finish-time `started_at` stand as the record of the defect, unedited.

**Proposal (scoped for the next cycle):**
1. **First Federal Register walk (dry)** — `walkFederalRegister` is untested against the live API
   under this driver; its `frDocsToLinks` shape is API-driven (no chrome problem) but page/`total_pages`
   handling has only fixture coverage.
2. **First feed walk (dry)** against one registered RSS/Atom source, for the same reason.
3. **Consume pass wiring** — this family ends at "candidates enumerated and queued"; the
   `consumePortalCandidates` classify → intake step that turns ledger rows into `census_worklist` rows
   still runs only from the app's `check-sources` worker. A corpus-turn step or an admin action to drain
   the ledger is the missing hop between a sweep and a minted item (the driver's own header names why it
   cannot import that module under plain node).

**Family gates status:** this landing deletes `PENDING-RUN.md` (run-002 carries its hash — F28's
reverse-audit) and adds this attestation. `run-source-sweep.mjs`, `register-walk.mjs`, `feed-walk.mjs`
unchanged; the collision guard lives in the workflows, which are not governing files.


---

## Pass over source-sweep-run-003 (2026-09-01, coordinator)

**Artifacts read:** all three. **Full traces read:** `traces/source-sweep-run-003.raw-result.json`;
the live `portal_link_candidates` rows for the resolved `source_id` and that `sources` row, read back
through the database after the run.

**Hypotheses (verified, with basis):**
1. **The apply path writes exactly what the dry path planned, once.** Run-003 (apply, 23:18Z) is
   numbered honestly (the collision guard landed in Train 10), `upserted = 7`, and the table holds 7
   rows for the week with `first_seen_at` 23:03Z (the discarded collided apply) and `last_seen_at`
   23:18Z (run-003): the `UNIQUE url` upsert refreshed, never duplicated. Basis: `SELECT` on the table.
2. **Defect (tenth this day): the candidates' parent is a 1976 Commission opinion, not the OJ.**
   `config.source_id 000d2ee5-…` resolves to "EUR-Lex / 76/456/EEC Commission Opinion…", a
   document-level `sources` row, because the driver used db.mjs's host-keyed lookup on a host with 724
   such rows. Fixed in `resolvePortalSourceId` (exact portal URL; dedicated portal row on first apply);
   `PENDING-RUN.md` names run-004 as the discharge, and run-004's upsert re-points the seven rows.
3. **Registry observation, not fixed here (a decision, not a bug):** `registerSource`'s contract is
   "idempotent by canonical host", yet eur-lex.europa.eu carries 724 rows — the mint path registers a
   citation source per document by design (Addendum 80-era `registerSource` calls carry the CELEX URL).
   Two source kinds share one table under one dedup rule that only one of them obeys. Worth an ADR
   before any script relies on host-uniqueness again; recorded for the operator.

**Proposal:** run-004 (apply) to discharge the marker and heal the seven rows; then the FR and feed
first walks proposed above.
