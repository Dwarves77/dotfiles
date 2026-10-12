# P1-09 flywheel-a: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-09, DISPOSITION lane, read-only. Tree: origin/master `a2f9f3f11` (the P1-03 squash; the branch was cut at `904680db0` and fast-forwarded when P1-03 merged, so the invariant and INDEX lines below extend P1-03's). Written by the cloud session on 2026-10-12 (clock from `date -u`: branch created 01:16 UTC, evidence complete 01:26 UTC, register written after). Every file in SCOPE was read whole: the 41 files with `cat -n` through the Bash tool in seven batches whose persisted output was then read whole with the Read tool (the harness directed Bash for file reads in this session; the coverage table names each file's batch). Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`.

Prior registers: F1-harness-and-flywheel (301 lines) and B1-scripts-runtimes (528 lines) were read whole as the brief asked, in pages under the Read tool's cap (F1 in five, B1 in twelve). A3, A4, A4a to A4d and the other registers were read as the extraction of every line naming an in-scope path (181 lines, 116 KB, saved in the lane scratchpad as register-rows-flywheel-a.md). The backlog's 44 rows (43 ids) naming an in-scope path were extracted the same way and their STATUS cells are written (section 8, last table).

**Two facts about this tree that every row below depends on** [CONFIRMED: `git show --stat f906b2102`, `ls`, `grep -rn` over `.github/workflows` 2026-10-12]: CLEAN-3 (f906b2102, 2026-10-11) deleted every test beside this scope (38 files: 9 under scripts/connections, 26 under src/lib/connections, 3 under src/lib/tags) and 28 workflow files, leaving `ci.yml` and `live-smoke.yml`. So on this tree no scope file has a test, no workflow calls `scripts/connections/*`, and the test counts and workflow lines F1 and B1 record (for example analyze-corpus 4 tests, corpus-turn.yml:364) describe the tree of 2026-10-11 before the cut. They are carried here as that tree's facts, never as this tree's. The scripts' live callers on this tree are `scripts/turns/run-population-flywheel.mjs` (969, 1028: discover-for-items and analyze-corpus as child processes), `scripts/maintenance/tag-proposals.mjs` and `tag-ratification.mjs` (propose-tags, apply-tags), and the mint path (`src/lib/intake/flywheel-steps.mjs` 34, `mint-enrichment.ts` 42: runConnectionDiscovery).

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (the responsibility is kept, the code is rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost), MOVED (ported by another lane, named). Code lines are non-blank non-comment lines by awk (`//` lines, `/* */` blocks and leading-`*` lines stripped). Raw lines are `wc -l`.

**The operator's rules for this module, applied throughout:** the flywheel is two mechanisms, connection discovery (this lane: live, pure computation, no model) and decision propagation (P1-10). Everything in the new tree is FREE: section 8 names every model call site, and there are none in this scope [CONFIRMED: `grep -rn -i` for anthropic, openai, claude-, messages.create, fetch( and http over the 41 files finds only the five `authedFetch` calls of src/lib/tags to the app's own `/api/workspace/tags` routes]. Tags and themes are derived, never customer-entered (section 2 records the one tension). No page-local engine: the connection layer is one module every surface reads (operator: "the flywheel is the integration"). Community never feeds other pages: nothing in this scope reads a Community table [CONFIRMED: table-literal scan, section 2].

## 1. Header and coverage

Module: flywheel-a. Connection discovery and the derived-tag and vocabulary layer of fsi-app: how items connect to items (shared source, scenario, compliance object, jurisdiction and topic today; entities and obligations when P1-10 and P1-16 land), how connections become intersections and themes, how themes become brief inputs, how tags and vocabulary terms are derived and adopted by rule, and the flag namespaces through which the system records what it could not derive. Plus three helpers the scope names: `src/lib/tags` (customer workspace tags, section 2 says where it goes), `src/lib/domains.ts` and `src/lib/surface-of.mjs` (the item-to-surface routing rule).

Coverage (41 files, 6,996 raw lines, 4,403 code lines; `wc -l` and the awk count run 2026-10-12):

| path (under fsi-app/) | raw | code | batch |
|---|---|---|---|
| scripts/connections/apply-tags.mjs | 575 | 320 | B1 |
| src/lib/connections/derive-tags.mjs | 555 | 247 | B1 |
| scripts/connections/propose-tags.mjs | 420 | 259 | B2 |
| scripts/connections/analyze-corpus.mjs | 385 | 270 | B2 |
| src/lib/connections/term-recurrence.mjs | 354 | 275 | B2 |
| src/lib/connections/signal-confidence.mjs | 287 | 161 | B3 |
| src/lib/connections/write-edges.mjs | 276 | 146 | B3 |
| src/lib/connections/connection-view-model.mjs | 235 | 146 | B3 |
| src/lib/connections/brief-candidates.mjs | 206 | 111 | B3 |
| scripts/connections/ratify-flag-to-census.mjs | 206 | 123 | B4 |
| scripts/connections/generate-theme-brief.mjs | 202 | 152 | B4 |
| src/lib/connections/cluster.mjs | 187 | 147 | B4 |
| scripts/connections/term-recurrence.mjs | 186 | 145 | B4 |
| src/lib/connections/intersections.mjs | 171 | 124 | B4 |
| scripts/connections/discover-for-items.mjs | 170 | 119 | B5 |
| src/lib/connections/tag-aliases.mjs | 164 | 87 | B5 |
| src/lib/connections/discover.mjs | 152 | 74 | B5 |
| src/lib/connections/theme-delta.mjs | 149 | 111 | B5 |
| src/lib/connections/term-needs.mjs | 149 | 115 | B5 |
| scripts/connections/raise-term-needs.mjs | 147 | 119 | B5 |
| src/lib/tags/server.ts | 130 | 91 | B6 |
| src/lib/connections/tag-input.mjs | 129 | 79 | B6 |
| src/lib/connections/anticipate.mjs | 129 | 80 | B6 |
| src/lib/connections/gaps.mjs | 124 | 80 | B6 |
| src/lib/tags/client.ts | 122 | 73 | B6 |
| src/lib/domains.ts | 121 | 83 | B6 |
| src/lib/connections/signal-candidates.mjs | 116 | 78 | B6 |
| src/lib/connections/pair-view.mjs | 113 | 86 | B6 |
| src/lib/tags/useWorkspaceTagsFacet.ts | 103 | 66 | B7 |
| src/lib/connections/tag-labels.mjs | 102 | 86 | B7 |
| src/lib/connections/flag-namespaces.mjs | 96 | 28 | B7 |
| src/lib/tags/attribution.ts | 89 | 63 | B7 |
| src/lib/surface-of.mjs | 77 | 40 | B7 |
| src/lib/connections/brief-staleness.mjs | 70 | 37 | B7 |
| src/lib/connections/resource-lookup.ts | 68 | 53 | B7 |
| src/lib/connections/run-discovery.mjs | 52 | 34 | B7 |
| src/lib/connections/theme-stats.mjs | 48 | 27 | B7 |
| src/lib/connections/forward-event-format.mjs | 43 | 22 | B7 |
| src/lib/connections/coverage-reflection.mjs | 43 | 21 | B7 |
| src/lib/connections/decision-note.mjs | 37 | 18 | B7 |
| src/lib/tags/types.ts | 8 | 7 | B7 |

Not in scope and not read whole, named because the module depends on them: `scripts/lib/db.mjs` (the guarded write layer every script here uses), `src/lib/corrections/item-corrections.mjs` (tombstones write-edges reads), `scripts/turns/theme-briefs/data.mjs` and `scripts/turns/apply-theme-briefs.mjs` (the theme-brief bundle and the one theme_briefs writer), `scripts/turns/run-population-flywheel.mjs` (the mandatory pass), `src/lib/trust.ts` (the adoption threshold), `src/lib/agent/parse-output.ts` and `system-prompt.ts` (the vocabularies derive-tags parses as text).

## 2. Module verdict

