## 7. `tag-ratification`

**Purpose**: apply TAG proposals - `integrity_flags` rows `propose-tags.mjs` opened (section 6a, above writes
them; before this lane, `population-turn.yml`'s `--dry` run only ever previewed them in a log - see
section 6a) - decided by rule, no operator in the path (auto-adoption, added 2026-09-03). The legacy
operator path (a flag resolved with `ratify:tags` in `resolution_note`, applied by an `arg` id list) was
DELETED by lane G6-GATES (2026-10-05): the step has one behaviour and takes no `arg` (a stray `arg` is
ignored).

**Upstream, everything already exists**: `fsi-app/scripts/connections/propose-tags.mjs` (proposes; section 6a
is now its write dispatch, `population-turn.yml`'s own dispatch stays `--dry`-only, a log preview) and
`fsi-app/scripts/connections/apply-tags.mjs` (`evaluateAutoAdoption`/`autoAdoptTags`, imported
unmodified; its `applyTags`/`evaluateApplication` ratify half is deleted). This wrapper is orchestration only; no logic is reimplemented here.

**Ruling (auto path, 2026-09-03, CONFIRMED in session)**: the flywheel's own design spec closes its
second loop "without a human in the path" (`docs/specs/08-flywheel-design.md:128`), and 339 of 619
verified live items sat untagged with zero tag flags ever ratified - the ratify-only gate was a dead
end in practice. New rule: a DETERMINISTIC derivation (derive-tags.mjs's `confidence: "high"` tier - a
keyword matched in the item's own title/instrument-key, not just its body text) auto-adopts with
provenance recorded on the flag row. Full reasoning + the measured threshold justification:
`apply-tags.mjs`'s own header.

**Ruling (2026-09-12, ADR-030 rider, task 7.2 -- supersedes the "lower-confidence residue stays open"
line above)**: 1,288 open `flywheel-axis:source-classification` / 1,105 `flywheel-tag:` flags measured
that day, most stuck on exactly the medium-confidence residue the 2026-09-03 rule left untouched forever
("Items need to be resolved not quarantined... All questions have answers"). New rule: EVERY proposal on
a flag is now decided, not just the high-confidence subset -- a medium proposal adopts when its tag is in
the live closed vocabulary AND its keyword evidence is re-confirmed present in the item's own
title/what_is_it/summary/full_brief (re-checked at apply time, not trusted from the possibly-stale
proposal payload), else it declines with the reason. The flag ALWAYS closes once every proposal is
decided -- no residue stays open. See `apply-tags.mjs`'s `decideTagProposal`/`decideTagProposals`.

**Dispatch (2026-09-03, decision rule widened 2026-09-12, id path removed 2026-10-05)**:
- `mode=dry` -- lists every OPEN TAG_NAMESPACE flag as `decidable`
  (>=1 parseable proposal) or `not_adoptable` (malformed/foreign-namespace/zero-proposal), then runs
  every decidable flag through `autoAdoptTags({execute:false})` to report `adopt_count`/`decline_count`
  and a 20-row sample per outcome (`adopted_sample`/`declined_sample`) -- the coordinator reads this
  before apply. Writes nothing.
- `mode=apply` -- runs every decidable flag through `autoAdoptTags({execute:true})`:
  every proposal decides (adopt or decline -- see the ruling above), the merge writes only the adopted
  subset (merge-only, never removes an existing tag), and the flag ALWAYS closes with the shared
  `decision-note.mjs` `DECISIONS_JSON` grammar recording each proposal's outcome and reason
  (`resolution_note` starts with a human summary line, e.g. "tag-ratification (auto, threshold=high):
  decided 2 (adopted 1, declined 1)."). Idempotent -- safe to re-dispatch; an already-resolved flag is
  skipped by `evaluateAutoAdoption`'s own `status==='open'` requirement.

**Ruling (D15, defect-fix-plan-2026-09-12, lane L10)**: 1,034 of 1,105 open `flywheel-tag:` flags carried
zero proposals and asked for manual tagging; the auto path left every one of them open forever
(`evaluateAutoAdoption` refused them as "flag carries zero proposals"). Most were record-grade stubs from
2026-09-03 that now carry real brief text (batches 001/002, the timeline and forward-event backfills), so
the derivation that found nothing then may find tags now -- though, per D21 below, a thin-text stub was
only half the cause: some of the 1,034 carried plenty of real text whose only fault was that
`derive-tags.mjs`'s own `KEYWORD_MAP` had no keyword for the vocabulary term that text used. Two-part fix:
- **Decider** (`apply-tags.mjs`'s `autoAdoptTags`): a zero-proposal flag (`isZeroProposalFlag`) is decided,
  never skipped, it re-derives candidates for the flag's item from its CURRENT title/
  canonical_instrument_key/what_is_it/summary/full_brief through derive-tags.mjs's own pure `deriveTags()`
  (imported, not copied; see `buildReDeriveInput`), decides each via the SAME `decideTagProposal` every
  other proposal goes through, and resolves the flag either way: adopted tags (`buildDecisionNote`) or, if
  nothing decides at all, the fixed `buildNoDerivableTagsNote` wording ("no derivable tags from the item's
  own text on \<date\> (derive-tags KEYWORD_MAP); the item joins the connection graph through its entity
  refs; no manual tagging (ADR-030)"). The dry output adds three buckets:
  `re_derived_and_adopted_count`/`_declined_count`/`no_derivable_tags_count`, each with a 20-row sample.
- **Proposer** (`propose-tags.mjs`'s `proposeTags`): a ZERO-derivation finding no longer opens a flag
  asking for a human, `buildFlagRow` delegates to `buildNoDerivableFlagRow`, which writes the row ALREADY
  `status:'resolved'` under its own subtype (`empty-signature-no-derivable`, distinct from the
  proposal-bearing `empty-signature` subtype so the two dedup keys never collide; an item that later DOES
  derive proposals still opens a fresh normal flag). Dedup against a prior no-derivable write uses its own
  any-status read (`readExistingNoDerivable`), so a re-run merges into the same row rather than inserting a
  duplicate. The phrase "needs manual operator tagging" is removed.

**Ruling (D21, defect-fix-plan-2026-09-12, lane L13)**: even with D15's re-derivation live, the L10 dry
run still resolved 1,019 flags "no derivable tags" -- including items whose own title said "Emissions"
(e.g. "The Emissions Performance Standard (Enforcement) (Wales) Regulations 2015") -- because
`derive-tags.mjs`'s `KEYWORD_MAP` was written as a proposer's hint list of narrow synonym phrases
("emissions trading", "carbon pricing", ...), never widened when D15 promoted it into the decider's
complete evidence rule. Fix at the source: `KEYWORD_MAP` is now GENERATED (`buildKeywordMap()`) from the
three live vocabularies (`TOPIC_TAG_VALUES`/`COMPLIANCE_OBJECT_VALUES`/`SCENARIO_TAG_VALUES`) plus a
curated synonym table, so every tag carries at least its own name (and, for a hyphenated tag, both the
hyphen and space forms) as a keyword -- a tag added to a vocabulary tomorrow is covered automatically,
with no `KEYWORD_MAP` edit required. Matching stays word-boundary, case-insensitive, over
title/instrument-key/`what_is_it`/summary/`full_brief`; evidence recorded is always the matched phrase.

**Fix round 1 for D21 (review-l13.md, CONDITIONAL FAIL)**: the corpus-fixture rule is now explicit -- a
tag's own name may be suppressed only when a suppression never removes a tag's ONLY coverage; a real
corpus item, "The Packaging (Essential Requirements) (Amendment) Regulations 2009", carried bare
"packaging" in its own title and derived NOTHING at all pre-fix (the same "no derivable tags on an
obviously on-topic item" failure D21 exists to close), so `topic_tags:packaging` left the suppression
list. Re-checking the remaining nine against the same snapshot for this fix round found
`compliance_object_tags:exporter` (zero real corpus hits at all -- no measurement had ever supported it)
and `compliance_object_tags:shipper`/`distributor` (real hits, but overwhelmingly genuine on-topic uses --
e.g. RoHS Directive 2011/65/EU's own "distributor" definition) carrying the same unevidenced-suppression
defect; all three left the list too. A fourth pass, closing the one remaining title-level zero-tag gap the
new corpus-fixture test found ("The Motor Fuel (Composition and Content) (Amendment) Regulations 2001"),
added the specific phrase "motor fuel" to `topic_tags:fuels`' curated synonyms. Six suppressions remain,
each with per-tag measured evidence in `derive-tags.mjs`'s `SUPPRESS_OWN_NAME`:
`topic_tags:fuels`/`transport`/`corridors`/`reporting`/`research`, `compliance_object_tags:importer`
(`reporting` and `importer` are evidenced differently -- a synthetic apply-tags.mjs D15 fixture, reviewed
and accepted, not a corpus false positive; the other four each carry a named real-corpus item and phrase).
A new test (`tag-yield.fixture.test.mjs`) enforces the rule going forward: no real corpus item whose title
carries a suppressed tag's own bare name may derive zero tags total. No behaviour change outside
`KEYWORD_MAP`'s own coverage.

**Discovery re-run**: not repeated by this step (`apply-tags.mjs`'s own optional CLI step) - each
summary's `note` carries the documented fallback:
`node scripts/connections/discover-for-items.mjs --ids <item id(s)> --execute`.

**Artifact / read back**: `summary.json`'s `read_back` - the touched items'
`operational_scenario_tags` / `compliance_object_tags` / `topic_tags` after the merge. Confirm against
`intelligence_items` for those ids.

---

