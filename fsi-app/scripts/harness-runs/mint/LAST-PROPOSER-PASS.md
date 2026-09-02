# Last proposer pass — mint

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `mint` now has **eight** artifacts (`mint-run-001` …
`mint-run-008`); F28's rule (d) requires this file to name the latest verbatim: **mint-run-008**.

## Pass of 2026-09-02 (mint-run-007, mint-run-008 — the record-grade path's first two live executions)

**Artifacts read:** mint-run-007 (population-turn run 33639133429: attempted 0 — the exporter held all 50
selected rows; root-caused and fixed in PR #523, recorded in MINT-RUNBOOK §11's addendum) and mint-run-008
(run 33643532589: attempted 19, valid 0, invalid 19, `validator_first_pass_rate 0/19`).

**Full traces read:** both runs' `census-rows.json` / `census-rows.held.json` /
`census-rows.mint-batch-report.json` under `scripts/_snapshots/population-<run>/`; the 19 per-item
failure lists; the live `sources` rows for legislation.gov.uk / federalregister.gov / eur-lex.europa.eu
(Supabase, read-only); migration 202's criterion-3 SQL; `registerSource` in `scripts/lib/db.mjs`.

**Hypotheses (verified, with basis):**
1. **All 19 failures are one defect in the JS mirror, not in the data or the live gate.** Every failure
   is `fact_below_authority_floor` with `source_tier_derived: null`; every payload's `source` is a
   tier-1 active registry row (`legislation.gov.uk/` or `federalregister.gov/`, the institution rows
   `registerSource` dedups to); every fact cites the instrument's own page under that host. The mirror
   resolved the tier by exact canonical-URL equality, so it derived null; the live function derives it
   through `scp.source_id`, which apply-mint-batch.mjs binds to that same row, so the live gate would
   have passed. Basis: read both resolution paths; re-ran the 19 payloads through the fixed validator,
   19/19 valid. Fixed in this landing (`validate-mint-payload.mjs` + `scripts/lib/institution-key.mjs`,
   three new tests). Never re-tighten the mirror to exact URL.
2. **The record-facts extractor accepted page chrome as a FACT.** `jurisdictional_scope` on UK rows was
   "European Union Treaties -------------" (legislation.gov.uk's browse menu) or an Act name
   ("European Union (Withdrawal) Act 2018"); one `penalty_summary` span carried a raw `&#xD;`. Each was
   verbatim (criterion 3 satisfied) and still not a statement of scope. Basis: read the 19 claim sets.
   Fixed: `isProseSpan` (word floor, punctuation-run and entity rejection), all matches of all triggers
   walked instead of the first match of the first trigger, clause-shaped scope triggers first and the
   bare institution name only as a preposition's object; `stripHtmlToText` decodes numeric references.
   Re-run over the 19 rows: 31 slot FACTs, 63 GAPs, zero chrome spans.
3. **EUR-Lex refuses the runner, Cellar does not.** All 26 EUR-Lex rows held `capture_blocked` with the
   same evidence (HTTP 202, 2,035 bytes, "verify that you're not a robot"): a bot gate on
   `legal-content/EN/TXT/HTML/`. The Publications Office's Cellar resolver
   (`publications.europa.eu/resource/celex/<key>`, 303 → the act's XHTML) carries the same text with no
   gate — browser-verified for 32006D0507 (96,603 chars, `p.oj-doc-ti` title lines). Basis: browser
   read of both endpoints. Fixed: Cellar first, EUR-Lex second, both attempts on the hold. The runner
   confirms this on its next dispatch; until then the Cellar path's behavior against a plain HTTP client
   is **[INFERRED]** from the browser's own redirect chain, not measured from the runner.
4. mint-run-007's empty batch is already closed (PR #523); it is landed here only because it is the
   family's honest seventh record and `claimRunId` numbered mint-run-008 after it.

**Proposal (for the next dispatch, not implemented here):** (1) re-dispatch `population-turn` dry at the
new hash, read `mint-run-009`'s first-pass rate and the held file's Cellar evidence before any apply;
(2) if Cellar captures land, retire the browser-capture `rows_file` path for EUR-Lex to the exceptional
case §11 already describes; (3) the two `identity_unmapped_source` hosts and three FR `item_type_unmapped`
holds of run #4 stay held by design until an operator rules on them.

**Family gates status:** this landing CHANGES two mint governing files (`validate-mint-payload.mjs`,
`src/lib/intake/record-facts.mjs`); `PENDING-RUN.md` is re-stamped to the new hash
(`sha256:2d498956fb8c476f`) and names mint-run-009 as the superseding run.

## Pass of 2026-08-31 (mint-run-005, mint-run-006) — retained verbatim

**Artifacts read:** mint-run-001 through mint-run-006.

**Full traces read:** `/root/work/mint/batch-002/BATCH-002-REPORT.md` (the M4 authorship lane's full
record, including its §5 deviations), the five `payload-<celex>.json` / `source-<celex>.txt` pairs of
batch-002 (SHA-256-verified against the live EUR-Lex pages by the authoring lane), `queue-8.json`,
`apply-snapshot-pre.json`, `gen-apply-sql2.mjs` and the five generated apply files, and the M3 apply
lane's per-item verification rows — every path in `mint-run-005.json`/`mint-run-006.json`
`full_trace_refs`.

**Hypotheses (verified, with basis):**
1. The mint-run-004 pass's proposal 1 (canonical-key dedup) **worked in production this cycle, twice
   over**: the coordinator's queue-wide pass reconciled 104 rows already covered by live verified items
   (title-identical on a 10-row sample; ran the queries), and the lane-level mandatory pre-check caught 3
   further archived-holder conflicts inside batch-002 that the coordinator's own batch selection had let
   through (mint-run-006 `defects_found[0]` records that selection miss honestly). Detection is now
   layered; the selection-query fix is named for batch-003.
2. Apply mechanics extended cleanly to source registration: 4 of 5 batch-002 items registered their
   `sources` rows inline in the same DO block (guarded, following the live registry convention), and all
   5 items flipped to `verified` first-pass with exact DB deltas (+5/+20/+25/+5/+5/+5, +4 sources, zero
   flag residue). Basis: ran the post-apply delta check; M3's verification rows.
3. Two genuine new defects surfaced and are recorded, not smoothed over: the **32018D0491 mis-keying**
   (an archived rail-freight-corridor item holds the CELEX key of the SES performance-targets decision —
   one of the two is wrong; predates this session) and the **runbook slice-ceiling fiction** (§1a says
   ≤8,000 chars; the browser tool's real output budget is ~950 chars — M4 authored the 66K-char document
   at 69+ slices; the figure should be corrected to what the tool actually does).
4. Cumulative queue state after this cycle: 3,546 unreconciled would_mint rows; 1,771-class clean pool
   shrinking as minted (9 items minted across batches 001-002, all verified first-pass); 459 rows blocked
   on the archived-holder policy (an operator decision, parked with a decision artifact); 1,313
   CELEX-underivable rows need per-shape identity derivation before dedup can cover them. Basis: ran the
   queue anatomy queries.

**Proposal (scoped for batch-003, NOT implemented in this landing):**
1. **Selection-query holder check** — the batch-003 candidate query joins `intelligence_items` on the
   derived key for ALL holder states and excludes/flags accordingly (closes mint-run-006
   `defects_found[0]` at the source; the lane pre-check stays as the second layer).
2. **Runbook corrections in one governing-file edit** (rides a code train with its own PENDING-RUN.md or
   run artifact): §1a slice ceiling to the measured ~950-char tool budget; step 1's already-minted check
   upgraded from `source_url` to canonical key; census resolution mechanics
   (`enumeration_status='reconciled'`, item id in notes) added to the apply section.
3. **32018D0491 investigation** — read item 70edf0e8's sections/source against CELEX 32018D0491 and
   32018D0500 (the plausible rail-freight-corridor neighbor) to determine which key is wrong; correct via
   a coordinator-guarded write with its own snapshot.
4. **Gate-A scanner**: citation-line bare-year false positive (mint-run-005 `proposer_notes`) — a
   candidate test-first fix for the next code wave, not urgent (payload-level workaround exists).

**Family gates status:** this landing adds run artifacts and this attestation only — no governing-file
change (`harness_version` of runs 005/006 matches the current tree). Fitness suite incl. F28 runs in the
landing train's CI.