**REFACTOR AND PORT.** 4,403 code lines today; about 2,810 estimated for flywheel-a in the new tree plus about 390 that leave the module (the 300 lines of `src/lib/tags` to the workspace module, `forward-event-format.mjs` to obligations, `resolveItemUuid` to one item-identity home, `ensureCensusRow` to intake). The rest is TRASH: dead exports (section 4), the four dead domain sets, two hand-rolled Supabase clients, two copies of the signature loader, the operator-ratification CLI, the empty title-entity signal branch, and the source-text parsing at import in derive-tags.

LOC arithmetic [CONFIRMED for today's counts, estimates are read-derived and marked so]: 4,403 today. Port 2,810 (section 8 new-files table). Moved 390. Trashed about 1,200 (the difference, which is the duplicated loaders, CLI boilerplate the maintenance `runCli` already provides, dead exports, and the keyword tables that become vocabulary rows).

Responsibilities kept, one home each:

1. **Per-item discovery at mint and update** (rule 17): `runConnectionDiscovery(sb, itemId, signature)` reads the corpus signatures, scores, writes `related` edges with basis and score (run-discovery.mjs 22-45; discover.mjs 141-151; write-edges.mjs 99). Called from the mint path (flywheel-steps.mjs 34, mint-enrichment.ts 42).
2. **Whole-corpus pass**: intersections, label-propagation clustering into themes, theme delta against the prior run, gaps and anticipated targets as flags, signal candidates (analyze-corpus.mjs 102-305).
3. **Edge writing with origin ownership**: one row per ordered pair, both directions, `provenance_discovery` never overwrites another origin or a MANUAL row, admin tombstones respected, intersection entries appended without changing relationship, origin or score (write-edges.mjs 19-24, 104-120, 157-162, 178-188; ADR-018, ADR-022, migration 356).
4. **Theme lifecycle**: `connection_themes` replaced wholesale per run inside one `connection_theme_runs` row carrying `theme_delta` (analyze-corpus.mjs 214, 239-242, 362; theme-delta.mjs 43; migrations 253, 276), brief staleness by member hash (brief-staleness.mjs 9-21; migration 351), the free theme-brief seam (generate-theme-brief.mjs 53-101: parse, validate against live members, `generated_by: "session-executor"`).
5. **Derived tags by rule**: keyword derivation over the held vocabulary with evidence in the item's own text, per-field caps, high adopts, medium adopts when vocabulary and evidence re-confirm (derive-tags.mjs 500-551; apply-tags.mjs 29, 108-185, 401; ADR-025).
6. **Vocabulary growth by rule**: unheld terms counted across five detectors, adopted at the trust.ts threshold and two sources, then turned into term-need flags (lib term-recurrence.mjs 4-8, 71-83, 191-315; scripts/term-recurrence.mjs 153; term-needs.mjs 80-116; raise-term-needs.mjs 61-65; migration 355).
7. **Flag namespaces**: one `created_by` grammar for gap, anticipate, signal, defect, tag, question, holdings-need and term-need rows, with `buildSubjectRef` and `isInNamespace` (flag-namespaces.mjs 1-94).
8. **Read models for the surfaces**: connection rows with surface-routed hrefs, supersession rows, intersection view, pair collapse and bands, brief candidates, resource lookup (connection-view-model.mjs, pair-view.mjs, brief-candidates.mjs, resource-lookup.ts).
9. **Routing rule**: `surfaceOf(item_type, domain)` and its SQL mirror, the domain integers (surface-of.mjs 1-68; domains.ts 1-121).

Dependencies [CONFIRMED: import scan]: `scripts/lib/db.mjs` (readAll, guarded writers, fetchRowsIn), `scripts/maintenance/lib/cli.mjs` (runCli), `src/lib/corrections/item-corrections.mjs`, `src/lib/trust.ts` (CITATION_FREQUENCY_PROMOTION_THRESHOLD via jiti, scripts/term-recurrence.mjs 150-153), `scripts/turns/theme-briefs/*`, `scripts/turns/apply-theme-briefs.mjs`, `src/lib/agent/parse-output.ts` and `system-prompt.ts` (read as text, derive-tags.mjs 102-103), `@supabase/supabase-js` directly in two scripts (analyze-corpus.mjs 5, 40; discover-for-items.mjs 93-94).

Tables [CONFIRMED: `.from(` plus db.mjs helper literal scan over the 41 files]: reads `intelligence_items` (signatures, tag columns, titles), `item_cross_references`, `connection_themes`, `connection_theme_runs`, `integrity_flags`, `vocabulary_terms`, `vocabulary_mentions`, `workspace_settings` (analyze-corpus profile), `sources`, `intelligence_item_sections`, `section_claim_provenance`, `agent_run_searches` (propose-tags tag input), `census_worklist`, `item_workspace_tags`, `profiles` (tags/server). Writes `item_cross_references` (write-edges only), `connection_themes` and `connection_theme_runs` (analyze-corpus only), `integrity_flags` (analyze-corpus, propose-tags, apply-tags, term-recurrence, raise-term-needs, ratify), `intelligence_items` tag columns (apply-tags merge patch), `vocabulary_terms` and `vocabulary_mentions` (term-recurrence), `census_worklist` (ratify-flag-to-census). No rpc. Derivation edges, entities, propagation_events, derived_values: not touched by this scope (P1-10). Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the two raw clients), `DISCIPLINE_SNAP_DIR` (snapshot mirroring).

**The one tension, for the coordinator (CLAUDE.md rule 20 posture: not silently decided here).** The brief says tags and themes are derived, never customer-entered. `src/lib/tags` (five files, 300 code lines) is customer-entered tagging: org-scoped `workspace_tags` and `item_workspace_tags` (migration 313, RLS `user_belongs_to_org`, lines 46-75), created and applied by members through `/api/workspace/tags` from TagPopover, DetailTagRow and the five ledgers' facet. It is not the flywheel's tag layer and writes nothing the connection graph reads [CONFIRMED: no scope file outside src/lib/tags names either table]. Two readings: (a) the rule retires customer workspace tags, or (b) the rule is about the derived fields (`operational_scenario_tags`, `compliance_object_tags`, `topic_tags`, `theme`) and workspace tags are a workspace filing feature outside it, as ruling R6 built them. This register takes (b) as the working assumption, verdicts the five files KEEP AS-IS and MOVED to the workspace module (P1-02), and records the question. If the ruling is (a), the five files become TRASH and the feature row in section 8 records what is lost.

## 3. Bloat, biggest first

