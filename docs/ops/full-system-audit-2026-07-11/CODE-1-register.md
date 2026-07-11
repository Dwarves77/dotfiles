# CODE-1 Register — Pipeline (fsi-app/src/lib/agent, sources, workflows, llm, remaining lib)

Audit branch `audit/full-system-2026-07-11`, baseline master `71bcbd4`. READ-ONLY; zero fetches; one
read-only SELECT (documented in the deviation log). Findings carry file:line evidence, severity
(breaks-customer / breaks-doctrine / dead-weight / cosmetic), and a candidate next-action.

---

## A. FOCUS FINDINGS

### F-01 · The routed fix: resynth/generation prompt fails to enforce criterion-4 labels + criterion-5 slots — LOCATED
**Severity: breaks-doctrine (deterministic quarantine class; drives paid reresearch).**

Both halves live at the ONE shared synthesis site `synthesiseAndWriteBrief`
(`src/lib/agent/canonical-pipeline.ts:569-688`), which serves the fresh path (`generateBrief`), the
resynth path (`generateBriefFromStored` :780-807), and refresh-primary (:817-868) — so the fix lands
once and covers all three.

**Criterion-5 (missing_required_slot):**
- The synthesis prompt NEVER reads `item_type_required_slots`. The only reader in the whole pipeline is
  `groundBriefImpl` (`canonical-pipeline.ts:1053`, enumerated into the LEDGER-extraction prompt at :1110)
  — i.e. slots are enforced only AFTER the brief is written.
- The static SYSTEM_PROMPT covers slots for the REG FAMILY ONLY (`system-prompt.ts:481-490`: effective_date,
  primary_deadline, jurisdictional_scope, penalty_summary).
- Live DB (verified by read-only SELECT): `item_type_required_slots` = 12 item types × 4 slots = 48.
  The 7 NON-reg types have slot keys the generation prompt never names anywhere:
  market_signal/initiative → signal_event, driving_parties, conversion_trigger, action_now;
  technology/innovation/tool → deployment_reality, supplier_access, operational_fit, procurement_window;
  regional_data → cost_baseline, feasibility_choice, pending_change, region_jurisdiction;
  research_finding → finding, methodology_limits, decision_relevance, does_not_resolve.
- The `formatDirective` (:594-596) pins section HEADINGS, not slots, and says "omit-with-note any you
  cannot honestly ground" — licensing omission of the very section a required slot lives in.
- Consequence chain: non-reg generation → slot content absent from prose → grounding's slot-forcing
  (`slot-forcing.mjs`) can only rescue when a floor-pool span exists → `missing_required_slot` is in
  `DETERMINISTIC_GROUND_FAILURES` (`src/workflows/generate-brief.ts:352-355`) → workflow skips the cheap
  re-ground and goes straight to `reresearchStep` (fresh Browserless + web_search + Sonnet) or erase. On
  the stored-resynth path this is guaranteed waste: the same pool re-synthesised with the same slot-blind
  prompt re-fails identically.
