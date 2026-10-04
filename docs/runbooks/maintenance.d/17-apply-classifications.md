## 17. `apply-classifications`

**Documentation gap closed, Lane REVIEW-WIRE, 2026-09-04**: this step has existed and run in
`.github/workflows/maintenance.yml` since Lane CLASSIFY-STEP (2026-09-04) - `docs/audits/
wiring-audit-2026-09-04/A1-runtimes.md` lists it `WIRED+USED` (session-log #25: "apply
`apply-classifications`: 1,015 flags inserted, 797 auto-adopted") but flagged it as one of 4 steps
missing from this runbook. This section is that missing documentation, written from
`scripts/maintenance/apply-classifications.mjs`'s own header.

**Purpose**: orchestrate the full source-classification `propose → auto-adopt` pipeline in one dispatch
(operator ruling 2026-09-03 retires the human-gate-for-everything posture for deterministic axes).
`propose-classifications.mjs` and `apply-classifications.mjs`'s own core existed but never ran as part of
any turn - this step is the missing coordinator-dispatch runtime.

**Upstream**: `scripts/classification/apply-classifications.mjs`'s `evaluateAutoAdoption`/
`autoAdoptClassification`, `src/lib/classification/classify-source.mjs`'s
`proposeSourceAxisClassification`, `src/lib/classification/routing.mjs`'s `detectDrift`/
`isAnomalousCategory` - all imported and orchestrated (not reimplemented) by
`scripts/maintenance/apply-classifications.mjs`.

**What it does**: Dry - computes fresh Axis 3/4/5 proposals (classify gaps, drift, item-category
anomalies) as `integrity_flags`, without writing, then evaluates every resulting OPEN
source-classification flag for what `--auto-adopt` would decide. Apply -- runs the propose logic with
real writes (new `integrity_flags` rows, stale ones resolved), then runs `autoAdoptClassification` for
every OPEN source-classification flag, writing only the high-confidence (`scope_modes`/`scope_verticals`
at `"high"` confidence -- a decisive name match), deterministic (`expected_output`, a closed
role→default lookup), and evidence-reconfirmed (`scope_topics`, see below) fields through the guarded
path.

**Ruling (2026-09-12, ADR-030 rider, task 7.2 -- widens the 2026-09-03 posture above)**: measured that day,
1,288 open `flywheel-axis:source-classification` flags, most stuck forever on exactly the two fields the
2026-09-03 rule never decided at all -- `scope_topics` (always "ratification-only", never auto-evaluated)
and `jurisdictions` (never applicable, silently excluded from `fullyCovered`, so a jurisdiction-only flag
had NOTHING here and stayed open with no path to close). New rule, per proposal: `scope_topics` decides
PER TOPIC -- adopts a topic when `scope.mjs`'s own keyword table (or the role-derived `"regulatory"` rule)
re-confirms evidence in the source's CURRENT name/role, else declines with the reason (never trusted from
the possibly-stale proposal payload). `jurisdictions` ALWAYS declines -- this is an architectural gate, not
an evidence check: `sources.jurisdictions` is a live, differently-scoped region-bucket column
(`eu|us|uk|latam|asia|hk|meaf|global`) three live surfaces already read; writing this framework's
ISO-3166 values into it would silently corrupt those reads (`classify-source.mjs`'s own header), and no
ADR yet authorizes a dedicated Axis-3 column. `scope_modes`/`scope_verticals`/`expected_output` keep their
existing write rule exactly ("as today") -- what changes is that a non-writing residue (e.g. a
medium-confidence `scope_modes` proposal) now DECLINES with a reason instead of leaving the flag open.
**Every proposal on a flag is now decided -- the flag ALWAYS closes**, via the shared `decision-note.mjs`
`DECISIONS_JSON` grammar (`resolution_note` = a human summary line, e.g. "apply-classifications:
decided 3 (adopted 2, declined 1)."). See `apply-classifications.mjs`'s `decideClassificationProposal`/
`decideScopeTopicsProposal`/`decideClassificationProposals`.

**Coordinator ruling on two disclosed divergences (review-7.2.md, both accepted, no code change to the
rule itself)**: a jurisdiction proposal closes as declined with the architectural gate named in
`resolution_note` itself (`sources.jurisdictions` carries the region-bucket vocabulary three live
surfaces read; the ISO values have no column of their own); per the ADR-030 rider, "a decision of 'no
action, and why' is a valid close", so this decline IS the close, not a deferral. `scope_topics`
re-checks the classifier's OWN evidence basis -- the source's name and role, the same two fields
`classify-source.mjs`'s `classifyScopeTopics` itself derives a proposal from -- which is what the task
7.2 brief's phrase "the source's stored capture" meant here: this framework has no fetched-page-text
store for a source (see `classify-source.mjs`'s header: "Deterministic name/role keyword matching only
-- no content fetch, no LLM"), so the source's own registry name/role fields ARE its stored evidence.

**Correction (D9, lane L14, 2026-09-13): the jurisdiction decline above is RETIRED because the column
now exists.** Migration 033 (`fsi-app/supabase/migrations/033_jurisdiction_iso.sql`) added
`sources.jurisdiction_iso TEXT[]` -- a safe, ISO-shaped Axis-3 home distinct from the legacy
`sources.jurisdictions` region-bucket column, which stays untouched by this path forever (by
construction: `classify-source.mjs` never emits field `"jurisdictions"`). Axis 3 now writes into
`jurisdiction_iso` under the same decisive-match rule as `scope_modes`/`scope_verticals` -- confidence
`"high"` (a decisive host-identity match from `jurisdiction.mjs`'s institutional-domain table) adopts,
else declines with a reason -- plus one extra unconditional gate: a proposed value not shaped per
`vocab.mjs`'s `isValidJurisdictionValue` (an ISO 3166-1/3166-2 code or a known free-text sentinel)
declines regardless of confidence, with the reason `"jurisdiction_iso value <v> is not in the framework
vocabulary."`. `jurisdiction_iso` also joined `APPLICABLE_FIELDS`/`AUTO_ADOPT_FIELDS`, so a ratified flag
carrying only a jurisdiction_iso proposal is applicable, and a high-confidence one auto-adopts without a
ratify marker. See `classify-source.mjs`'s header and `apply-classifications.mjs`'s
`decideClassificationProposal` for the full reasoning.

**Dispatch**: no `arg`. `mode=dry` reports the fresh proposal counts and the decision split
(`counts.auto_adopt.eligible`/`decidable_count`/`not_eligible_count`). `mode=apply` writes through the
guarded path (rule 015) and closes every reached flag.

**Artifact / read back**: `summary.json`'s counts for proposed/resolved/auto-adopted flags, per-source
detail. Confirm against `SELECT resolution_note, count(*) FROM integrity_flags WHERE resolution_note LIKE
'auto-adopted:%' GROUP BY 1` (the `auto-adopted:<kind>:<confidence>` format ADR-025 specifies).

**Ruling (D17 families 4 and 5, defect-fix-plan-2026-09-12, lane L10)**: 1,287 open
`flywheel-axis:source-classification` flags carried a zero-proposal subset that `evaluateAutoAdoption`
refused and left open forever; `flywheel-axis:source-drift` stayed advisory-only with no apply target; the
single open `flywheel-axis:item-anomaly` row had a detector with no reader that ever acted on it.

- **Family 4 (classification zero-proposal)**: the decider (`apply-classifications.mjs`'s
  `autoAdoptClassification`) re-derives an open, zero-proposal flag (`isZeroProposalClassificationFlag`)
  from two deterministic signals classify-source.mjs's name/role matchers never read: the SC-13 class
  table (`classTierForHost`, `src/lib/sources/host-authority.ts`) and the source's own observed
  item-category distribution (`observedDistributionFromItems`, same read the drift check makes), via
  `deriveClassTableCandidates`/`reDeriveZeroProposalClassification`. Scope is deliberately narrow (see that
  function's own header comment): only tier 1 (`classTierForHost` = 1, unambiguous legal-primary) derives
  scope_topics/scope_verticals/a role-default expected_output; tier 2 (gov/intergov, merged) derives
  scope_topics only; the observed distribution can feed expected_output at ANY tier once the sample clears
  the floor (10 items, `CLASS_TABLE_MIN_ITEMS_FOR_OBSERVED`), nothing is ever guessed for an ambiguous
  tier. The flag resolves either with the adopted values (`buildDecisionNote`) or, when nothing derives,
  with `buildNoDerivableClassificationNote`'s fixed wording ("no derivable classification from the class
  table or the observed output on \<date\>; re-evaluated on the next classify run"). The proposer
  (`propose-classifications.mjs`) no longer writes "needs manual operator classification"; a
  zero-derivation finding is recorded already-resolved under its own subtype
  (`source-classification-no-derivable`, `flags.mjs`), same anti-collision design as D15's TAG namespace.
- **Family 5 (drift and anomaly)**: `autoResolveDriftFlag` decides EVERY open source-drift flag: when the
  source's own observed output covers at least 20 items across at least 2 distinct calendar dates
  (`DRIFT_MIN_ITEMS`/`DRIFT_MIN_DISTINCT_DATES`; "runs" has no tracked column on `intelligence_items`, so
  distinct `created_at` dates is the literal available proxy, named as a scoped interpretation). Ruling
  (fix round 1, review-l10.md): reading "runs" as distinct calendar dates of observation is accepted; no
  behavior change. It adopts
  the observed distribution as the new `expected_output` (guarded update) and resolves the flag with the
  before/after values; below that sample it resolves with "insufficient sample, re-evaluated next run".
  Never left open either way; the proposer's own drift-proposing loop is unchanged (still opens the flag,
  never writes `sources`). `retireAnomalyFlag` closes any surviving open item-anomaly flag unconditionally
  with "advisory retired under the ADR-030 rider"; `propose-classifications.mjs`'s `buildAnomalyFlagRow` and
  its `--anomalies` detection loop are deleted (the CLI flag is still accepted, parse-compatible, but is now
  always a no-op).
- Both families are wired into `apply-classifications.mjs`'s own `--auto-adopt` CLI (reads the source's own
  items via a new `readSourceItems` dep) and into the MAINT wrapper's `main()` (Phase 2 extended for
  zero-proposal re-derivation; new Phase 2b/2c for drift/anomaly, reusing the items already loaded for
  Phase 1's proposing pass, no extra DB read). `summary.counts.family5` reports `drift_open`/
  `drift_would_adopt`/`drift_resolved`/`anomaly_open`/`anomaly_retired`.

---