| # | what | lines today | why it is bloat | disposition |
|---|---|---|---|---|
| 1 | derive-tags.mjs CURATED_SYNONYMS and SUPPRESS_OWN_NAME tables (261-371, 206-215) plus the import-time parsing of two other modules' source text (63-114: `readFileSync` of parse-output.ts and system-prompt.ts, a prose heading match at 76 that throws if the prompt wording changes) and the self-check loop (372-395) | about 330 raw | the vocabulary lives in the brief contract module (P1-03 `core/brief/vocab.ts`) and, for adopted terms, in `vocabulary_terms`; keyword synonyms are vocabulary rows, not code | REFACTOR: the deriver reads vocabulary and synonyms from the one vocabulary module; the tables become a synonyms column or seed file, the source-text parsing goes |
| 2 | apply-tags.mjs (575 raw) carrying three jobs: adoption rules (29-185), the merge patch (197), per-item discovery planning with its own signature loader (250, 497-502), and a CLI with the `IS_MAIN` and raw client boilerplate `runCli` already provides (444-502) | 575 raw | the discovery half duplicates run-discovery.mjs; the CLI half duplicates cli.mjs; the two-step open-flag-then-ratify queue exists for a human gate the rulings removed (ADR-025, ADR-044) | REFACTOR: adoption rules to `core/tags/adopt.ts`; discovery via the one `runConnectionDiscovery`; the flag is the record of the decision, written resolved |
| 3 | signal-candidates.mjs plus signal-confidence.mjs (403 raw) for one live rule: two items whose titles share a regulation identifier and have no edge get an edge at weight 0.85 (signal-confidence.mjs 16-36, 115-132); the title-entity branch cannot fire (TITLE_ENTITY_VOCABULARY is `new Set([])`, line 8, and its only writer was a deleted test) | 403 raw | with the entity spine (P1-10) a shared regulation identifier is a shared entity, which is a discovery basis, not a side channel; the stale-flag grouping and resolution notes (172-269) exist only to drain the side channel's flags | REFACTOR: shared-entity basis in discover; INV-034's resolution rule kept as "no open signal flag survives a pass"; the title-entity branch TRASH |
| 4 | analyze-corpus.mjs (385 raw) as a top-level script with no main guard, its own `createClient` (40), and the whole-corpus read into memory followed by six passes | 385 raw | runs only as a child of run-population-flywheel.mjs (1028) on this tree; the raw client bypasses the guarded layer for the edge write path (B-2198) | REFACTOR: one `corpusPass(deps)` function with a guarded client, callable from the flywheel step and from a CLI shell |
| 5 | propose-tags.mjs (420 raw): its own argv parser, target selection, tag-input assembly over sections and captures, flag planning, and a CLI | 420 raw | parseArgs and selectTargets are copies of discover-for-items.mjs's (23, 54); the flag planning is the generic reflect pattern coverage-reflection.mjs also has | REFACTOR into the tag pass (section 8) |
| 6 | term-recurrence lib (354 raw) and script (186 raw), raise-term-needs (147 raw), term-needs (149 raw) | 836 raw | four files for one loop (count, adopt, need); the script's `buildDeps` loads trust.ts through jiti to read one integer (150-153) | REFACTOR: `core/vocabulary/terms.ts` plus one `termPass` step; the threshold imported from the trust module directly |
| 7 | connection-view-model.mjs (235 raw) with three surface tables (SURFACE_PATH 26, SURFACE_LABELS 152, SURFACE_ORDER 160) beside surface-of.mjs, two href builders (67, 112-120) and `MODERATE` and `/regulations/` hard-codes (111-120) | 235 raw | one routing module should own surface path, label and order | REFACTOR: `core/routing/surface.ts` owns the four surfaces' path, label and order; the view model imports them |
| 8 | ratify-flag-to-census.mjs (206 raw): an operator writes `ratify:census` into a flag's resolution note, the script promotes it to a census row | 206 raw | a human gate (ADR-044: no gate); the census writer `ensureCensusRow` (139) is the only part another runtime uses (apply-need-urls.mjs) | TRASH the ratification CLI; `ensureCensusRow` MOVED to the census writer of intake |
| 9 | generate-theme-brief.mjs (202 raw): a CLI that prints one theme bundle or validates and writes one brief, duplicating `runCli` and calling `applyThemeBriefs` and `writeThemeBriefRow` from scripts/turns | 202 raw | the theme-briefs apply (scripts/turns/apply-theme-briefs.mjs) is the one writer; this CLI is a second entry to it | REFACTOR: the member-hash validator (82-101) joins the theme-briefs schema; the CLI shell goes |
| 10 | pair-view.mjs, brief-candidates.mjs, intersections.mjs each carry a `pairKey` or canonical-key helper and a basis-entry key (pair-view.mjs 20; brief-candidates.mjs 75-128; intersections.mjs `basisEntryKey`) | about 80 raw | one pair-identity helper | REFACTOR into `core/flywheel/edges.ts` |

## 4. Dead code

Method [CONFIRMED]: `exports-consumers.mjs` (lane scratchpad) over the 41 files lists every exported name with zero production occurrences outside its own file across fsi-app/src, fsi-app/scripts and fsi-app/supabase (tests excluded, and on this tree there are none). 68 such exports. The ones in live modules, with the grep that confirms each:

| export | file:line | consumers (prod) | disposition |
|---|---|---|---|
| REGULATIONS_DOMAINS, MARKET_INTEL_DOMAINS, OPERATIONS_DOMAINS, RESEARCH_DOMAINS | domains.ts 26-41 | 0 (`grep -rlw` over src, scripts, supabase) | TRASH (B-DEAD-3, B-0676, B-1558) |
| DEFAULT_SURFACE, scopeFilterForSurface | surface-of.mjs 4, 68 | 0 | TRASH |
| scoreConnection | discover.mjs | 0 outside discoverConnections | not exported in the port |
| TITLE_ENTITY_VOCABULARY (empty set), classifySignalGroup, classifySignalCandidates, buildAutoAdoptEdges, buildSignalResolutionNote, AUTO_ADOPT_WEIGHT, SIGNAL_CONFIDENCE | signal-confidence.mjs 4-16, 30-132, 211 | 0 outside the file (planSignalAdoption composes them) | TRASH the title-entity branch; the rest folds into discovery |
| buildExistingPairSet, extractRegulationIdentifiers, extractCapitalizedPhrases | signal-candidates.mjs 42, 116 | 0 outside the file | fold |
| INTERSECTION_SIGNAL, tierOf | intersections.mjs 4, 14 | 0 outside the file | not exported |
| BANDS | pair-view.mjs 1 | 0 outside bandOf | not exported |
| parseDecisionNote | decision-note.mjs 28 | 0 (B-0237) | TRASH |
| labelForConnection, buildSupersessionRows, couplingText | connection-view-model.mjs 20, 101, 167 | 0 outside buildAllConnectionRows and buildIntersectionView | not exported |
| selectCandidates | brief-candidates.mjs 75 | 0 outside selectBriefCandidates | not exported |
| runTheme, parseBriefPayload, validateAgainstLiveMembers, isStructuredPayload, runWrite | generate-theme-brief.mjs 24-129 | 0 outside the file | the validator moves to the theme-briefs schema; the rest TRASH |
| isEmptySignature, buildNoDerivableFlagRow | propose-tags.mjs 63, 116 | 0 outside the file | fold into the tag pass |
| RATIFY_TOKEN, parseRatificationNote, evaluateRatification, buildCensusRow, ratifyFlag | ratify-flag-to-census.mjs 13-114 | 0 (only `ensureCensusRow` has a caller: apply-need-urls.mjs) | TRASH |
| buildAutoAdoptionNote, TAG_EVIDENCE_TEXT_FIELDS, itemOwnText, evidencePresentInItemText, decideTagProposals, planDiscoveryForItem, buildReDeriveInput | apply-tags.mjs 103-250 | 0 outside the file | fold; planDiscoveryForItem TRASH (run-discovery is the one path) |
| extractQuotedArray, extractScenarioGlossary, ownNameForms, SUPPRESS_OWN_NAME, adoptedKeywordEntries | derive-tags.mjs 63-206 | 0 outside the file | TRASH with the source-text parsing |
| DEFAULT_PREFIX_CHARS, defaultVocabTerms, boundedSourceWindow | tag-input.mjs 4, 16, 40 | 0 outside assembleTagInput | not exported |
| labelForTag | tag-labels.mjs 93 | 0 | TRASH |
| ALL_NAMESPACES | flag-namespaces.mjs 50 | 0 | keep as the one list a check iterates (section 8 proof) |
| TERM_NEED_RULE, needTextFor, holdingQualifies, termNeedRow | term-needs.mjs 6-45 | 0 outside planTermNeeds | not exported |
| decideAdoption, mentionsFromBriefTerms | lib term-recurrence.mjs 81, 167 | 0 outside buildTermPlan and recordBriefTerms | not exported |
| convergenceBand, CONVERGENCE_BANDS (as an import) | theme-stats.mjs 36, 43 | ThemesView.tsx 69 hand-copies the bands instead of importing them (B-0671) | one exported constant, imported by both |
| planIntersectionEdges, projectEdgeRows | write-edges.mjs 178 | 0 outside writeIntersectionEdges | not exported |
| formatAppliedDate | tags/attribution.ts 70 | 0 outside attributionText | moved with the module |
| TagsSupabaseClient, tagNameKey | tags/server.ts 38, 85 | 0 | TRASH |

Dead modules: none. Every file has at least one production importer [CONFIRMED: importer scan, 57 out-of-scope importer files listed in the lane scratchpad].

Dead branches [CONFIRMED read]: signal-confidence.mjs 50-53 (`TITLE_ENTITY_VOCABULARY.has(only)` over an empty set); cluster.mjs rounds past convergence are bounded by MAX_ROUNDS 20 (3, 71), live.

## 5. Duplicates and over-abstraction

