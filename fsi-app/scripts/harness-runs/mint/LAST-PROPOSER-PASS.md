# Last proposer pass — mint

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `mint` now has **eighteen** artifacts (`mint-run-001` …
`mint-run-018`); F28's rule (d) requires this file to name the latest verbatim: **mint-run-018**.

## Pass of 2026-09-03, evening (lane ARTIFACTS — mint-run-017, mint-run-018: two more limit-~200 slices, and the first `ungrounded_url` failure in this cycle)

**Artifacts read:** mint-run-017 (population-turn run `33804773824`, apply, 2026-09-03T20:59Z, 178
attempted) and mint-run-018 (population-turn run `33806554326`, apply, 2026-09-03T21:17Z, 169
attempted), both `harness_version sha256:c933647da54908a1` — unchanged since mint-run-016, so no
`PENDING-RUN.md` is owed for this pass. Both were pushed to their own `population/<run_id>` branches
(Actions PR-creation is refused) and landed here by cherry-pick; neither branch was previously on
master.

**Full traces read:** both runs' `census-rows.json`, `census-rows.held.json`,
`census-rows.screened-out.json`, `census-rows.mint-batch-report.json`, and `census-rows.apply-ready.json`
under `scripts/_snapshots/population-33804773824/` and `scripts/_snapshots/population-33806554326/`.

**Metrics [CONFIRMED, read from the artifact JSON]:** run-017: `attempted 178, valid 177, invalid 1,
minted 177, minted_verified 177, apply_failed 0`; db_deltas items 177 / sections 463 / claims 1,116 /
citations 152. run-018: `attempted 169, valid 168, invalid 1, minted 168, minted_verified 168,
apply_failed 0`; db_deltas items 168 / sections 436 / claims 1,052 / citations 137. Held: run-017 34 rows
(`already_held_by_key` 12, `capture_blocked` 12, `canonical_key_unresolved` 3, `item_type_unmapped` 7);
run-018 43 rows (`already_held_by_key` 12, `capture_blocked` 13, `canonical_key_unresolved` 3,
`no_capture_path` 4, `item_type_unmapped` 11). Screened out before either slice was drawn: 1,116
off-vertical / 244 ambiguous (identical counts both runs — same screen ruling over the same census).

**Hypotheses (verified, with basis):**
1. **A new `ungrounded_url` failure, the same row, both runs.** Both artifacts' one `validation_failed`
   item carries the identical payload id `429c85d2-4176-4ff5-ab3e-9d98e364a58a`, the identical error
   `[2] ungrounded_url`, and the identical malformed URL `http://eur-lex»` — a bare `»` (U+00BB,
   right-pointing guillemet) truncating the source URL. Basis: read both `census-rows.mint-batch-report.json`
   `results[]` entries byte-for-byte; identical down to the tag-presence warning block. Traced to
   census row `0b697692-68cf-49d7-83cb-a26f610c8b32` (CELEX `22004A0806(01)`, source
   `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:22004A0806(01)`), whose `captured_text` is a
   legal protocol saturated with French-style guillemet quotation marks (`«Convention»`, `«pollution
   incident»`, …). The record-facts extractor's URL-grounding pass appears to have matched a span
   adjacent to one such guillemet and truncated at it, producing a URL that grounds to nothing. This is
   the same corrigendum/agreement CELEX shape (`(01)` suffix) already named in earlier passes as a
   `capture_blocked` class, but this is the first time one of that class reached the *validator* with a
   different failure mode (`ungrounded_url`, not a capture hold) — the row was captured fine and the
   payload built, but one FACT's URL span is corrupted.
2. **Because the row fails validation (never mints, never gets held), it stays `would_mint` and is
   re-exported on the very next dispatch, failing identically.** This is not this pass inferring a
   pattern from one run — it is directly observed: the SAME payload id appears with the SAME failure
   in run-017 (`census-rows.json` for `33804773824`) and again in run-018
   (`census-rows.json` for `33806554326`), one dispatch apart. Left unaddressed, this row (and any other
   guillemet-adjacent-URL row) will keep re-appearing and re-failing on every future slice at $0 wasted
   attempt each time, forever, since nothing currently marks a `validation_failed` row so the exporter
   skips re-selecting it.
