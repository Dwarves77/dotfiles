## 49. `resolve-refetch-holds`

**New this runbook, D17 family 11, defect-fix-plan-2026-09-12 (lane L11). Rewritten for the
re-grounds-never-destroy dominance guard, fix round 2 for L11 family 11 (lane L11b, 2026-09-13).**

**Purpose**: resolves the `refetch-capped-worklist` holds `scripts/remediation/
refetch-capped-worklist.mjs`'s own EXECUTE mode writes when a legacy-capped row's fresh re-capture no
longer verifies a previously grounded FACT span (a real ADR-016 provenance question, not a proposer
asking a human for nothing -- the enumeration, Family 11, found no dedicated resolver). Per held item:
re-check every FACT claim's verbatim `source_span` against every stored capture in the item's pool, ZERO fetch
(`cheapVerifyClaims`'s own primitives, `src/lib/sources/cheap-verify.mjs` -- the SAME zero-fetch,
snapshot-first entry point `verify-item.mjs`/`regen-quarantined.mjs` already use; see this script's own
header for why the plan's literal "groundBrief" text is not the mechanism this reuses -- a paid Sonnet
call is incompatible with this lane's own $0 constraint and with the plan's own "snapshot first, zero
fetch" parenthetical in the same sentence).

**Fix round 2 (dominance guard)**: the original version verified spans against the item's NEWEST capture
only. A live dry run on master would have superseded 263 of 333 FACT claims across seven items because
their newest stored capture is a degraded fetch (126-382 character stub) while an older pool row still
holds the full instrument (up to 249,114 characters) -- exactly the shape the re-grounds-never-destroy
dominance guard (PR #336, `src/lib/agent/ledger-dominance.mjs`) exists to catch, applied here by analogy
(NOT by importing that module -- its axes are ledger-summary counts, this fix's axis is raw per-capture
span verification, a different shape of the same doctrine). The fix (`planItemReground`) now verifies
every held item's FACT spans against EVERY stored capture in its `agent_run_searches` pool, not the
newest alone:
- the **dominant capture** is whichever pool row verifies the most spans (ties broken by longer
  `result_content`);
- a claim is superseded ONLY when NO stored capture in the pool verifies it (`unmatchedFactClaims`);
- when the chronologically newest capture verifies FEWER spans than the dominant one, that is recorded as
  a **degraded newest** (`degradedNewestClause`): the resolution note names both capture rows (`row <id>`)
  and their character lengths, and the claims are KEPT, re-grounded on the dominant capture instead of
  being destroyed by a worse re-ground.

Outcomes: `re_grounded` (every FACT span verified by some capture in the pool, possibly with a
degraded-newest note), `no_capture` / `no_fact_claims` (nothing to check), or `needs_supersede` (at least
one span verifies against NO stored capture anywhere) -- a drifted span is SUPERSEDED through the existing
`claim_versions` mechanism (`src/lib/agent/ledger-apply.mjs`'s own `versionPayload` row shape,
`supersede_reason='changed'`) -- the item's own `provenance_status` is then re-read: `superseded` if it
stays verified on its other claims, `quarantined` if the provenance gate's own trigger flips it (an
ENQUEUE into Family 1's standing investigation, `regen-quarantined.mjs` -- no second mechanism). The
flag's resolution outcome on a re-grounded item now reads "(re-grounded on capture <row>, degraded newest,
superseded <n>)" when a degraded-newest condition was found, naming the capture the claims were actually
re-grounded on.

**Upstream**: `scripts/lib/db.mjs` (`readAll`, `guardedUpdateByIds`), `src/lib/sources/cheap-verify.mjs`
(`normalizeForMatch`, `spanPresent`), `src/lib/agent/ledger-apply.mjs` (`versionPayload`, now exported for
this reuse) -- all called unmodified. (`pickBestCapture` is no longer used here -- the dominance guard
reads the item's FULL capture pool, `id, result_content, searched_at`, not one pre-selected "best" row.)

**Ruling**: D17 family 11 (defect-fix-plan-2026-09-12, ruling table row 11); fix round 2 for L11 family 11
(re-grounds-never-destroy dominance guard applied to per-capture span verification, lane L11b).

**Dispatch**: no `--arg`. $0, no LLM, no fetch, in both modes.

**Artifact / read back**: `summary.json`'s `counts.by_outcome` / `counts.superseded_claims` /
`counts.degraded_newest` / `counts.flags_resolved`. Confirm against `SELECT count(*) FROM integrity_flags
WHERE created_by = 'refetch-capped-worklist' AND status IN ('open','in_review')` (expect 0 after apply),
`SELECT count(*) FROM claim_versions WHERE supersede_reason = 'changed' AND created_at > '<run start>'`
(expect far fewer than 263 across the seven affected items, since the dominance guard only supersedes a
span no pool capture verifies), and `SELECT provenance_status FROM intelligence_items WHERE id = ANY(<affected item ids>)`.

**First dispatch** (coordinator): `mode=dry` first -- the 8 live holds are few enough to read the full
`sample_by_outcome` in one pass before ever applying; specifically confirm the seven items with a degraded
newest capture show `degraded_newest` counts and zero (or near-zero) supersessions, not the pre-fix 263.

---