| # | duplicate | where | one home in the port |
|---|---|---|---|
| 1 | the connection signature column string and the paged corpus loader | run-discovery.mjs 5, 24-35; apply-tags.mjs 497-502; discover-for-items.mjs 99-106 (F45-1, B-2199, B-2200) | `core/flywheel/signature.ts` |
| 2 | `escapeRe` and `phraseRegex`, and the keyword scoring loop | derive-tags.mjs 450-463, 517-551; tag-aliases.mjs 79-84, 95-146 (B-2152) | `core/tags/derive.ts`, aliases as a second table over the same loop |
| 3 | `UUID_RE` and `resolveItemUuid` | resource-lookup.ts 5, 11; tags/server.ts 34, 58; plus the overrides and personal-state routes (exports scan: 11 prod importers across the two homes; B-0287, B-0863) | one item-identity helper outside this module (id owed by the coordinator; the detail loader `src/lib/detail/load-detail.ts` 11 is its first consumer) |
| 4 | surface path, label and order tables | connection-view-model.mjs 26, 152, 160 beside surface-of.mjs SURFACES 1 (B-0236) | `core/routing/surface.ts` |
| 5 | `surfaceOf` called with item_type only in three places and with (item_type, domain) in intersections | run-discovery.mjs 40; discover-for-items.mjs 134; analyze-corpus.mjs 146 vs intersections.mjs 46-47 (B-1011) | one call shape: always (item_type, domain); the signature carries domain |
| 6 | two raw `createClient` constructions | analyze-corpus.mjs 40; discover-for-items.mjs 94 (B-2198) | the guarded client from db.mjs, injected |
| 7 | pair key helpers | write-edges.mjs (pairKey), pair-view.mjs 20, brief-candidates.mjs, signal-candidates.mjs 42 | `core/flywheel/edges.ts` |
| 8 | `memberDisplayName` | tags/attribution.ts 48 vs src/lib/admin/member-display-name.ts (B-DUP-3) | the admin helper; moved with the tags module |
| 9 | `MONTHS` table | tags/attribution.ts 44 vs src/lib/format.ts (B-DUP-7) | format.ts |
| 10 | CONVERGENCE_BANDS | theme-stats.mjs 36 and a hand copy at components/sources/ThemesView.tsx 69 | one pure constants export both import (a pure module crosses the client-bundle boundary) |
| 11 | GENERIC_JURISDICTIONS and the jurisdiction-alias limitation text | gaps.mjs 1, 3-10 and forward-events/read-upcoming.mjs (B-2150, B-2151; read-upcoming is out of scope) | the entity spine's jurisdiction entities (P1-10) replace string equality in both |
| 12 | the relationship vocabulary | brief-candidates.mjs RELATIONSHIP_SPECIFICITY 17 and connection-view-model.mjs RELATIONSHIP_LABEL 7 restate the CHECK set of `item_cross_references.relationship` | one relationship table in `core/flywheel/edges.ts`, with the SQL CHECK generated from it (section 8 proof) |
| 13 | the tag label tables | tag-labels.mjs 3-80 restate values held in parse-output.ts and system-prompt.ts; "mrv" appears twice in ACRONYMS (66, 67) | the vocabulary module carries slug, label and acronym once |
| 14 | argv parsing and target selection | propose-tags.mjs 28-78 and discover-for-items.mjs 23-54 | `runCli` plus one `selectTargets` |
| 15 | the stale comments that contradict live rules | flag-namespaces.mjs 8-9 and signal-candidates.mjs 8, 108-109 say "never auto-applied, operator review" while apply-tags.mjs 29 and signal-confidence.mjs 16-53 auto-adopt by rule (B-1010, B-1012) | the port carries the rule, not the comment |

## 6. Non-essential artifacts

None in scope. `fsi-app/src/lib/connections/fixtures/` named by B-1982 does not exist on this tree [CONFIRMED: `ls`]. The snapshot mirroring to `DISCIPLINE_SNAP_DIR` (write-edges.mjs 94, apply-tags, analyze-corpus, discover-for-items) writes machine evidence to a gitignored directory and is kept as an opt-in of the guarded writer.

## 7. File register