- **Candidate next-action:** in `synthesiseAndWriteBrief`, read the item's `item_type_required_slots`
  rows and append a per-item "REQUIRED SLOTS — cover EACH with a cited FACT or an explicit GAP statement"
  block to the user prompt (mirror of the grounding prompt's list at :1110). One write-site; rides with a
  SKILL.md edit per the doctrine-with-mechanism rule.

**Criterion-4 (analysis labels) — a 4-vs-3 label vocabulary fracture:**
- `system-prompt.ts:432-441` authorizes FOUR closed-set label tokens, including `*Per the workspace's reading:*`.
- The grounding LEDGER prompt also authorizes it (`canonical-pipeline.ts:1109` — "EXPLICITLY labels with …
  'Per the workspace's reading:'").
- But the kept-filter recognizes only THREE (`canonical-pipeline.ts:1180` `ANALYSIS_LABELS = ["analytical
  inference", "industry interpretation", "operational implication"]`), so an ANALYSIS claim in a section
  labeled only with the 4th token is silently DROPPED (coverage loss, no signal).
- The 4c relabel module also carries only three and states they "MUST match the validator's c_label_re
  (migration 143)" (`relabel-unlabeled.mjs:21-25`) — i.e. the DB validator recognizes 3; the system prompt
  authorizes a 4th label the validator rejects → `analysis_missing_label_syntax`/`unlabeled_assertion`
  on briefs that followed the prompt.
- The synthesis user prompt's own VALIDATION DISCIPLINE block lists only 3 (`canonical-pipeline.ts:620`),
  contradicting its system prompt two layers up.
- **Candidate next-action:** pick ONE vocabulary (either add "Per the workspace's reading:" to migration-143's
  c_label_re + `ANALYSIS_LABELS` (both homes) + relabel-unlabeled, or delete it from system-prompt.ts:434 and
  :1109). Cross-check with CODE-5b (mig 143/145 regex is the runtime authority).

### F-02 · Scrape-hold gate has transport-shaped holes
**Severity: breaks-doctrine.** The RD-11 claim is "every fetch through the single primitive is gated by
the hold" — true only for the Browserless RENDER transport. `assertFetchAllowed` lives solely in
`canonical-fetch.mjs` (browserlessFetch). Verified zero occurrences in:
- `canonical-pipeline.ts` — `directFetchClean` (:83) and `apiFetchForHost` (:105) do raw `fetch()`;
  `buildLiveTransports` (:165-183) injects them un-gated, so with `SCRAPE_HOLD=1` the pipeline still
  fetches any direct-eligible/API host (EUR-Lex, federalregister, legislation.gov.uk — the most common ones).
- `rss-fetch.ts` and `api-fetch.ts` (drain-first-fetch route's rss/api access methods) — un-gated.
- `span-check.ts` `spanCheckFetch` — un-gated (currently unwired, see F-13).
The hold's Browserless-unit-budget motive is preserved (free transports burn no units), but "hold LIVE,
zero fetches" is not mechanically true. **Next-action:** call `assertFetchAllowed(url)` at the top of
`directFetchClean`, `apiFetchForHost`, `rssFetch`, `apiFetch` (or inside `escalateToFetchResult`), and
extend fitness F16's coverage claim accordingly.

### F-03 · Live fetch cache is built but NOT wired (every fetch pays)
**Severity: dead-weight (built-unwired feature) with a cost consequence.** `fetch-hold.mjs` ships the
canonical-URL cache + per-host TTL + telemetry (`transportFetch`, `cacheGet/Put`, `HOST_TTL_MS`,
`makeFetchTelemetry`) and `escalateFetch` has a `cacheGet` seam (`transport-escalation.mjs:200-206`),
but `buildLiveTransports` (`canonical-pipeline.ts:165-183`) never injects `cacheGet` and nothing in
src/ calls `transportFetch` (only its own test + fitness F16 references the symbol). A re-ground /
retry / refresh-primary of the same URL re-fetches every time — despite eur-lex being assigned a 30-day
TTL. **Next-action:** either wire a store into `buildLiveTransports` (a module-scoped Map is process-
scoped, fine for the batch runners) or record the cache half as design-only.

### F-04 · Retired-but-present modules (dispatch question answered)
- `src/lib/agent/source-pool.ts` (178 lines): declared retired in `fsi-app/.claude/CLAUDE.md`; ZERO
  importers repo-wide (src + scripts, verified). Still on disk. It also carries the moat-adjacent
  `tierOf = effective_tier ?? base_tier` pattern (:99) — inert today, a re-wire hazard.
  **dead-weight; candidate: delete file.**
- `src/lib/sources/browserless.ts` (64 lines): declared retired in the SAME CLAUDE.md line, but it is
  NOT retired — it is the live typed wrapper used by `verification.ts`, `recommend-source-tier.ts`,
  and 5 API routes (bulk-import, fetch-now, spot-check, check-sources, drain-first-fetch).
  **cosmetic (doc drift); candidate: fix the CLAUDE.md "(Retired: …)" list, keep the file.**

### F-05 · Spend chokepoint: un-migrated direct-Anthropic call sites + route-path posture
**Severity: breaks-doctrine (acknowledged legacy, but two sites write NO ledger row).**
Direct Anthropic calls outside `spend-client.ts` (the F15 shrinking allowlist):
- `sources/discovery.ts:376` — Sonnet + web_search via raw fetch; no ticket, no ceiling, and NO
  agent_runs write anywhere in the module (unledgered spend, ~$0.05-0.17/call).
- `sources/recommend-source-tier.ts:~121` — Haiku via raw fetch; no ticket, no ledger write.
- `llm/haiku-classify.ts` (Anthropic SDK) and `llm/first-fetch-classify.ts` (raw fetch) — sanctioned
  Rule-016 classes, and first-fetch at least RETURNS cost for the caller to persist; haikuVerifyCandidate
  does not.
Route-path posture (documented, verify intent): `/api/agent/run` runs on the permissive `LEGACY_TICKET`
(`spend-client.ts:37-42` — no src caller of `setSpendTicket`) and `seedSpend` is never called in src,
so the per-process ceiling starts at $0 on every serverless invocation; the ONLY live budget gate on
the route path is the workflow preflight daily cap (`workflows/generate-brief.ts:101-140`, fail-closed —
good). **Next-action:** migrate discovery + recommend-tier onto `spendStream`/`spendSearch` with standing
tickets (both already have named classes in `STANDING_TICKET_CLASSES`), which also fixes their missing
ledger rows.

### F-06 · W2.F auto-approve writes `tier`, not `base_tier` — resolver sees NULL
**Severity: breaks-doctrine candidate — needs DB cross-check (X-agent / DB-2).**
`verification.ts:635-663` (H-tier auto-approve) inserts `{ tier, tier_at_creation, … }` with no
`base_tier`; the moat resolver reads `base_tier` ONLY (`institution.ts:66-69 tierOfSource`). Unless a
migration syncs `tier → base_tier`, an auto-approved source is tier-NULL to grounding/floor/audits
(the exact sub-floor-masking shape host-authority.ts exists to prevent). The sibling insert site
`registerCitedSources` (`source-growth.ts:104-110`) writes `base_tier` — the two insert sites disagree
on the tier column. Also hardcoded stand-ins on the same insert: `domains: [1]`,
`intelligence_types: ["GUIDE"]`, `update_frequency: "weekly"` (annotated "refined later by spot-check").
**Next-action:** confirm against live schema (does `sources.tier` still exist / trigger-sync?); if not
synced, add `base_tier: numericTier` to the H insert.

---

## B. OTHER FINDINGS

### F-07 · eraseStep leaves harvested `item_timelines` rows behind (fabricated-residue)
**Severity: breaks-doctrine.** `sectionBrief` harvests §14 into `item_timelines`
(`canonical-pipeline.ts:909-929`); the research-or-erase `eraseStep`
(`workflows/generate-brief.ts:292-306`) nulls `full_brief`, deletes sections and claims — but NOT
`item_timelines`. An erased ("ungroundable/fabricated") reg brief's timeline milestones persist as
customer-facing structured data with no backing brief. **Next-action:** add
`item_timelines.delete().eq("item_id", itemId)` to eraseStep.

### F-08 · eraseStep clobbers recommended_actions on ALL of the item's open flags
`workflows/generate-brief.ts:303` — the erase note UPDATE hits every `integrity_flags` row with
`subject_ref=itemId AND status=open`, overwriting recommended_actions written by cited-host-gate /
error-body-gate / null-tier flags (their re-fetch/register action lists are lost). **breaks-doctrine
(destroys operator queue payloads); next-action:** scope the update to the erase-related flag or insert
a new flag instead.

### F-09 · Dedup/idempotency reads in the mint chokepoint fail OPEN on error
`intake/mint-item.ts:88-96` — both idempotency probes (`bySrc`, `byLegacy`) and the dedup corpus read
(:110-113) use `const { data } = await …` with the error DROPPED (the CLAUDE.md error-swallow smell).
A transient read error → probes return null-ish → the SINGLE INSERT runs → duplicate mint on DB hiccup.
Same shape in `linkItems` (`entities/link-items.ts:26-33`, non-gating so lower risk) and
`canonical-pipeline.ts:682` (related-items FK check) and :971 (`priorClaims` thinning snapshot — a
dropped error there means priorClaimCount=0, silently DISABLING the thinning guard for that run and
making restore impossible). **Next-action:** destructure + fail-closed in mint-item (return
`ok:false` on probe error); at minimum warn-log in the other three.

### F-10 · Criterion-2/side: theme can never persist from the pipeline (two disjoint vocabularies)
Parser validates `theme` against the 7 topic-tag values (`parse-output.ts:50-51,417-431`); the LIVE DB
CHECK vocabulary is a different 7 (`metadata-vocab.ts:60-66` — emissions_accounting, fuels_saf, …) with
ZERO overlap. `toDbTheme()` therefore nulls EVERY agent-emitted theme (banked to theme_candidate).
Documented Emergence-Capture interim — but it means /research "theme routing column-first" never
receives pipeline data by construction. **breaks-customer (research theme routing inert) / accepted
interim; next-action:** cross-check with CODE-4 how /research renders theme; the Emergence-Capture
follow-on owns the cure.

### F-11 · Dead exports / dead modules (beyond F-04)
- `agent/section-validator.ts` (209 lines, `auditSections`) — zero importers anywhere. **dead-weight; delete or move to scripts.**
- `briefing/systemPrompt.ts` (40, `buildBriefingSystemPrompt`) — zero importers ("ready for Phase 3"). **dead-weight.**
- `agent/extract-research-sections.ts` (53) — superseded by `formats/research.ts` (which adds
  headingAlts + number-first recovery); sole importer is `scripts/restore-jolt.mjs`. Two research
  section lists = drift risk. **dead-weight; retire in favor of researchSpec.extract.**
- `entities/source-role.mjs` `congruentType` — superseded by `congruence()`; only its own test calls it. **dead-weight (function).**
- `sources/reconcile.ts` `openSourceConflict` — zero callers; so `source_conflicts` remains writer-less
  in practice (manifest §B: 0 rows) despite this module's header claiming to close that gap
  (`recordItemChange`/`recordSourceChangeTrigger` ARE wired via `/api/worker/reconcile`). **dead-weight (function) + header overclaim.**
- `sources/fetch-quality.ts` `checkFetchQuality` — zero src callers; scripts carry their OWN copy
  (`scripts/lib/fetch-quality.mjs`) = duplication. Only `checkBriefContent` is live
  (canonical-pipeline.ts:627). **dead-weight (function).**
- `verification.ts:212` `VERIFICATION_HAIKU_SYSTEM_PROMPT` — exported but imported nowhere; the live
  prompt is the near-identical duplicate inside `llm/haiku-classify.ts:41` (used internally by
  `haikuVerifyCandidate`; also un-imported as an export). Two homes already show punctuation drift
  (em-dashes vs commas). CLAUDE.md says the spot-check route uses "VERIFICATION_HAIKU_SYSTEM_PROMPT" —
  it actually reaches it via haikuVerifyCandidate. **dead-weight/two-home; delete verification.ts's copy.**
- `haiku-classify.ts` retains `ClassifyInput/ClassifyOutput/ClassifyResult` types + cost helpers for a
  function (`haikuClassify`) removed 2026-05-11 (per its own header). **cosmetic.**
- `fetch-now-decision.mjs` `decideFetchOutcome`, `check-sources-decision.mjs` `decideSourceAssessment` —
  wired via their admin/worker routes (verified fetch-now + check-sources import). LIVE, not dead.
- Workflow `spanCheckClaim` + `agent/span-check.ts` — reserved-by-decision (rows 22+45), documented,
  not in the orchestration. Not dead-weight per doc; flag as unwired-by-design.
- 4c module (`relabel-unlabeled.mjs`) — wired only via scripts (`run-4c-relabel.mjs`), per its own
  ruling ("executed separately"). By design.

### F-12 · Duplicate `getCoverageGaps` export + identical unstable_cache keyParts
Two same-named exports with different shapes: `lib/data.ts` `getCoverageGaps → CoverageGap[]`
(dashboard widget, keyParts `["coverage-gaps-v1"]`, args `(orgId, sectorsKey)`) and
`lib/coverage-gaps.ts` `getCoverageGaps → RegionCoverage[]` (map card, keyParts `["coverage-gaps-v1"]`,
zero args). Distinct arg lists likely keep the Next cache buckets apart, but the identical keyParts +
identical export name is a collision/confusion hazard. **cosmetic; next-action:** rename one keyParts
(e.g. "region-coverage-v1").

### F-13 · Known-defect annotations left in place (tracked, not fixed)
- `source-growth.ts:~100` — `ilike('%host%')` SUBSTRING dup-check (false-duplicate risk, self-noted
  "defect, not fixed here"); same pattern in `verification.ts:410-414 checkDuplicate`. **dead-weight/debt.**
- `seek-more.mjs` exhaustion record persists via the "interim FLAG PATTERN … superseded by migration
  147" — whether 147 landed is CODE-5b's to confirm; `recordSourceFetchStatus`
  (canonical-pipeline.ts:541-554) still swallows errors "BEHIND migration 147" by design.
- `floor-attribution.mjs:4` cites "canonical-pipeline.ts … line ~808" — stale line ref. **cosmetic.**
- `parse-output.ts:9` header says "7 scalar keys" — stale (14 required + optionals). **cosmetic.**
- `extract-regulation-sections.ts:56-85` heading variants + comments carry the U+00A7 glyph, against
  the standing avoid-section-symbol feedback (chat/code/UI labels). **cosmetic.**

### F-14 · surfaceNullTierHosts read-modify-write is non-atomic
`canonical-pipeline.ts:258-286` — read the open host flag, merge, update/insert. Safe under the
documented sequential stored-path runner; concurrent route-path grounding of two items on the same
unregistered host can race into duplicate flags or a lost merge. **cosmetic (best-effort path).**

### F-15 · timeline-harvest is_completed can be premature for non-day precisions
`timeline-harvest.mjs buildTimelineRows` — `is_completed = milestone_date < today` where
milestone_date for quarter/half/year/range/qualified precisions is the PERIOD START (sort anchor).
"Q3 2026 — consultation closes" flips completed on 2026-07-02 though the quarter is live. The original
token stays in the label (honest display), but the boolean is consumed downstream as state. **cosmetic→
breaks-customer-lite; next-action:** for non-day precision, complete at period END, or expose precision.**

### F-16 · useAdminAttention client gate uses workspace role, not platform-admin
`hooks/useAdminAttention.ts:214-216` gates polling on `userRole === owner|admin` (WORKSPACE layer),
the exact conflation OBS-17 removed server-side (`auth/admin.ts`). The API route enforces the real
gate (401/403 handled as ZERO), so this only causes needless fetches by workspace admins who are not
platform admins. **cosmetic.**

### F-17 · Error-path posture — overall GOOD, with the noted exceptions
The pipeline slice is now broadly error-destructured with fail-closed choices at the load-bearing spots
(resolver page-read aborts grounding :1121; preflight spend-ledger read fail-closed; Layer C block read
fail-closed; write-site metadata error surfaced :674). Best-effort swallows are consistently annotated
with a warn floor. Remaining silent drops are enumerated in F-09. `vertical-fit-gate.ts` fails OPEN on
DB error (deliberate + logged). `d3/hooks.mjs` guards fail-open-on-own-error by design (documented).

### F-18 · generation-config: PRIMARY_MAX_CHARS (600K) > SYNTH_PRIMARY_HARD_CEILING (=560K default)
A 560-600K primary is fetched in full and then guaranteed to hit the ceiling WALL in
`buildSourceBlocks` (excluded whole + flagged, item quarantined with named reason). Consistent with
no-silent-truncation, but the band is fetch-then-discard by construction. **cosmetic/doc.**

---

## C. Wiring map (condensed — who imports what)

- **canonical-pipeline.ts** ← workflows/generate-brief.ts (all steps) ← /api/agent/run;
  scripts (batch1-runner, lane4-reground-stored, funded-pass, _diag) import
  generateBriefRefreshPrimary / buildLiveTransports / webSearchCandidatesForQuery / logStoredPathRun
  (script-only exports, LIVE for the batch lanes, not the route path).
- **Transport stack:** canonical-fetch.mjs (hold-gated render) ← browserless.ts (typed +SEC UA) ←
  verification/recommend-tier/5 routes; escalateFetch (transport-escalation) ← transport-runtime ←
  fetchWithTransport; seek-more ← batch1 runner + canonical-pipeline (seekMore stub only in live path).
- **Floor mechanics:** source-blocks + floor-attribution + officialness + slot-forcing + thinning-guard +
  null-tier-flag — all consumed solely by groundBriefImpl; deterministic-lever consumed by spend-guard
  (necessity gate) + tests.
- **Spend:** spend-client ← canonical-pipeline (all model calls on the pipeline); spend-guard/program-total
  pure cores ← spend-client + batch runners; per-call agent_runs telemetry inside recordSpendCall with the
  unlogged-call refusal invariant (verified in code + tests).
- **Intake:** mint-item ← staged-updates route + drain-first-fetch; entity-resolve/source-role/entity-gate ←
  mint-item + first-fetch-classify + linkStep; first-fetch-classify ← drain-first-fetch.
- **Verification/discovery:** verification ← discovery ← /api/admin/sources/discover; reachability +
  verification-decision/check-sources-decision/fetch-now-decision ← their routes (all live).
- **Misc lib:** data.ts ← all pages; surface-of ← data + dashboard/surface-coverage + drift guard;
  scoring/lineage/verification(root)/format/acronyms/export/* ← components (legacy Resource display layer);
  skill-loader ← /api/ask; rooms ← community surfaces; iso/tiers/tier1 ← discovery, coverage, chips;
  operations-matrix ← /operations detail; mint-domain-guard/tier-labels drift tests ← CI.

---

## D. Manifest check-off

**Manifest check-off: 159/159 files read (list reconciled against `_manifest_files.tsv` slice; lines
reconciled: 22,540).** Slice derivation: kind=code under `fsi-app/src/lib/**` + `fsi-app/src/workflows/**`,
minus CODE-3's `src/lib/api/`, `src/lib/supabase*`, `src/lib/trust.ts`, minus `src/lib/trust.selftest.mjs`
(58 lines — rides with CODE-2's trust.ts; this is the exact 160→159 / 22,598→22,540 reconciliation).

Per-directory: agent 56/56 · sources 43/43 · llm 8/8 · workflows 1/1 · entities 6/6 · d3 3/3 ·
credibility 2/2 · dashboard 3/3 · export 4/4 · auth 2/2 · briefing 1/1 · community 1/1 · hooks 1/1 ·
intake 2/2 · jurisdictions 2/2 · notifications 2/2 · root lib files 22/22.

**Tool-call count: 61** (55 Bash/Read file reads + reconciliation, 3 wiring/import-graph greps,
1 ToolSearch, 1 read-only execute_sql, 1 register Write).

## E. Deviation log
1. `trust.selftest.mjs` excluded from this slice (assigned to CODE-2 with trust.ts) to reconcile the
   manifest's exact 159/22,540 — declared above.
2. `tier1-priority-jurisdictions.ts` (277) and the static ISO name tables in `jurisdictions/iso.ts` /
   `constants.ts`: policy comments and structure read line-level; the literal `{iso, name}` data rows
   were scanned as data, not individually reasoned (config-as-code lists).
3. One read-only SELECT against live Supabase (`item_type_required_slots` GROUP BY item_type) to
   substantiate F-01's criterion-5 claim. No other DB access; zero writes; zero fetches; no scripts run.
4. Two large files were read via paginated Read after the tool's 25K-token cap (canonical-pipeline.ts,
   verification.ts) — full coverage, no lines skipped.