3. **Validator-first-pass rate held at ~99.4% both runs** (177/178, 168/169) — consistent with the
   family's recent history (016: 178/178) and not itself a regression; one new failure class surfacing
   in 347 attempted rows is not evidence the validator degraded.
4. **Held-class mix is stable**, still dominated by `capture_blocked` (the EUR-Lex `(01)` robot-gated
   pages named in the mint-run-015/016 pass) and `already_held_by_key`/`item_type_unmapped`; `no_capture_path`
   (4 rows, run-018 only) is the classification EXPORT-HOLD's postscript-8 fix introduced for malformed
   CELEX shapes Cellar 404s under either encoding — its first appearance in a landed artifact.
5. **Pool remaining, read from the two runs together:** 178 + 169 = 347 rows attempted across these two
   slices; roughly 1,300 − 347 ≈ 950 mintable rows likely remain per the run-015/016 pass's estimate,
   though this pass did not re-query the live `would_mint`/held counts to confirm that figure — flagged
   as an estimate carried forward, not independently re-measured this pass.

**Proposal:** (1) **Investigate the guillemet-truncated URL as its own defect**, not folded into the
already-understood `(01)`-CELEX capture-block class: read `record-facts.mjs`'s URL-grounding regex
against row `0b697692`'s `captured_text` directly and confirm whether `»` (or any non-ASCII punctuation)
terminates the match early — same "unicode-normalization span checking" class of defect mint-run-001's
`defects_found` already named as MH-3 scope, recurring in a new shape. (2) **Exclude
`validation_failed` rows from re-selection** the same way `already_held_by_key` rows are now excluded
(EXPORT-HOLD's postscript-8 fix) — otherwise every future slice pays one wasted `attempted` row per
un-fixed failure, forever, and a proposer pass has to rediscover the same repeat-failure each time
instead of it being visible as a single held reason. (3) Both are scoped for a future mint-governing-file
change; not implemented in this landing (this lane cherry-picks and attests only, per its dispatch).

**Family gates status:** this landing adds two run artifacts and this attestation only; no
governing-file change (`harness_version` of runs 017/018 matches the current tree, unchanged since
run-016).

## Pass of 2026-09-03, midday (mint-run-015 dry, mint-run-016 apply — the first limit-200 slice on post-Wave-3 master)

**Artifacts read:** mint-run-015 (population-turn run 33747655857, dry, limit 200, capture on) and
mint-run-016 (run 33749140151, apply, same inputs), both at `harness_version sha256:c933647da54908a1`,
the hash `PENDING-RUN.md` named as the run that would supersede it — so that marker is discharged and
deleted in this landing per F28's reverse-audit. Both artifacts were read from the pushed
`population/<run>` branches (the repository's Actions setting refuses PR creation, so no PR opened).

**Full traces read:** both runs' `census-rows.json` (178 rows), `census-rows.held.json` (22),
`census-rows.screened-out.json`, `census-rows.mint-batch-report.json` (178 results, every one
`recommended_status: verified`, every one carrying the tag-presence warning), the apply-ready file
(178 payloads, 5–6 claims and 3 sections each); the live `intelligence_items`, `census_worklist`
and `item_gate_a_state` tables (Supabase, read-only).

**Metrics:** dry 178/178 valid, 0 defects. Apply `attempted 178, valid 178, minted 177,
minted_verified 177, minted_unverified 0, apply_failed 0, census_rows_reconciled 177,
not_applied_holder_conflict 1`; db_deltas items 177 / sections 464 / claims 1,122 / searches 177 /
gate_a 177 / citations 157 / sources 0. **Live read [CONFIRMED]:** `intelligence_items` 1,233 →
1,410; record-grade live 297 (120 before + 177), all `provenance_status = verified`; 42 archived
`off_vertical` unchanged (the reconcile step archived nothing new: the screen now gates the export, so
no off-vertical row reached the mint); `census_worklist` rows `reconciled` today 177. The selection
was identical between dry and apply (same 178, same 22 held, same 1,118 / 244 screen counts), which is
the property the dry-then-apply protocol depends on and had not been measured at limit 200 before.

**Hypotheses (verified, with basis):**
1. **The one refusal is correct.** Row `26bf4a98` (CELEX 32019R1242) is held by item `ab922a18`
   minted 2026-04-05 (read the holder row). The exporter's held-URL exclusion compares `document_url`
   to `source_url` and this pair differs in URL shape while sharing the canonical key, so the row
   reached the mint and M4's holder check refused it. Two layers, as designed; but the exporter could
   have excluded it by canonical key and saved the payload build — proposal 2.
2. **The held classes shifted from FR-type/unmapped-host (runs 012–014) to `capture_blocked` (19 of
   22).** Ten are EUR-Lex `(01)` corrigenda/agreement CELEX numbers, which have no Cellar resolver entry
   and fall back to the robot-gated legal-content HTML (202, 2,035 bytes, evidence on every hold); six
   are PDFs/document downloads answering 0 bytes to a plain client (climate.ec.europa.eu ×3, sdir.no,
   rules.cityofnewyork.us, ww2.arb.ca.gov). Basis: read the 22 holds' endpoint/status/bytes. These will
   be held on every run until a capture path exists for them; they are not a data defect.
3. **Every minted item has empty connection-signature tags** (177/177 live, three arrays empty). The
   validator warned on all 178 and minted anyway, by design; discover.mjs scores them zero edges until
   `propose-tags`/`apply-tags` run. `origin_class` is also null on all 177 (R-E's population is now
   940 of 1,160). Neither is new; both scale with every slice.
4. **Pool remaining:** `would_mint` 3,661, not yet held 2,672, of which the screen removes 1,362,
   leaving roughly 1,300 mintable rows, about seven more runs at 200 (each ~12 minutes, $0).

**Proposal:** (1) keep draining at 200 with apply only — the dry/apply selection identity is now
measured, so a per-slice dry adds twelve minutes and no information; read each artifact's
`minted_verified`/`apply_failed`/holder counts against the live table before the next dispatch, as
here. (2) Exporter: exclude by canonical key as well as by URL (hypothesis 1), and hold `(01)` CELEX
shapes as `no_capture_path` rather than re-fetching the robot page on every run (hypothesis 2). (3)
After the drain, one `propose-tags --execute` over the new ids and the R-E `origin_class` backfill,
before the corpus turn, so discovery sees tagged, classed items.


## Pass of 2026-09-02, night (mint-run-014 — the first screened slice; two failures, one cross-layer defect)

**Artifact read:** mint-run-014 (population-turn run 33678399902, apply, limit 50): 50 exported → 8 held
(`identity_unmapped_source` 4, `canonical_key_unresolved` 3, `item_type_unmapped` 1) → 42 attempted,
40 valid, 2 `validation_failed`, 40 `minted_verified`, 0 `apply_failed`, hash `sha256:9a3e4c77ec4d9342`
(the marker's value: discharged). Screened-out evidence: 1,118 off-vertical, 244 ambiguous in the
selected window. Reconcile step archived 42 live off-vertical record items (reversible). **Live read
[CONFIRMED]:** 120 record-grade items live, all `verified`; 42 archived `off_vertical`.

**Defect 1 (kit + live, same regex):** both failures `[2] ungrounded_url` on `…celex:32023d0628(01` /
`…32023d0207(01`: the URL extractor stops at `)`. Parity confirmed against the live function body
(`pg_get_functiondef`, md5 `7cb3d38f…`). Fixed both layers: migration 289 (applied live, post md5
`82f7032e…`) and `URL_RE` in the validator, with tests. **Defect 2 (title):** the same two rows carried
the OJ file name as `title`; exporter now rejects file names and extracts the act title from the body.

**Proposal:** (1) the held classes are stable across runs 012–014 (FR types + unmapped hosts, ~16–20% of
each slice); a lane should map `identity_unmapped_source` hosts to institutions and add the three FR
item types, or those rows will be held forever. (2) The kit's URL regex and the live function's should
be ONE literal read from one place; today parity is a test, not a structure.


## Pass of 2026-09-02, late evening (mint-run-013 — and the defect none of the artifacts could see)

**Artifact read:** mint-run-013 (population-turn run 33666187388, apply): 30/30 minted verified, 0
failures, hash `sha256:36ee951c38941943`. Three clean runs in a row (011: 43, 012: 39, 013: 30 = 122).

**The finding, from reconciling the 2026-08-31 build plan against the ledger (operator's request), not
from any artifact:** the screen family's ruling (1,729 mint / 1,676 off-vertical / 256 need-fetch) was
never applied by the population export, because it was never stamped on `census_worklist` and the
exporter selected on `dryrun_disposition = 'would_mint'` alone. Screening the live record-grade items
through `lib/screen-verdict.mjs`: roughly half are off-vertical by that ruling (USCG safety zones, FAA
airworthiness directives, federal pay rules, VAT derogations, EC type-approval SIs). A harness that
measures the mint gate (C1–C7 + kit) had no criterion for relevance, so 100% first-pass rates
coexisted with ADR-020's August incident repeating. Basis: the join of live items to census rows, the
reviewed-verdicts file, the exporter's selection code, Addenda 70–72.

**Fixed in this landing:** the export gate (only `on_vertical` rows, limit applied to mintable rows,
`census-rows.screened-out.json` evidence); `screen-reconcile-records.mjs` after apply (archives
off-vertical live records reversibly, lists ambiguous for a ruling); runbook §11.

**Proposal:** (1) the next apply dispatch performs the archive and is the first screened slice; read its
reconcile counts against the live corpus. (2) Structural: the mint gate and the relevance screen are two
families that never talk; a payload should carry its screen verdict and the validator should refuse to
validate a payload that lacks one (a kit-level check, like tag presence) — then a harness artifact
would have shown this. Scoped for the shared write-sequence refactor already on the board.


## Pass of 2026-09-02, late (mint-run-012 — the second slice, clean)

**Artifact read:** mint-run-012 (population-turn run 33659080799, apply, limit 50): attempted 39, valid
39, `minted_verified` 39, `apply_failed` 0, census rows reconciled 39; harness_version
`sha256:36ee951c38941943` — the hash PENDING-RUN named, so that marker is discharged (deleted here).
**Live read:** 92 record-grade items `verified`, not archived (53 + 39). Nothing to propose from this
artifact; the guillemet delimiter removed the one kit failure class of run #9 (0/39 this time). The
sizing observation stands: 39 of 50 selected rows exported (11 held, the same three FR types and unmapped
hosts as before), so a limit-50 dispatch lands ~40 items; the census has ~3,500 `would_mint` rows left.

## Pass of 2026-09-02, night (mint-run-011 — the first apply that landed verified items)

**Artifact read:** mint-run-011 (population-turn run 33656779918, apply, limit 50): 43 attempted, 43
`minted_verified`, 0 `minted_unverified`, 0 `apply_failed`, 43 census rows reconciled; harness_version
`sha256:2aa3acb86dc8a0a0`, the hash PENDING-RUN named, so that marker is discharged (deleted here).

**Live read:** 53 record-grade `intelligence_items` with `provenance_status = 'verified'`, not archived:
the 43 of this run plus the 10 of run #8 healed by `rederive-record-provenance.mjs` (its log: "record-grade
rows not verified: 10; derivation says verified now: 10; touched 10").

**Hypotheses (verified, with basis):**
1. The gate-before-claims order is what made the difference: same 45-row slice, same validator hash as
   run #8's 0/10 verified; 43/43 verified rows this time. Basis: per_item outcomes now come from the row's
   own status (read back), not the RPC.
2. The run's FAILED status was the reconciliation script's self-check, not the data: it read the
   status from the UPDATE's returning rows, which Postgres fills before the AFTER trigger runs, so it
   saw 0 verified after healing 10. Fixed (fresh SELECT after the touch; test). No row was wrong.
3. Two of the 45 exported rows did not mint (45 → 43): named in the artifact's `not_applied_*` counts,
   to be read against M4's holder rules on the next pass, not assumed.

**Proposal:** run the post-apply flywheel pass (corpus-turn: discovery + forward-event extraction) over the
53 items; then the next population slice (limit 50) at this hash.


## Pass of 2026-09-02, evening (mint-run-010 — the first live apply)

**Artifact read:** mint-run-010 (population-turn run 33653378846, apply, limit 50): the gate 45/45 as in
run #5; the apply pass reached 11 of 45 and died. The artifact's per_item block still reads `apply_ready`
for every id because apply-mint-batch.mjs never got to its enrichment step — the record of what the
apply did is the live database plus the run log, read directly.

**Full traces read:** the run log (`gh run view --log`), the 11 live `intelligence_items` rows
(`item_grade = 'record'`), `validate_item_provenance(id)` for three of them, the trigger inventory on
`intelligence_items` / `intelligence_item_sections` / `section_claim_provenance`, `guard_provenance_flip`'s
body, the FK inventory referencing `intelligence_items`, canonical-pipeline.ts ~line 1733.

**Hypotheses (verified, with basis):**
1. **Every minted item was `quarantined` although the function derives `verified` for it.** Basis:
   ran `validate_item_provenance` on the rows (`(t,[],verified)`); the trigger fires on section and
   claim inserts only; apply-mint-batch.mjs wrote `item_gate_a_state` after the claims, so the last
   derivation saw no gate row (criterion 7) and its stamp stuck. The artifact's `minted_verified`
   outcome came from the RPC (a pure function), not the row. Fixed: gate before claims; the outcome
   follows the row's own status; `rederive-record-provenance.mjs` heals stale stamps after every apply.
2. **The abort at item 11 was a U+0000 in a Federal Register raw text**, refused by Postgres on the
   `agent_run_searches` insert after the item row existed; the loop had no per-payload boundary, so the
   batch died and a bare row stayed. Fixed: U+0000 dropped at capture; per-payload failure deletes the
   partial item through the guarded path (cascades), records `apply_failed` + cleanup, continues.
3. **The WO-26 stamp finished (491/491)** on this run with the halving chunker — runs #6/#7's timeouts
   were the per-row provenance re-derivation (70 ms – 3.4 s) against the API's 8 s limit, not the row
   count.
4. The 10 live quarantined items and the one bare item are healed by the next apply dispatch: the
   reconciliation step touches the 10 (the function already says verified), and the bare row —
   `fb465e8f` — is a partial write with no sections; it is deleted by the coordinator through
   `guardedDelete` before that dispatch so the census row re-exports cleanly (recorded in Addendum 84).

**Proposal:** dispatch apply again at the new hash; read `mint-run-011`'s `minted_verified` /
`apply_failed` metrics and the rederive step's counts against the live rows.


## Pass of 2026-09-02, later (mint-run-009 — the first record-grade run at the corrected gate)

**Artifact read:** mint-run-009 (population-turn run 33647357868, dry, limit 50, capture on):
attempted 45, valid 45, invalid 0, `validator_first_pass_rate 45/45`, harness_version
`sha256:2d498956fb8c476f` — the hash `PENDING-RUN.md` named, so that marker is discharged (deleted in
this landing per F28's reverse-audit). Held 5: 3 FR `item_type_unmapped`, 2 `identity_unmapped_source`.

**Full traces read:** `census-rows.json` (45: 26 EU, 14 GB, 5 US), `census-rows.held.json`,
`census-rows.mint-batch-report.json`, the apply-ready file (dry apply: 45 `would_apply`).

**Hypotheses (verified, with basis):**
1. **Cellar is measured, not inferred, from the runner now:** all 26 EUR-Lex rows captured through
   `publications.europa.eu/resource/celex/<key>` (0 `capture_blocked`, texts 1.6k–2.59M chars; the
   2.59M one is 32008R1272, CLP, annexes included — ADR-016: the grounding pool is never capped). The
   `[INFERRED]` label on the previous pass's hypothesis 3 is retired.
2. **One title defect, six rows:** older acts come back from Cellar as legacy EUR-Lex HTML (no
   `oj-doc-ti`), and the body-lead fallback produced "EUR-Lex - 32001D0573 - EN Important legal notice |
   ..." as the title. Basis: read the six `captured_body_lead` rows; opened 32001D0573 in the browser
   (`<title>EUR-Lex - <CELEX> - EN</title>`, `<h1>` = CELEX, first `<strong>` = the act's title). Fixed in
   this landing (`extractCellarTitle` legacy branch, test). The apply run re-exports, so no dry row is
   reused with the wrong title.
3. 20 OJ titles run 250–555 chars; the live corpus already carries titles to 719 chars (measured), so
   this is the established shape, not a defect.

**Proposal:** dispatch apply (limit 50) at this hash; read `mint-run-010` and the live
`intelligence_items` rows (`item_grade = 'record'`, `provenance_status = 'verified'`) against the plan.


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