| path (under fsi-app/) | lines (raw/code) | responsibility | verdict | clean est. | consumers (prod) | note |
|---|---|---|---|---|---|---|
| src/lib/connections/run-discovery.mjs | 52/34 | per-mint discovery entry: paged signature read, score, write `related` edges | KEEP AS-IS (merged with the signature loader) | 60 (with discover-for-items) | flywheel-steps.mjs 34, mint-enrichment.ts 42, migration 277 comment | surfaceOf called with item_type only (40); page size 1000 (24, 35) |
| src/lib/connections/discover.mjs | 152/74 | weighted basis scoring: shared_source 0.4, scenario 0.3 x idf, compliance_object 0.18, jurisdiction+topic 0.2; per-tag cap 3; role tags excluded; threshold 0.3, limit 12 (62-69, 104-107, 141-151) | REFACTOR AND PORT | 110 | run-discovery, apply-tags, discover-for-items, system-prompt.ts (text) | add shared-entity and shared-obligation bases when P1-10 and P1-16 land (ADR-019 weighting kept) |
| src/lib/connections/write-edges.mjs | 276/146 | the one `item_cross_references` writer: origin ownership, tombstones, intersection append, snapshot | REFACTOR AND PORT | 140 | analyze-corpus, apply-tags, discover-for-items | full-table `select("*")` on every call (73-85; B-0244, B-1983 [HYPOTHESIS: cost]); the port reads the candidate pairs only |
| src/lib/connections/intersections.mjs | 171/124 | cross-surface AND rule, points scenario 3 object 2 explicit 5 priority 2, tiers medium 8 strong 12 (5-6), strength to score, basis entry | KEEP AS-IS | 100 | analyze-corpus, write-edges, pair-view, brief-candidates, view-model | the only caller of surfaceOf with domain (46-47) |
| src/lib/connections/cluster.mjs | 187/147 | label propagation into themes, MAX_ROUNDS 20, theme id = smallest member | KEEP AS-IS | 120 | analyze-corpus 146 | |
| src/lib/connections/theme-delta.mjs | 149/111 | diff themes across runs at OVERLAP_THRESHOLD 0.5 (1, 43); lineage from delta | KEEP AS-IS | 100 | analyze-corpus 246, migration 276, theme-briefs data.mjs, supabase-server.ts 34 | |
| src/lib/connections/theme-stats.mjs | 48/27 | theme stats and convergence bands | KEEP AS-IS | 25 | admin themes route; ThemesView (hand copy) | comment at 29 cites 7/8/12 while intersections uses 8/12 (B-0671) |
| src/lib/connections/brief-staleness.mjs | 70/37 | member hash (md5 of sorted ids, 9-12), stale test, resolve brief for theme | KEEP AS-IS | 35 | generate-theme-brief, apply-theme-briefs, theme-briefs data, research page, admin themes route, brief-candidates | INV-191 |
| src/lib/connections/gaps.mjs | 124/80 | theme gaps against the org profile; Type B surface triple (94) | REFACTOR AND PORT | 70 | analyze-corpus 147, theme-briefs data | jurisdiction equality is exact string (3-10), fixed by entities |
| src/lib/connections/anticipate.mjs | 129/80 | anticipated targets from forward events and topics | KEEP AS-IS | 70 | analyze-corpus 168 | |
| src/lib/connections/coverage-reflection.mjs | 43/21 | born-resolved reflection flag rows and dedup plan | KEEP AS-IS (into flags) | 20 | analyze-corpus | |
| src/lib/connections/signal-candidates.mjs | 116/78 | title-token pairs with no edge | REFACTOR AND PORT (into discovery as a shared-entity basis) | 40 | analyze-corpus, signal-confidence | stale operator-review wording (8, 108-109) |
| src/lib/connections/signal-confidence.mjs | 287/161 | decisive-group auto adoption at weights 0.85 and 0.7 (16), flag resolution plans, pre-resolved rows (269-274) | REFACTOR AND PORT | 60 | analyze-corpus | empty TITLE_ENTITY_VOCABULARY (8); wall clock inside a pure module (274) |
| src/lib/connections/flag-namespaces.mjs | 96/28 | namespace constants, createdBy, buildSubjectRef, isInNamespace | KEEP AS-IS | 30 | 16 prod importers (classification, flywheel, intake defect, learning, needs-search, question-answers) | stale "never auto-applied" comment (8-9) |
| src/lib/connections/decision-note.mjs | 37/18 | decision note text builder and parser | REFACTOR (builder into flags; parser TRASH) | 10 | apply-classifications, apply-tags | parseDecisionNote has no caller |
| src/lib/connections/derive-tags.mjs | 555/247 | vocabularies extracted from two source files at import, keyword map, deriveTags with per-field caps and confidence | REFACTOR AND PORT | 180 | apply-tags, propose-tags, tag-ratification, parse-output.ts, term-recurrence script, tag-aliases, tag-input, canonical-sources pending route | reads parse-output.ts and system-prompt.ts as text (102-103), prose-heading parse (76) |
| src/lib/connections/tag-aliases.mjs | 164/87 | legal-text alias table and a second scoring loop | REFACTOR (merge into derive) | 50 | propose-tags 259-260, tag-input | escapeRe/phraseRegex copies (79-84); header reasons from a lane write set (7-12) |
| src/lib/connections/tag-input.mjs | 129/79 | bounded source window (8000 prefix, 300 context) for keyword evidence (4, 9) | KEEP AS-IS (into derive) | 40 | propose-tags | |
| src/lib/connections/tag-labels.mjs | 102/86 | labels for scenario and compliance-object slugs, acronyms | REFACTOR (into the vocabulary module) | 40 | theme-brief-text.mjs, brief-candidates, view-model | duplicate "mrv" (66, 67) |
| src/lib/connections/term-recurrence.mjs | 354/275 | term kinds, detectors, mention builders, buildTermPlan, applyTermPlan, recordBriefTerms | REFACTOR AND PORT | 220 | scripts term-recurrence, system-prompt.ts, parse-output.ts, adopted-terms.mjs, question-answers data, apply-record-briefs | ENTITY_RATIONALE_RE parses another module's prose rationale (93); JSON parse error swallowed (98) |
| src/lib/connections/term-needs.mjs | 149/115 | term-need rows for adopted terms with no qualifying holding; lineage needs; celexOf | KEEP AS-IS | 100 | raise-term-needs, needs-search data, run-source-sweep | |
| src/lib/connections/connection-view-model.mjs | 235/146 | connection rows, supersession rows, intersection view, surface tables | REFACTOR AND PORT | 120 | ItemConnectionsCard, supabase-server.ts, CrossPageSection, resource-lookup, corrections model, theme-brief.mjs | three surface tables; MODERATE and /regulations/ hard-codes (111-120) |
| src/lib/connections/pair-view.mjs | 113/86 | collapse both directions to pairs (ADR-018), bands strong 0.9 medium 0.5, assemble pairs | KEEP AS-IS (into edges) | 70 | MapPageView, brief-candidates, write-edges, admin intersections route | |
| src/lib/connections/brief-candidates.mjs | 206/111 | select up to 10 connected items for a brief author, theme context, candidate block text | KEEP AS-IS | 100 | canonical-pipeline.ts 68, run-intake routes (MAX_CANDIDATES) | relationship list hand-copied (17); label built by concatenation (27) |
| src/lib/connections/resource-lookup.ts | 68/53 | id to uuid, verified-only title and priority lookup | MOVED (identity helper) and KEEP (lookup) | 40 | detail pages (4), load-detail.ts, workspace routes (11 via the two homes) | fail-soft reads now `console.warn` the error (13-16, 50-51); B-0053's "dropped error" is REFUTED on this tree |
| src/lib/connections/forward-event-format.mjs | 43/22 | event date formatting by precision | MOVED to obligations (P1-16) [HYPOTHESIS on the id] | 20 | market page, UpcomingObligationsPanel, ObligationRegisterFilterBar, ListSurfaceRailCards, timeline-backfill-derive | |
| scripts/connections/analyze-corpus.mjs | 385/270 | the whole-corpus pass | REFACTOR AND PORT | 220 | run-population-flywheel.mjs 1028 (child process) | no main guard; raw client (40); wholesale theme replace (239-242) recorded in theme_delta (362) |
| scripts/connections/discover-for-items.mjs | 170/119 | discovery for a set of ids or since a date | REFACTOR (merge with run-discovery) | 30 | run-population-flywheel.mjs 969; propose-tags imports parseArgs and selectTargets | raw client (93-94), SIG copy (99) |
| scripts/connections/apply-tags.mjs | 575/320 | adoption rules, merge patch, autoAdoptTags, per-item discovery, CLI | REFACTOR AND PORT | 150 | tag-ratification.mjs, apply-classifications.mjs, propose-tags, run-population-flywheel | section 3 row 2 |
| scripts/connections/propose-tags.mjs | 420/259 | derive and flag proposals per item; no-derivable rows born resolved (101-131) | REFACTOR AND PORT | 120 | tag-proposals.mjs, run-population-flywheel (NO_DERIVABLE_SUBTYPE), classification flags.mjs, apply-tags (buildFlagRow), raise-term-needs (planReflect) | |
| scripts/connections/term-recurrence.mjs | 186/145 | the term pass step with its deps builder | REFACTOR AND PORT | 90 | raise-term-needs (STEP, buildDeps pattern) | jiti load of trust.ts for one integer (150-153) |
| scripts/connections/raise-term-needs.mjs | 147/119 | the term-need step | REFACTOR AND PORT | 90 | none outside the pass (STEP imported by the sibling) | |
| scripts/connections/ratify-flag-to-census.mjs | 206/123 | operator ratification to census row | TRASH except ensureCensusRow (MOVED) | 0 here | apply-need-urls.mjs (ensureCensusRow) | human gate |
| scripts/connections/generate-theme-brief.mjs | 202/152 | print a theme bundle; validate and write one brief | REFACTOR (validator to theme-briefs schema; CLI TRASH) | 60 | none (CLI) | `generated_by: "session-executor"` (101) is the free path |
| src/lib/tags/server.ts | 130/91 | author names, resolveItemUuid (throws on error, 69), name normalization, counts, applications | KEEP AS-IS, MOVED to P1-02 | 80 | /api/workspace/tags routes, overrides, personal-state, portfolio members | pending the ruling in section 2 |
| src/lib/tags/client.ts | 122/73 | authedFetch client with module cache and subscribers | KEEP AS-IS, MOVED to P1-02 | 70 | TagPopover, DetailTagRow, SavedSearchesSection | |
| src/lib/tags/useWorkspaceTagsFacet.ts | 103/66 | ledger facet hook | KEEP AS-IS, MOVED to P1-02 | 60 | the five ledgers, PortfolioAddSearch | |
| src/lib/tags/attribution.ts | 89/63 | applications grouping, attribution text | KEEP AS-IS, MOVED to P1-02 | 50 | tags route, DetailTagRow, TagPopover, community page, admin panels | memberDisplayName and MONTHS duplicates (44, 48) |
| src/lib/tags/types.ts | 8/7 | WorkspaceTag type | KEEP AS-IS, MOVED to P1-02 | 7 | 5 importers | |
| src/lib/domains.ts | 121/83 | domain integers, labels, domainForItemType, asDomain; four dead sets | REFACTOR AND PORT (into routing) | 60 | 12 exports with consumers across listings, admin scan, producers, classification | SC-5 SSOT (B-0819) |
| src/lib/surface-of.mjs | 77/40 | SURFACES, SURFACE_RULES, surfaceOf, renderSurfaceOfSql | REFACTOR AND PORT (into routing) | 40 | 20 prod importers of surfaceOf; migrations 148 and 269 render the SQL | DEFAULT_SURFACE and scopeFilterForSurface dead |

## 8. Build plan for this module

### Every model call site in the old code and what replaces it

