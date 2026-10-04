## 8a. `institution-canonicalize`

**Purpose**: three parts, guarded by SKILL.md section 3 ("Canonical institutional tier - one tier per
institution") and ADR-002 (`base_tier` "never changes except via explicit operator override"):

- **Part A - mis-keyed institution merge.** An `institutions` row keyed to a GENERIC HOSTING domain
  (`amazonaws.com`, `cloudfront.net`, ... - a document was registered by WHERE it happened to be hosted,
  not WHO published it) sharing an exact name with exactly one real-domain institution is merged into it;
  `sources.institution_id` re-points, the duplicate row is deleted. Live example: "Smart Freight Centre"
  held two rows - one on `smartfreightcentre.org` (real), one on `amazonaws.com` (the GLEC Framework v3
  PDF's S3 host) - which failed the standard's own-body authority floor (migration 202 / SC-14) because
  the standard's own text resolved through the mis-keyed row.
- **Part B - intra-institution tier canonicalization.** Once an institution's rows agree on one identity
  (post-Part-A), any row whose `base_tier` diverges from what the institution's OWN registrable-domain
  rows already carry is set to that tier (never a majority vote, never a row a `tier_override` covers).
- **Part C - standards-body class-tier report + override.** `planRulingNeeded` reports every
  active/provisional `source_role='standards_body'` row worse than the class-table floor (T4 - SKILL.md
  section 3's "Industry body / classification society" row), unconditionally, in every mode. `planClassTierOverride`
  is the subset of that report whose HOST `src/lib/sources/host-authority.ts`'s `classTierForHost` resolves
  to EXACTLY the standards-body class tier (the `STANDARDS_BODY_ALLOW` class added 2026-09-04) - those rows
  are WRITTEN to `base_tier=4` (and `effective_tier`, only where it still equals the old `base_tier`) in
  apply mode, through the guarded path. A host the class table still leaves ambiguous stays in
  `ruling_needed` only, never guessed.

**Upstream / class-rule origin (Part C)**: audit `docs/audits/wiring-audit-2026-09-04/C1-loop-map.md` section 6 /
`C2-rulings-vs-implementation.md` found `ifrs.org` / `cdp.net` / `sciencebasedtargets.org` worklisted at
STEP SOURCE (`scripts/mint/heal-provenance.mjs`'s `classifyCitedUrlForOrphan`,
`status: "worklist_ambiguous_host"`) because `classTierForHost` matched no rule for them, even though
SKILL.md section 3 rates a standards body's OWN text T4 - the same tier an accredited CAB's own official acts
already get. **Operator ruling (2026-09-04, verbatim): "you know how to classify, fix it … T4."**
`host-authority.ts` now carries a `standards_body` class (`STANDARDS_BODY_ALLOW`, curated - same posture as
the existing `ASSOCIATION_ALLOW`, never a fuzzy `.org` rule) covering the three named hosts, plus GHG
Protocol / ISO / GRI / TNFD (the same rule - "a body that publishes standards/frameworks other institutions
report against, rated T4 for its own text, never T1-T3" - applied to every live `standards_body` host that
matches; WBCSD is already in `ASSOCIATION_ALLOW`, WRI's OWN site stays `ANALYSIS` T6 since `wri.org` is a
different act from `ghgprotocol.org`). Tests: `src/lib/sources/standards-body-class.test.mjs` (the class
rule itself) and `scripts/maintenance/institution-canonicalize.test.mjs` (`planClassTierOverride` +
apply-plan orchestration tests).

**Ruling**: Parts A/B - none (mechanical repair, never inventing a tier no row of the institution already
carries). Part C's override - the 2026-09-04 ruling above; no `--arg` token gates it (the ruling is
encoded in the class table itself, scoped to exactly the hosts `classTierForHost` now classifies - never a
blanket "raise every standards_body row").

**Dispatch**: `mode=dry` returns the full plan for all three parts, including `part_c_class_override` (what
apply WOULD write) and `part_c_ruling_needed` (the full worse-than-T4 report, including any host the class
table still leaves ambiguous). `mode=apply` writes Part A (merge + delete), Part B (tier canonicalize), and
Part C's class override, each through `guardedUpdateSourcesByIds`/`guardedDelete` (rule 015); Part C's
report is still computed and returned, unconditionally, in the same run.

**Live state at authoring** (coordinator-confirmed, Supabase, 2026-09-04, read-only `SELECT`): before this
class existed, 3 hosts / 4 `standards_body` rows sat above the T4 floor -
`ifrs.org` (1 active row, T5) + `www.ifrs.org` (1 provisional row, T5, `effective_tier` NULL),
`www.cdp.net` (1 provisional row, T5, `effective_tier` NULL - NOTE: the bare `cdp.net` row is
`source_role='industry_data_provider'`, a different row, correctly OUT of this report), and
`sciencebasedtargets.org` (1 active row, T5). All 4 rows carry `tier_override IS NULL` (no sanctioned
per-row exception in the way) and all 3 hosts are now covered by `STANDARDS_BODY_ALLOW`, so
`part_c_class_override` lists exactly these 3 hosts / 4 rows and an apply run writes `base_tier=4` on all
four (`effective_tier` also moves to 4 on the 2 active rows, whose `effective_tier` already equalled the
old `base_tier`; the 2 provisional rows' `effective_tier` stays NULL, untouched, same Part-B convention).
Other `standards_body` hosts already at/below T4 (`iso.org`, `globalreporting.org` T4; `ghgprotocol.org`,
`sciencebasedtargetsnetwork.org`, `tnfd.global` T3; `efrag.org` T2) are unaffected - deliberate rulings
already better than the class default, excluded by the same `base_tier > 4` filter both Part C functions
share.

**Artifact / read back**: `summary.json`'s `read_back.institutions_total` /
`merged_duplicate_ids_still_present` (Part A) and `read_back.tier_rows_after` (Part B + Part C rows
combined, `{id, base_tier, effective_tier}`) - confirm against
`SELECT id, base_tier, effective_tier FROM sources WHERE id = ANY(<ids>)`; `summary.counts.part_c_ruling_needed`
should be empty (or list only hosts the class table still leaves ambiguous) after a Part C apply run, and
`summary.counts.part_c_class_override.applied[].updated` should equal the row counts above.

**First dispatch** (Actions tab → Maintenance → Run workflow):
1. `step=institution-canonicalize`, `mode=dry` - review `part_a_merge.plan`, `part_b_tier.plan`, and
   `part_c_class_override.plan` (expect the 3 hosts / 4 rows above) before applying.
2. `step=institution-canonicalize`, `mode=apply` - writes Part A/B/C through the guarded path in one run;
   confirm the artifact's `read_back` and re-run the `SELECT` above.

---

