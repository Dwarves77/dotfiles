# Last proposer pass — mint

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `mint` now has **six** artifacts (`mint-run-001` …
`mint-run-006`); F28's rule (d) requires this file to name the latest verbatim: **mint-run-006**.

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