None. [CONFIRMED: `grep -rn -i -E "anthropic|openai|claude-|messages\.create|fetch\(|https?://"` over the 41 files, 2026-10-12, finds only the five `authedFetch` calls of src/lib/tags/client.ts (52, 80, 93, 105, 115) and useWorkspaceTagsFacet.ts (45) to the app's own `/api/workspace/tags` routes.] The connection layer is already pure computation. The one place a model once sat beside it, theme-brief authoring, is already the free seam: a session authors the brief against a bundle and the code validates the member hash and writes through the one theme_briefs writer (generate-theme-brief.mjs 53-101, 139-153; scripts/turns/apply-theme-briefs.mjs). The port keeps that seam and removes the second entry point.

| old call site | purpose | replacement |
|---|---|---|
| none in scope | | |
| generate-theme-brief.mjs 24-51 `runTheme` prints a bundle for a session to author from; 82-101 validates the authored payload against live members and stamps `generated_by: "session-executor"` | theme synthesis by a session, not a model | KEEP as the theme-briefs schema's validator; the bundle export is the theme-briefs export step (scripts/turns/export-themes-for-briefs.mjs, out of scope) |

### New files

| new path | from old path(s) (lines a-b) | responsibility | est. LOC |
|---|---|---|---|
| src/core/flywheel/signature.ts | run-discovery.mjs 5-35; apply-tags.mjs 497-502; discover-for-items.mjs 99-106 | CONNECTION_SIGNATURE_COLUMNS (plus domain, entity ids, obligation keys), one paged `loadSignatures(sb, { ids, since })` | 40 |
| src/core/flywheel/discover.ts | discover.mjs 62-151; signal-candidates.mjs 91-116 (the regulation-identifier token as a shared-entity basis); signal-confidence.mjs 16-36 (its weight) | `discoverConnections(item, candidates, { freq, threshold 0.3, limit 12 })` over bases shared_source, shared_scenario (idf), shared_compliance_object, shared_jurisdiction_topic, shared_entity, shared_obligation; `computeTagFrequencies` | 110 |
| src/core/flywheel/intersections.ts | intersections.mjs 1-171 | the AND rule, points, tiers, strength to score, basis entries, isCrossSurface with (item_type, domain) | 100 |
| src/core/flywheel/cluster.ts | cluster.mjs 1-187 | label propagation, theme id = smallest member, per-theme stats | 120 |
| src/core/flywheel/themes.ts | theme-delta.mjs 1-149; theme-stats.mjs 7-46; brief-staleness.mjs 9-70 | `diffThemes`, `lineageFromThemeDelta`, `computeThemeStats`, CONVERGENCE_BANDS (one export), `computeMemberHash`, `isBriefStale`, `resolveBriefForTheme` | 150 |
| src/core/flywheel/gaps.ts | gaps.mjs 1-124 (string equality replaced by jurisdiction entities); anticipate.mjs 1-129; coverage-reflection.mjs 1-43 | `detectGaps`, `computeAnticipatedTargets`, reflection rows born resolved | 150 |
| src/core/flywheel/edges.ts | write-edges.mjs 73-276 (readExistingEdges scoped to candidate pairs); pair-view.mjs 1-113; brief-candidates.mjs 17 and connection-view-model.mjs 7 (one relationship table) | `writeDiscoveredEdges`, `writeIntersectionEdges`, `pairKey`, `collapsePairs`, `bandOf`, `assemblePairs`, RELATIONSHIPS with label and specificity | 200 |
| src/core/flywheel/flags.ts | flag-namespaces.mjs 1-94; decision-note.mjs 13-27; propose-tags.mjs 101-187 (flag row, no-derivable row, planReflect); signal-confidence.mjs 239-274 (resolution plan, pre-resolved row with an injected clock) | the namespace grammar, `buildSubjectRef`, `isInNamespace`, `planReflect` (open flags against fresh findings), born-resolved rows, decision notes | 90 |
| src/core/tags/vocabulary.ts | tag-labels.mjs 3-98; tag-aliases.mjs 13-78 (ALIAS_MAP as synonym rows); derive-tags.mjs 261-371 (CURATED_SYNONYMS and SUPPRESS_OWN_NAME as synonym rows and suppressions) | one vocabulary read: closed field values from the brief contract module (P1-03 `core/brief/vocab.ts`), adopted terms from `vocabulary_terms`, labels, acronyms, synonyms, suppressions | 120 |
| src/core/tags/derive.ts | derive-tags.mjs 13-32, 437-551 (FIELD_CAPS, confidence, keyword map, deriveTags); tag-aliases.mjs 79-165 (the alias loop folded into the same scorer); tag-input.mjs 40-129 | `deriveTags(item, vocabulary)` with evidence in the item's own text, per-field caps, high and medium confidence; `assembleTagInput` | 230 |
| src/core/tags/adopt.ts | apply-tags.mjs 29-32, 66-100, 108-247, 401-443 | `decideTagProposal` (high adopts; medium adopts with vocabulary and evidence re-confirmed), `buildMergePatch` (merge-only, removed tags from item_corrections respected), `adoptTags(deps, item, proposals)` writing the tag columns and the decision flag resolved | 150 |
| src/core/vocabulary/terms.ts | lib term-recurrence.mjs 1-354; term-needs.mjs 1-149 | term kinds, detectors, mention builders, `buildTermPlan`, `applyTermPlan`, `recordBriefTerms`, `planTermNeeds`, `planLineageNeeds`, `celexOf`; the threshold imported from the trust module | 320 |
| src/features/flywheel/run-discovery.ts | run-discovery.mjs 22-52; discover-for-items.mjs 54-66, 133-163 | `runConnectionDiscovery(sb, itemId)` (the mint and update entry, rule 17) and `discoverForItems(sb, { ids, since })` | 90 |
| src/features/flywheel/corpus-pass.ts | analyze-corpus.mjs 20-385 | `corpusPass(deps, { dry })`: intersections, cluster, theme run row with delta, gaps and anticipated flags, shared-entity adoption, flag resolutions; guarded client only; records its outcome in the run artifact (rule 17) | 220 |
| src/features/flywheel/tag-pass.ts | propose-tags.mjs 187-420; apply-tags.mjs 444-575 (the CLI half, through runCli) | `tagPass(deps, { ids, since })`: derive, decide, adopt, flag; then `runConnectionDiscovery` for every touched item | 180 |
| src/features/flywheel/term-pass.ts | scripts/term-recurrence.mjs 20-186; raise-term-needs.mjs 8-147 | `termPass(deps)`: count, adopt, record, then raise and close term-need flags by rule | 180 |
| src/features/flywheel/theme-brief-seam.ts | generate-theme-brief.mjs 53-101 | `parseBriefPayload`, `validateAgainstLiveMembers` (member hash), the `session-executor` stamp; writes through scripts/turns/apply-theme-briefs (the one writer) | 60 |
| src/core/flywheel/view-model.ts | connection-view-model.mjs 20-235; brief-candidates.mjs 75-206 | `buildConnectionRows`, `buildSupersessionRows`, `buildAllConnectionRows`, `buildIntersectionView`, `selectBriefCandidates`, `formatCandidateBlock`; surface path, label and order imported from routing | 200 |
| src/core/routing/surface.ts | surface-of.mjs 1-67; domains.ts 1-24, 42-121; connection-view-model.mjs 26, 152, 160 | SURFACES, SURFACE_RULES, `surfaceOf(itemType, domain)`, `renderSurfaceOfSql`, SURFACE_PATH, SURFACE_LABELS, SURFACE_ORDER, the domain integers, DOMAIN_LABELS, `domainForItemType`, `asDomain` | 100 |

Total about 2,810. Moved out: src/lib/tags (300, P1-02 workspace), resolveItemUuid (one identity helper, about 20, id owed), forward-event-format.mjs (20, P1-16), ensureCensusRow (about 30, intake's census writer).

### Data model (columns actually used by flywheel-a; "unused" means no code in this scope reads or writes it)

| table | columns used | by | migration |
|---|---|---|---|
| item_cross_references | id, source_item_id, target_item_id, relationship, origin, basis, score (plus created_at on read) | write-edges (the one writer), pair-view, brief-candidates, view-model, analyze-corpus (read), supabase-server (read) | 146 (origin, related derive), 252 (basis, score, origin), 356 (tombstones trigger) |
| connection_themes | id, member_ids, surfaces, edge_count, convergence, label (as cluster output) | analyze-corpus (wholesale replace), theme-briefs data, admin themes route, ThemesView | 253 |
| connection_theme_runs | id, args, theme_delta, counts | analyze-corpus 214, 362; supabase-server lineage | 253, 276 |
| theme_briefs | theme_id, title, brief_md, member_hash, generated_by, generated_at (structured columns of 351) | generate-theme-brief (validator), brief-staleness (reader side), research page via theme-brief.mjs; the writer is scripts/turns/apply-theme-briefs.mjs | 266, 280, 351 |
| intelligence_items | id, legacy_id, item_type, domain, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, topic_tags, jurisdictions, jurisdiction, title, what_is_it, summary, full_brief, priority, provenance_status, theme (via trigger 357) | signature loaders, derive and adopt (tag columns are the only writes), resource-lookup | 200 (canonical_instrument_key), 357 (theme guard) |
| integrity_flags | id, created_by, subject_ref, description, recommended_actions, status, resolved_at, resolved_by, resolution_note, created_at | every pass; namespaces flywheel-gap:, flywheel-anticipate:, flywheel-signal:, flywheel-tag:, term-need:, flywheel-defect: | 035, 048, 050, 163 |
| vocabulary_terms, vocabulary_mentions | term_key, kind, label, adopted_at, counts; mention item_id, source_id, detector, text | term-recurrence (writer), raise-term-needs (reader), adopted-terms.mjs (reader), apply-record-briefs (recordBriefTerms) | 355, 357 |
| item_corrections | tombstones and removed tags | write-edges (read), adopt (read) | 356 |
| census_worklist | source_id, document_url, title, reason | ensureCensusRow (moved) | 221, 229, 308 |
| workspace_settings | the org profile (jurisdictions) | analyze-corpus gaps | (read only) |
| intelligence_item_sections, section_claim_provenance, agent_run_searches, sources | section text, claim spans, capture text, source tier | propose-tags tag input; term-needs holdingQualifies | (read only) |
| workspace_tags, item_workspace_tags, profiles | all of 313's columns; profiles full_name, display_name | src/lib/tags only (moved) | 313 |

Not touched by this scope: entities, entity_refs, propagation_events, derivation_edges, derived_values, inference_records (P1-10). The derivation edges a connection pass could author (an edge from a theme to its members, from a tag adoption to its evidence) are not authored today [CONFIRMED: no scope file names derivation_edges]; section 8 Rulings records this as the P1-10 interface.

### Interface to other modules

What the connection layer offers each surface and lane (every export is a pure function or a deps-injected step; no surface builds its own engine):

- **P1-03/04 intake**: `runConnectionDiscovery(sb, itemId)` after every mint and substantive update (rule 17; today flywheel-steps.mjs 34 and mint-enrichment.ts 42); `selectBriefCandidates(itemId, deps)` and `formatCandidateBlock` for the brief author's bundle (today canonical-pipeline.ts 68); `recordBriefTerms` for the brief's mentioned terms (today apply-record-briefs); the vocabulary module is shared with P1-03's brief contract (one home for closed field values); `ensureCensusRow` moves to intake's census writer.
- **P1-10 flywheel-b (propagation)**: this module consumes the entity spine as a discovery basis (`shared_entity` from entity_refs) and emits nothing to the outbox today. Interface owed: the corpus pass authors derivation edges for theme membership and tag adoption so a changed input invalidates the derived connection (spec 08 section 2.2); and a propagation event on an item's entity_refs should re-run `runConnectionDiscovery` for that item (today only mint and update do).
- **P1-16 obligations**: `shared_obligation` as a discovery basis (items that carry the same obligation key connect); `forward-event-format` moves there; `computeAnticipatedTargets` reads forward events (anticipate.mjs 72).
- **P1-19 to P1-24 surfaces**: `buildAllConnectionRows` and `buildIntersectionView` (detail connections strip and cross-page section, today ItemConnectionsCard and CrossPageSection), `assemblePairs` and `bandOf` (Map), `computeThemeStats` and CONVERGENCE_BANDS (themes view), `resolveBriefForTheme` and `lineageFromThemeDelta` (Research detail), `surfaceOf` and the surface tables (every ledger and detail href), `labelForScenario` and `labelForComplianceObject` (theme brief text). Community: reads nothing from this module and writes nothing into it [CONFIRMED: the community page imports only `memberDisplayName` from tags/attribution, which moves to the admin helper].
- **P1-08 harness**: every pass (corpusPass, tagPass, termPass, discoverForItems) is a deps-injected function with a `dry` flag that returns counts and writes its outcome into the run artifact; the run artifact and the kill switch are the harness's. On this tree no workflow calls them; the mandatory pass is run-population-flywheel.mjs (969, 1028) and the two maintenance wrappers.
- **Gap for the coordinator**: the brief's id list has no lane for the item-identity helper (`resolveItemUuid`, four homes) or for the theme-briefs apply (`scripts/turns/apply-theme-briefs.mjs`, the one theme_briefs writer this module's seam depends on). Both are named here so they are not lost.

### Invariants this code enforces

New lines appended to `docs/plans/rebuild/data-invariants.md` by this lane: INV-187 (edge ownership, both directions, tombstones), INV-188 (discovery materiality rule), INV-189 (intersection AND rule and append-only basis), INV-190 (wholesale theme replace inside a run row with delta), INV-191 (theme brief member hash), INV-192 (tags derived from the held vocabulary with evidence, never customer-entered on the derived fields), INV-193 (flag namespace, subject_ref dedup, born resolved), INV-194 (a mint or update runs discovery before it is done). Already present and cited rather than restated: INV-034 (signal flags resolved, decisive edges written), INV-041 (tag proposals decided by rule), INV-104 (derivations by rule, flags born resolved), INV-105 (term adoption threshold), INV-147 (theme vocabulary guard), INV-149 (workspace tags org-scoped).

### Rulings the code embodies (cite)

- ADR-018: both directed rows stored, the pair view collapses at the reader (write-edges.mjs 157; pair-view.mjs 20).
- ADR-019: inverse-frequency weighting of shared scenario tags; the per-tag cap keeps the three highest-weighted (discover.mjs 99-104).
- ADR-021 and ADR-022: identity is not grouping; specificity wins over origin ownership, so an intersection appends to an existing row's basis without changing its relationship, origin or score (write-edges.mjs 162).
- ADR-025: deterministic derivations auto-adopt, no human gate (apply-tags.mjs 29; signal-confidence.mjs 16).
- ADR-030 rider: admin is visibility, not a gate; flags with nothing to decide are born resolved (propose-tags.mjs 101-131; coverage-reflection.mjs).
- ADR-043: automate_vs_hire retired; nothing in scope references it [CONFIRMED: grep].
- ADR-044: the learning loop has no gate, which is why ratify-flag-to-census is TRASH.
- CLAUDE.md rule 16: build mode holds the cadence; the passes run only by explicit dispatch, and this register proposes no schedule.
- CLAUDE.md rule 17: nothing runs alone; `runConnectionDiscovery` inside the mint path, the corpus pass inside the population flywheel.
- Operator rulings restated in the brief: the flywheel is two mechanisms (discovery here, propagation in P1-10); tags and themes are derived; no page-local engines; Community never feeds other pages; everything FREE.
- Spec 08 Loop A (docs/specs/08-flywheel-design.md 25-32): discovery compounding is this module; Loop B is P1-10.

### Proof that the module works in the new tree

On this tree nothing proves it: CLEAN-3 removed all 38 tests beside the scope [CONFIRMED: `git show --stat f906b2102`]. The 2026-10-11 tree's counts, carried from F1-L-11 and B1 as that tree's facts: src/lib/connections 25 test files passing 336, write-edges 23, apply-tags 57, propose-tags 33, discover-for-items 13, analyze-corpus 4, generate-theme-brief 20, ratify 21, term-recurrence 9 plus 19, raise-term-needs 7, tag-proposals 15, tag-ratification 13. The new tree proves the module by:

1. Pure-function tests over fixtures for discover (each basis, the cap, the threshold), intersections (the AND rule and tiers), cluster (convergence and the smallest-member id), themes (delta and member hash), derive (every vocabulary tag has at least one keyword; evidence must be present), adopt (high adopts, medium needs vocabulary and evidence), terms (threshold and two sources), flags (dedup on subject_ref and created_by, born resolved).
2. An adversarial writer test (rule 15): a fake client holding a MANUAL row, a foreign-origin row and a tombstoned pair; `writeDiscoveredEdges` must skip all three and count them.
3. A drift check that the relationship table in edges.ts equals the CHECK constraint of item_cross_references (read from the migration file) and that SURFACE_RULES renders the SQL migrations 148 and 269 carry.
4. A fixture corpus run of `corpusPass` in dry mode asserting the counts and that a second run produces an empty theme delta.
5. The mint chokepoint test (P1-03) asserting `runConnectionDiscovery` is called once per mint.

### Port order

1. routing/surface.ts (every ledger and detail href depends on it; smallest blast radius).
2. flywheel/signature.ts, edges.ts, discover.ts, intersections.ts (the per-mint path), then features/run-discovery.ts wired into the mint chokepoint.
3. flags.ts, tags/vocabulary.ts, derive.ts, adopt.ts, features/tag-pass.ts.
4. cluster.ts, themes.ts, gaps.ts, features/corpus-pass.ts, theme-brief-seam.ts.
5. vocabulary/terms.ts, features/term-pass.ts.
6. view-model.ts and the surface consumers' imports switched; then delete the old 41 files and the two maintenance wrappers' imports repointed.

### Every feature the old code delivers (a feature with no row is a lost feature)

| feature | old location | new location |
|---|---|---|
| Per-mint and per-update connection discovery with weighted bases, idf, caps, threshold and limit | run-discovery.mjs, discover.mjs | features/flywheel/run-discovery.ts, core/flywheel/discover.ts |
| Discovery for a set of ids or since a date | discover-for-items.mjs | features/flywheel/run-discovery.ts (`discoverForItems`) |
| Edge writing with origin ownership, MANUAL respected, tombstones respected, foreign pairs skipped and counted, refresh snapshots | write-edges.mjs | core/flywheel/edges.ts |
| Cross-surface intersections with tiers, written as appended basis entries | intersections.mjs, write-edges.mjs | core/flywheel/intersections.ts, edges.ts |
| Themes by label propagation, wholesale per run, with delta and lineage | cluster.mjs, theme-delta.mjs, analyze-corpus.mjs | core/flywheel/cluster.ts, themes.ts, features/corpus-pass.ts |
| Theme stats and convergence bands | theme-stats.mjs | core/flywheel/themes.ts |
| Theme gaps against the org profile and anticipated targets from forward events, as flags | gaps.mjs, anticipate.mjs | core/flywheel/gaps.ts |
| Coverage reflection rows born resolved | coverage-reflection.mjs | core/flywheel/gaps.ts |
| Shared-regulation-identifier adoption at weight 0.85 and the resolution of stale signal flags | signal-candidates.mjs, signal-confidence.mjs | core/flywheel/discover.ts (shared_entity basis), flags.ts |
| Title-entity adoption at weight 0.7 | signal-confidence.mjs 45-53 | NOT PORTED: the vocabulary is empty and has no writer; a shared named entity becomes a shared_entity basis once P1-10 extracts entities |
| Theme brief staleness by member hash and brief resolution for a theme | brief-staleness.mjs | core/flywheel/themes.ts |
| Free theme-brief seam: bundle, validate against live members, session-executor stamp | generate-theme-brief.mjs | features/flywheel/theme-brief-seam.ts plus the theme-briefs export and apply (scripts/turns) |
| Brief candidates for the author with theme context | brief-candidates.mjs | core/flywheel/view-model.ts |
| Connection rows, supersession rows, intersection view for detail surfaces | connection-view-model.mjs | core/flywheel/view-model.ts |
| Pair collapse, bands, assembled pairs for the Map and admin | pair-view.mjs | core/flywheel/edges.ts |
| Verified-only resource lookup | resource-lookup.ts | core/flywheel/view-model.ts (lookup); identity helper elsewhere |
| Tag derivation from closed vocabularies and adopted terms with keyword evidence and caps | derive-tags.mjs, tag-aliases.mjs, tag-input.mjs | core/tags/vocabulary.ts, derive.ts |
| Tag labels and acronyms | tag-labels.mjs | core/tags/vocabulary.ts |
| Tag proposals as flags, no-derivable rows born resolved | propose-tags.mjs | features/flywheel/tag-pass.ts, core/flywheel/flags.ts |
| Rule-based adoption: high adopts, medium with vocabulary and evidence; merge-only patch; removed tags respected | apply-tags.mjs | core/tags/adopt.ts |
| Two-step queue (open proposal flag, later ratification step) | propose-tags.mjs, apply-tags.mjs, maintenance/tag-ratification.mjs | NOT PORTED as a queue: the decision is made in the same pass and the flag records it resolved (ADR-025, ADR-044); the maintenance wrappers call the pass |
| Term recurrence across five detectors, adoption at threshold and two sources, mention recording | lib and scripts term-recurrence.mjs | core/vocabulary/terms.ts, features/term-pass.ts |
| Term-need and lineage-need flags, closed by rule when no longer reproduced | term-needs.mjs, raise-term-needs.mjs | core/vocabulary/terms.ts, features/term-pass.ts |
| Flag namespace grammar | flag-namespaces.mjs | core/flywheel/flags.ts |
| Decision note text | decision-note.mjs | core/flywheel/flags.ts |
| Operator ratification of a flag into a census row | ratify-flag-to-census.mjs | NOT PORTED (human gate); the census writer `ensureCensusRow` moves to intake |
| Event date formatting by precision | forward-event-format.mjs | P1-16 obligations |
| Item-to-surface routing, SQL mirror, domain integers and labels | surface-of.mjs, domains.ts | core/routing/surface.ts |
| Four domain sets, DEFAULT_SURFACE, scopeFilterForSurface | domains.ts 26-41, surface-of.mjs 4, 68 | NOT PORTED (no caller) |
| Customer workspace tags: create, apply, remove, list, facet, attribution | src/lib/tags | P1-02 workspace, pending the ruling in section 2 |

### Defects the new code must not repeat (from the backlog rows in scope, section 9 of the backlog file carries the STATUS cells)

- Reading another module's source as text at import and parsing a prose heading (derive-tags.mjs 76, 102-103; B-2147, B-2148): the vocabulary is data, read from one module.
- Whole-table reads on every per-item write (write-edges.mjs 73-85; run-discovery.mjs 24-35; B-0244, B-1983): read the candidate pairs and the signatures needed.
- Raw Supabase clients beside the guarded layer (analyze-corpus.mjs 40; discover-for-items.mjs 94; B-2198): inject the guarded client.
- A top-level script with no main guard (analyze-corpus.mjs; B-2198): every pass is a function; the CLI shell is runCli.
- Three copies of the signature loader (B-2199, B-2200, F45-1): one.
- Comments that contradict the live rule (flag-namespaces.mjs 8-9; signal-candidates.mjs 8, 108-109; theme-stats.mjs 29; B-1010, B-1012, B-0671): the port carries no posture comments.
- Hard-coded surface tables beside the routing module and hard-coded `MODERATE` and `/regulations/` (connection-view-model.mjs 26, 111-120, 152, 160; B-0236): one routing module.
- A dead branch kept alive by an empty constant (signal-confidence.mjs 8; B-0241, B-0242).
- Wall-clock reads inside pure modules (signal-confidence.mjs 274; B-0240): the clock is injected.
- Exact-string jurisdiction matching (gaps.mjs 3-10; B-0238, B-2150, B-2151): jurisdiction entities.
- Duplicate acronym entries and label tables beside the vocabulary (tag-labels.mjs 66-67; B-2153).
- A relationship vocabulary hand-copied from a CHECK constraint (brief-candidates.mjs 17; B-2146): generated, drift-checked.
- Four homes of one identity helper (B-0287, B-0863, B-1548): one.
- Swallowed parse errors (lib term-recurrence.mjs 98; B-0243): a malformed rationale is counted and reported.
- Tests that mutate a production constant to reach a branch (the deleted signal-confidence test wrote TITLE_ENTITY_VOCABULARY; B-0241): fixtures inject vocabulary.
