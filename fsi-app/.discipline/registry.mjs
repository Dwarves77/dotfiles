// THE ONE ENFORCEMENT REGISTRY (lane REG-1, 2026-10-11, whole-build consolidation plan phase C).
//
// One row per governed PROPERTY. Before this lane the same property could be held by a fitness function, an
// invariant, a verify script and a golden at once (305 checks across four homes, 2026-10-11 audit). A row names
// the property (GOVERNS), what kind of check it is (KIND), the ONE enforcer, where that enforcer runs (RUNS-IN)
// and the EVIDENCE that it bites. A row with neither evidence kind fails registry.test.mjs: that is CLAUDE.md
// rule 15 (a guard is proven by attack, not by presence) made mechanical.
//
//   id        stable key. A fitness row uses its F-id; any other row uses its lead invariant id or a short label.
//   kind      fitness | invariant | audit | golden
//   governs   one line, what the row holds true
//   enforcer  fitness:F<n> | rule:<nnn> | consistency:C<n> | selftest:<repo path> | audit:<repo path>
//   runsIn    static | schema | app | post-merge smoke | hook
//   evidence  { failureRun: '<GitHub run id of a retained failing run>' } and/or
//             { attackTest: { file: '<repo path>', name: '<text that appears in the attack test>' } }
//   carries   invariant ids (the skill statements in governance/invariants.d/) this row discharges. The loader in
//             governance/invariants.mjs derives each carried invariant's enforcedBy from the rows that carry it, so
//             enforcement has exactly one home (this file); invariants.d holds only the doctrine anchors.
//
// Summary of the physical layout: fitness functions live in fitness/functions/ (the enforcer module of a fitness
// row), rules in rules/, consistency checks in consistency/checks/, audits and goldens in scripts/verify/.
// `node fsi-app/.discipline/fitness/runner.mjs` runs every fitness row and prints printRegistrySummary() last.
//
// RETIRED records every id that left the registry: an id is never silently removed. Where a row absorbed it the
// survivor is named; where the property has no remaining evidence-bearing check the reason says so.

const FN = 'fsi-app/.discipline/fitness/functions/';
const RL = 'fsi-app/.discipline/rules/';
const CC = 'fsi-app/.discipline/consistency/checks/';
const SV = 'fsi-app/scripts/verify/';
const GV = 'fsi-app/.discipline/governance/';
const RN = 'fsi-app/.discipline/rendering/';
const LB = 'fsi-app/src/lib/';
const t = (file, name) => ({ file, name });
const fit = (n, slug) => `${FN}F${n}-${slug}.test.mjs`;

export const KINDS = ['fitness', 'invariant', 'audit', 'golden'];
export const RUNS_IN = ['static', 'schema', 'app', 'post-merge smoke', 'hook'];

export const REGISTRY_ROWS = [
  // ---------------------------------------------------------------- fitness (one row per function)
  { id: 'F2', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F2', governs: 'Every admin API route calls the shared admin guard in code, or is on the worker-secret allowlist and calls the worker guard.', evidence: { attackTest: t(fit(2, 'admin-routes-isPlatformAdmin'), 'F2: FAIL when admin route lacks isPlatformAdmin') }, carries: ['SF-3-admin-gating'] },
  { id: 'F6', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F6', governs: 'Migration files match NNN_name.sql with no duplicate numbers.', evidence: { failureRun: '31292312522', attackTest: t(fit(6, 'migrations-numeric-ordering'), 'F6: FAIL on malformed filename (no number prefix)') }, carries: ['SF-2-migration-ordering'] },
  { id: 'F8', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F8', governs: 'Client code never writes tier-shaped fields into request bodies; the server owns the base_tier and effective_tier dual write.', evidence: { attackTest: t(fit(8, 'client-server-tier-boundary'), 'F8: FAIL on direct body.tier assignment in component') }, carries: ['SF-4-client-server-tier-boundary'] },
  { id: 'F9', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F9', governs: 'The project typechecks cleanly (tsc --noEmit).', evidence: { failureRun: '34276036475', attackTest: t(fit(9, 'build-compiles'), 'F9 ATTACK: a tsc that runs and reports type errors is still a violation') }, carries: ['SF-5-build-compiles'] },
  { id: 'F10', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F10', governs: 'Source-credibility math holds: syndication collapses to one corroboration, tier weights strictly decrease, the resolver is base_tier only.', evidence: { failureRun: '27075337677', attackTest: t('fsi-app/.discipline/fitness/lib/selftest-spawn.test.mjs', 'ATTACK: dependency present and the selftest exits non-zero still yields a violation') }, carries: ['SC-1-syndication-math', 'SC-3-effective-tier-formula', 'SC-9-moat-base-tier-only'] },
  { id: 'F13', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F13', governs: 'Every intelligence_items insert goes through the mint chokepoint.', evidence: { attackTest: t(fit(13, 'single-mint-chokepoint'), 'direct single-line INSERT into intelligence_items (simulated bypass)') }, carries: ['EP-9-single-mint-chokepoint'] },
  { id: 'F14', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F14', governs: 'No table is written and never read, no schema table or function is unreferenced, and the keep-decisions are audited.', evidence: { failureRun: '28915536873', attackTest: t(fit(14, 'producer-consumer-orphan'), 'F14: RED on a simulated write-orphan, with a named writer file:line') }, carries: ['RD-9-producer-consumer-orphan', 'RD-71'] },
  { id: 'F15', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F15', governs: 'No Anthropic API call exists outside the spend client and its sanctioned transport.', evidence: { attackTest: t(fit(15, 'spend-chokepoint'), 'RED: a direct Anthropic call in a non-allowlisted file is flagged with file:line') }, carries: ['RD-10-spend-chokepoint', 'SF-8-canonical-anthropic-path'] },
  { id: 'F16', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F16', governs: 'The single fetch primitive carries the scrape-hold gate and no file builds a raw content fetch around it.', evidence: { attackTest: t(fit(16, 'transport-hold-gate'), 'RED: the fetch primitive WITHOUT the hold gate is flagged') }, carries: ['RD-11-transport-hold-gate', 'RD-16-transport-hold-all-four'] },
  { id: 'F18', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F18', governs: 'URL identity normalization lives only in the sanctioned canonicalizeUrl.', evidence: { attackTest: t(fit(18, 'one-url-canonicalizer'), 'RED: the deleted _normUrl shape (bare scheme-strip + whole query drop) is flagged') }, carries: ['RD-13-one-url-canonicalizer'] },
  { id: 'F19', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F19', governs: 'A service-role client never falls back to the anon or publishable key.', evidence: { attackTest: t(fit(19, 'no-service-anon-downgrade'), 'RED: the coverage-gaps downgrade shape (SERVICE_ROLE || ANON across lines) is flagged') }, carries: ['RD-15-no-service-anon-downgrade'] },
  { id: 'F20', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F20', governs: 'The pause flags have one writer, the sanctioned admin route.', evidence: { attackTest: t(fit(20, 'pause-flag-one-writer'), 'RED: a second-writer property assignment (update.global_processing_paused = x) is flagged') }, carries: ['RD-23-pause-flag-one-writer'] },
  { id: 'F21', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F21', governs: 'Grounding acquisition has one entry; no other production file invokes the grounding entry functions.', evidence: { attackTest: t(fit(21, 'single-grounding-entry'), 'F21: RED on a direct generateBriefWorkflow reference outside the sanctioned set') }, carries: ['RD-24-single-grounding-entry'] },
  { id: 'F22', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F22', governs: 'A sources insert always classifies the source role at birth.', evidence: { attackTest: t(fit(22, 'source-role-at-birth'), 'F22 flags a sources INSERT in a file that never classifies the role') }, carries: ['SC-15-source-role-at-birth'] },
  { id: 'F23', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F23', governs: 'Governed-surface coverage gaps (ungoverned writes, model calls, routing, unrun proofs) hold to a one-way ratchet.', evidence: { failureRun: '37876428204', attackTest: t(fit(23, 'governed-surface-coverage'), 'F23 FAILS on a regression above the ceiling') }, carries: ['RD-52-governed-surface-coverage-ratchet'] },
  { id: 'F24', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F24', governs: 'Every database object in the catalog snapshot is created by a committed migration or carries a reasoned exemption.', evidence: { attackTest: t(fit(24, 'db-object-migration-home'), 'an object with no migration and no allowlist entry is RED') }, carries: ['RD-53-db-object-migration-home'] },
  { id: 'F25', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F25', governs: 'Every module has a production importer, an entry point, a CI dispatch root, or an expiring reasoned exemption.', evidence: { failureRun: '37780742772', attackTest: t(fit(25, 'module-liveness'), 'an unimported module with no allowlist entry is RED') }, carries: ['RD-54-module-liveness'] },
  { id: 'F27', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F27', governs: 'Every producer entry point has its whole seam set exercised by one composition proof.', evidence: { failureRun: '37789258137', attackTest: t(fit(27, 'producer-seam-proof'), 'a producer with an uncovered seam set and no proof at all is RED') }, carries: ['RD-9b-producer-composition-proof'] },
  { id: 'F28', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F28', governs: 'Harness-run artifacts validate against the convention schema and each family is current against its governing files.', evidence: { failureRun: '38059936918', attackTest: t(fit(28, 'harness-run-integrity'), 'RED: rows exist but none at the live hash, and the newest row is older than 30 days') }, carries: ['RD-55-harness-run-integrity'] },
  { id: 'F30', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F30', governs: 'Text-keyed reference sites the entity spine replaces hold to a one-way baseline.', evidence: { attackTest: t(fit(30, 'entity-spine'), 'compareToBaseline: ABOVE baseline (regression) fails') }, carries: ['EP-14-entity-spine-text-key-ratchet'] },
  { id: 'F31', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F31', governs: 'Nothing outside the propagation directory reads the raw derived_values table.', evidence: { attackTest: t(fit(31, 'derived-values-gate'), 'fitnessFunction.check(): an UNSANCTIONED file with a raw read is flagged, naming the fix') }, carries: ['RD-56-derived-values-gate'] },
  { id: 'F32', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F32', governs: 'The statutory-purity trigger stays defined and its JS mirror agrees with the SQL refusal logic.', evidence: { attackTest: t(fit(32, 'statutory-purity'), 'assertStatutoryPurity RED: an input naming a LIVE estimated_values row refuses') }, carries: ['RD-57-statutory-purity'] },
  { id: 'F33', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F33', governs: 'Every customer surface the specs name has a register entry with a route, a reachable data path and a rendering fixture.', evidence: { attackTest: t(fit(33, 'surface-acceptance'), 'a spec-named surface with no register entry is RED') }, carries: ['RD-58-surface-acceptance-register'] },
  { id: 'F34', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F34', governs: 'No source module calls a filesystem function at module scope.', evidence: { attackTest: t(fit(34, 'bundle-safe-module-evaluation'), 'RED: the 2026-09-02 incident shape (top-level JSON.parse(readFileSync(...))) is a module-scope read') }, carries: ['RD-59-bundle-safe-module-evaluation'] },
  { id: 'F35', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F35', governs: 'Every customer-facing row component is mounted by a registered UX smoke spec and carries the title marker.', evidence: { attackTest: t(fit(35, 'row-ux-coverage'), 'RED: a commented-out registry entry is not coverage; only active entries resolve to spec files') }, carries: ['RD-60-row-ux-measured-on-real-component'] },
  { id: 'F36', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F36', governs: 'A hydrated client component never formats a date without pinning its timezone.', evidence: { attackTest: t(fit(36, 'date-format-timezone-pin'), 'RED: the exact 2026-09-04 #418 shape (toLocaleDateString, no timeZone) is caught') }, carries: ['RD-61-date-format-timezone-pin'] },
  { id: 'F39', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F39', governs: 'No Supabase read asks for more than the 1000 row ceiling and no runtime id list is sent whole in an in() filter.', evidence: { failureRun: '37913500249', attackTest: t(fit(39, 'unbounded-in-filter'), 'RED: .in(col, runtimeVar) with a bare variable second argument is flagged with file:line') }, carries: ['RD-63-unbounded-supabase-read', 'RD-64-unbounded-in-filter'] },
  { id: 'F40', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F40', governs: 'A requireAuth-guarded route is called through the shared authed fetcher and no module hand-rolls a Bearer header.', evidence: { attackTest: t(fit(40, 'authed-api-fetch'), 'RED: the shipped defect verbatim') }, carries: ['RD-65-authed-api-fetch'] },
  { id: 'F41', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F41', governs: 'A cl-* class targeted inside an @media block is carried by an element or marked.', evidence: { attackTest: t(fit(41, 'dead-media-query-class'), 'RED: the exact defect that shipped') }, carries: ['RD-66-dead-media-query-class'] },
  { id: 'F43', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F43', governs: 'No component initialises a disclosure to open.', evidence: { attackTest: t(fit(43, 'default-open-disclosure'), "RED: the exact source found on 2026-09-08, IntelligenceBrief's table of contents") }, carries: ['RD-67-default-open-disclosure'] },
  { id: 'F45', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F45', governs: 'Duplicated normalized lines never exceed the merge-base measurement.', evidence: { failureRun: '38105710920', attackTest: t(fit(45, 'duplicate-code'), 'detectClones: a 12-line block present in two files is a clone; a distinct file is not') }, carries: ['RD-69'] },
  { id: 'F46', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F46', governs: 'An external host that code builds URLs for has one home module.', evidence: { attackTest: t(fit(46, 'external-host-home'), 'evaluate: a homed host named outside its home is a STRICT violation even when the ratchet would pass') }, carries: ['RD-70'] },
  { id: 'F48', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F48', governs: 'The local env file loads only through the guarded loader.', evidence: { failureRun: '37854427410', attackTest: t(fit(48, 'env-file-load-guarded'), '(a) RED: a bare top-level load is flagged with its line') }, carries: ['RD-72'] },
  { id: 'F49', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F49', governs: 'The card shell and the shared-part literals live in the shared components, never retyped in a page or component.', evidence: { failureRun: '37562493563', attackTest: t(fit(49, 'parts-not-pages'), 'RED: an Anton title typed by hand (fontFamily naming Anton)') }, carries: ['RD-73', 'RD-67-card-shell-one-component'] },
  { id: 'F50', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F50', governs: 'Every loop hop the build plan states is checked against the real workflow edges and fired-from-upstream artifacts.', evidence: { attackTest: t(fit(50, 'loop-wiring'), 'ATTACK: a consumer yml that lacks the workflow_run line does not satisfy hasWorkflowRunEdge') }, carries: ['RD-74-loop-hop-wiring'] },
  { id: 'F51', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F51', governs: 'Converted registries do not regrow hand-written entries, ids are unique, and no function stores a re-stampable ceiling.', evidence: { failureRun: '38108660600', attackTest: t(fit(51, 'no-shared-append'), 'check 1 RED: a hand-written "import { fitnessFunction as F" line in manifest.mjs is caught') }, carries: ['RD-75'] },
  { id: 'F52', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F52', governs: 'Workflow files are structurally valid, chained apply paths consult the dry guard, and artifact uploads stay inside the retention budget.', evidence: { failureRun: '37767563172', attackTest: t(fit(52, 'workflow-file-validity'), 'RED (a): a workflow with no jobs. block at all is caught') }, carries: ['RD-77', 'RD-87-chained-dry-guard-wired', 'RD-90-actions-artifact-budget'] },
  { id: 'F59', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F59', governs: 'Tooling resolves an npm dependency the way Node does, never through a hard-coded node_modules path.', evidence: { failureRun: '37811808768', attackTest: t(fit(59, 'dep-path-resolved'), 'RED: the five pre-fix shapes (verbatim from the removed code) are each flagged') }, carries: ['RD-85'] },
  { id: 'F64', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F64', governs: 'Every created table has RLS enabled somewhere in the corpus and no policy gates admin on bare org membership.', evidence: { failureRun: '37728001569', attackTest: t(fit(64, 'rls-admin-gate-class'), 'RED (fixture migration that MUST fail, rule 15): a new CREATE TABLE with RLS enabled nowhere in the set is a vi') }, carries: ['RD-88'] },
  { id: 'F66', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F66', governs: 'A test never pairs a live clock read with a computed-string equality, and no governed test path contains a bracket.', evidence: { failureRun: '37408085543', attackTest: t(fit(66, 'clock-fragility'), 'RED: the #816 shape, reproduced directly') }, carries: ['RD-88-clock-fragility', 'RD-89'] },
  { id: 'F67', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F67', governs: 'A CLI main guard never uses the hand-built file:// comparison and a CLI never calls main() unguarded at module scope.', evidence: { attackTest: t(fit(67, 'unguarded-main-invocation'), 'RED: a bare `main().catch(...)` at module scope with no guard anywhere above it is flagged') }, carries: ['RD-89-unguarded-main-invocation', 'RD-68'] },
  { id: 'F69', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F69', governs: 'No hardcoded Anthropic model id literal exists outside the model-id module.', evidence: { attackTest: t(fit(69, 'model-id-literal'), 'RED: a hardcoded Haiku literal in a new file is flagged with file:line') }, carries: ['RD-92-model-id-literal'] },
  { id: 'F70', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F70', governs: 'Every SECURITY DEFINER function carries a REVOKE from PUBLIC and a pinned search_path.', evidence: { attackTest: t(fit(70, 'definer-hygiene'), 'RED: a definer with a REVOKE but no search_path names only the search_path') }, carries: ['RD-93-definer-hygiene'] },
  { id: 'F71', kind: 'fitness', runsIn: 'static', enforcer: 'fitness:F71', governs: 'ADR-041: Community feeds nothing; no module outside the Community scope imports Community code or reads Community tables.', evidence: { attackTest: t(fit(71, 'community-boundary'), 'RED: a fixture import from src/lib/community into a regulations data path fails') }, carries: [] },

  // ---------------------------------------------------------------- rules (commit-time engine)
  { id: 'R012', kind: 'invariant', runsIn: 'static', enforcer: 'rule:012', governs: 'No user-home path is hardcoded.', evidence: { attackTest: t(`${RL}012-hardcoded-user-path.test.mjs`, '012 check: FAIL when Windows user-home forward-slash pattern is introduced') }, carries: ['SF-6-no-hardcoded-user-path'] },
  { id: 'R015', kind: 'invariant', runsIn: 'static', enforcer: 'rule:015', governs: 'A row mutation goes through the guarded path.', evidence: { attackTest: t(`${RL}015-row-mutation-guarded-path.test.mjs`, '015 check: FAIL, raw .update() outside the guarded path') }, carries: ['RD-1-classify-before-discard'] },
  { id: 'R017', kind: 'invariant', runsIn: 'static', enforcer: 'rule:017', governs: 'Generation config reads no raw env knob.', evidence: { attackTest: t(`${RL}017-generation-config-no-raw-env.test.mjs`, '017 check: FAIL, a raw KNOB env read introduced in a generation file') }, carries: ['SF-9-generation-config-no-raw-env'] },
  { id: 'R018', kind: 'invariant', runsIn: 'static', enforcer: 'rule:018', governs: 'No sixth customer surface appears outside the five-surface model.', evidence: { attackTest: t(`${RL}018-new-surface-five-model.test.mjs`, '018 check: FAIL, a NEW sixth customer surface (the Technology-page catch)') }, carries: ['PI-1-five-surface'] },
  { id: 'R019', kind: 'invariant', runsIn: 'static', enforcer: 'rule:019', governs: 'A source-shaped row is reclassified to a source, never archived.', evidence: { attackTest: t(`${RL}019-source-reclassify-not-archive.test.mjs`, '019 check: FAIL, a new raw archive with a source-y reason and no reclassifyToSource') }, carries: ['SC-2-source-registration', 'RD-1-classify-before-discard'] },
  { id: 'R021', kind: 'invariant', runsIn: 'static', enforcer: 'rule:021', governs: 'A change to a cached shape rotates its cache key.', evidence: { attackTest: t(`${RL}021-cached-shape-key.test.mjs`, '021 hash: shape edit changes the required key') }, carries: ['RD-51-cached-shape-key-rotation'] },
  { id: 'R022', kind: 'invariant', runsIn: 'static', enforcer: 'rule:022', governs: 'No dash or section-sign glyph is introduced in prose.', evidence: { attackTest: t(`${RL}022-no-dash-glyphs.test.mjs`, '022 check: FAIL when an added em dash appears in a .mjs file') }, carries: ['RD-69-no-dash-glyphs'] },
  { id: 'R023', kind: 'invariant', runsIn: 'static', enforcer: 'rule:023', governs: 'A source file git did not diff as text is refused.', evidence: { attackTest: t(`${RL}023-source-not-diffed-as-text.test.mjs`, '023 trigger and check: a source file git did not diff as text FAILS') }, carries: ['RD-97-source-diffed-as-text'] },
  { id: 'R024', kind: 'invariant', runsIn: 'static', enforcer: 'rule:024', governs: 'A WIP commit carries [skip ci] and only a WIP commit does.', evidence: { attackTest: t(`${RL}024-wip-commit-skips-ci.test.mjs`, '024 direction 1: a WIP subject without a skip token FAILS') }, carries: ['RD-98-wip-commit-skips-ci'] },

  // ---------------------------------------------------------------- consistency layer
  { id: 'C3', kind: 'invariant', runsIn: 'static', enforcer: 'consistency:C3', governs: 'The migrations inventory page matches the migration files.', evidence: { attackTest: t(`${CC}C3-migrations-reality.test.mjs`, 'NEGATIVE (parity): a well-formed new migration with no matching table row is caught as stale-status') }, carries: ['SF-1-inventory-consistency'] },
  { id: 'C4', kind: 'invariant', runsIn: 'static', enforcer: 'consistency:C4', governs: 'The worktrees inventory matches the live worktrees.', evidence: { attackTest: t(`${CC}C4-worktrees-reality.test.mjs`, 'classifyLiveWorktrees: outside the repo path is a note, inside and unlisted is drift') }, carries: ['SF-1-inventory-consistency', 'SF-7-worktree-convention'] },
  { id: 'C5', kind: 'invariant', runsIn: 'static', enforcer: 'consistency:C5', governs: 'The governing program anchors match the real code.', evidence: { attackTest: t(`${CC}C5-program-anchors-reality.test.mjs`, 'NEGATIVE (well-formedness): a doc missing the governing file entirely is caught as an orphan claim') }, carries: ['RG-1-plan-reground'] },

  // ---------------------------------------------------------------- invariants enforced by their own tests
  { id: 'RD-31-operator-priced-spend', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}llm/spend-guard.test.mjs`, governs: 'The paid path needs an operator-priced line with an inventory-miss citation and a verified item is never re-grounded without evidence of change.', evidence: { attackTest: t(`${LB}llm/spend-guard.test.mjs`, 'DETERMINISTICALLY-RESOLVABLE item is REJECTED from the paid path') }, carries: ['RD-10-spend-chokepoint', 'RD-28-verified-is-resting-state', 'RD-31-operator-priced-spend', 'RD-32-data-existence-before-acquisition'] },
  { id: 'RD-14-transport-escalation-write-gate', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/entity-gate.test.mjs`, governs: 'A failed-fetch error body is never stored as source content and never enters grounding input.', evidence: { attackTest: t(`${LB}sources/entity-gate.test.mjs`, 'a EUR-Lex 404 capture is an error body and is EXCLUDED from the grounding pool') }, carries: ['RD-13-error-body-groundability-gate', 'RD-14-transport-escalation-write-gate'] },
  { id: 'RD-26-pre-logged-acquire-justification', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/verify-item.test.mjs`, governs: 'A paid acquire is attributed, pre-logged with a justification, and never reached while a fresh snapshot exists.', evidence: { attackTest: t(`${LB}sources/verify-item.test.mjs`, 'decide: no snapshot -> needs_acquire (missing_snapshot)') }, carries: ['RD-25-paid-row-attribution', 'RD-26-pre-logged-acquire-justification', 'RD-29-fresh-snapshot-never-paid'] },
  { id: 'RD-33-no-execution-from-stale-state', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/holdings-gate.test.mjs`, governs: 'A fetch is refused when live holdings are present.', evidence: { attackTest: t(`${LB}sources/holdings-gate.test.mjs`, 'holdingsPresent: a real snapshot is holdings -> present (fetch refused)') }, carries: ['RD-33-no-execution-from-stale-state'] },
  { id: 'RD-35-flow-golden-mandate', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/reground-ladder.golden.test.mjs`, governs: 'An identifier-bearing item is never dispositioned absent, and the re-ground ladder is proven end to end.', evidence: { attackTest: t(`${LB}sources/reground-ladder.golden.test.mjs`, 'FLOW GOLDEN: failing item') }, carries: ['RD-34-referenced-law-exists', 'RD-35-flow-golden-mandate'] },
  { id: 'RD-36-re-grounds-never-destroy', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/ledger-dominance.test.mjs`, governs: 'A weaker re-ground replaces nothing.', evidence: { attackTest: t(`${LB}agent/ledger-dominance.test.mjs`, 'RED GOLDEN (Brazil)') }, carries: ['RD-36-re-grounds-never-destroy'] },
  { id: 'RD-37-charset-aware-decode', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/charset-decode.test.mjs`, governs: 'Response bytes are decoded with the declared charset.', evidence: { attackTest: t(`${LB}sources/charset-decode.test.mjs`, 'RED GOLDEN (Brazil): Latin-1 bytes decode') }, carries: ['RD-37-charset-aware-decode'] },
  { id: 'RD-12-size-cap-doctrine', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/section-grounding.test.mjs`, governs: 'A size cap on the grounding path either never binds or fails loud.', evidence: { attackTest: t(`${LB}agent/section-grounding.test.mjs`, 'RED (old behavior): a binding fact past 12KB') }, carries: ['RD-12-size-cap-doctrine'] },
  { id: 'RD-7-roadblock-alternative-search', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/primary-fallback.test.mjs`, governs: 'A roadblocked primary source triggers a bounded alternative search at the same tier floor.', evidence: { attackTest: t(`${LB}sources/primary-fallback.test.mjs`, 'detector: empty / <200ch stub') }, carries: ['RD-7-roadblock-alternative-search'] },
  { id: 'RD-14-line-read-is-not-verification', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}intake/intake-gates-golden.test.mjs`, governs: 'Intake gates are verified by behaviour, not by reading the line.', evidence: { attackTest: t(`${LB}intake/intake-gates-golden.test.mjs`, 'GATE matchExistingSubject') }, carries: ['RD-14-line-read-is-not-verification'] },
  { id: 'RD-21-generation-pause-split', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}api/generation-pause.npmtest.mjs`, governs: 'Emergency pause stops every caller and cadence-off stops autonomous generation only.', evidence: { attackTest: t(`${LB}api/generation-pause.npmtest.mjs`, 'RED-GUARD: signed manual caller BLOCKED under emergencyPaused') }, carries: ['RD-21-generation-pause-split'] },
  { id: 'RD-19-worktree-isolation', kind: 'invariant', runsIn: 'hook', enforcer: `selftest:${GV}worktree-isolation.test.mjs`, governs: 'An agent branch operation never runs in the main checkout.', evidence: { attackTest: t(`${GV}worktree-isolation.test.mjs`, 'RED evaluateCheckout: agent branch checkout in MAIN checkout is BLOCKED') }, carries: ['RD-19-worktree-isolation'] },
  { id: 'EP-13-skill-prompt-parity', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/skill-prompt-parity.test.mjs`, governs: 'The runtime synthesis prompt and the governing skill list the same rules and fields.', evidence: { attackTest: t(`${LB}agent/skill-prompt-parity.test.mjs`, "every rule's number and text matches between the two files") }, carries: ['EP-13-skill-prompt-parity'] },
  { id: 'RD-90', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}tint.test.mjs`, governs: 'A CSS color is never built by concatenating digits onto a var() reference.', evidence: { attackTest: t(`${LB}tint.test.mjs`, 'tint: never produces the old defect shape') }, carries: ['RD-90'] },
  { id: 'RD-80', kind: 'invariant', runsIn: 'app', enforcer: `selftest:${RN}rd-80-real-fonts.npmtest.mjs`, governs: 'The rendering guard measures the real site fonts, not an OS fallback.', evidence: { attackTest: t(`${RN}rd-80-real-fonts.npmtest.mjs`, 'RD-80: the fonts.check failure path is proven RED then GREEN by attack') }, carries: ['RD-80'] },
  { id: 'RD-82', kind: 'invariant', runsIn: 'app', enforcer: `selftest:${RN}ux-assert.test.mjs`, governs: 'No title renders narrower than its longest word and rows are measured on a real component at phone width.', evidence: { attackTest: t(`${RN}ux-assert.test.mjs`, 'RED: the 2026-09-03 screenshot row') }, carries: ['RD-60-row-ux-measured-on-real-component', 'RD-82'] },
  { id: 'SF-10-customer-surface-rendering', kind: 'invariant', runsIn: 'app', enforcer: `selftest:${RN}assertions.test.mjs`, governs: 'A customer surface renders its data extremes without overflow, placeholder literals or unshared parts.', evidence: { attackTest: t(`${RN}assertions.test.mjs`, "F-1 RED: pre-fix strip leaves 'New Sources Identified' ") }, carries: ['SF-10-customer-surface-rendering', 'RD-84'] },
  { id: 'RD-79', kind: 'invariant', runsIn: 'static', enforcer: 'selftest:fsi-app/.discipline/lib/no-npm-sandbox.test.mjs', governs: 'The no-npm test sandbox refuses a package installed in the checkout.', evidence: { attackTest: t('fsi-app/.discipline/lib/no-npm-sandbox.test.mjs', 'ATTACK: a package installed in the CHECKOUT') }, carries: ['RD-79'] },
  { id: 'RD-76', kind: 'invariant', runsIn: 'static', enforcer: 'selftest:fsi-app/.discipline/skill-drift-gate.test.mjs', governs: 'A pinned skill file exists and every governing citation resolves to a registered skill.', evidence: { attackTest: t('fsi-app/.discipline/skill-drift-gate.test.mjs', 'seeded (skill file deleted)') }, carries: ['RD-76'] },
  { id: 'RD-50-fork-log-frozen', kind: 'invariant', runsIn: 'static', enforcer: 'selftest:fsi-app/.discipline/rules/fork-log-archived.test.mjs', governs: 'The deprecated session-log fork path does not exist.', evidence: { attackTest: t('fsi-app/.discipline/rules/fork-log-archived.test.mjs', 'RD-50: the deprecated fork path does not exist') }, carries: ['RD-50-fork-log-frozen'] },
  { id: 'SF-11-secrets-registered', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${GV}secrets-reference-audit.test.mjs`, governs: 'Every workflow secret reference is registered.', evidence: { attackTest: t(`${GV}secrets-reference-audit.test.mjs`, 'NEGATIVE: a fabricated secrets.PROBE_SECRET') }, carries: ['SF-11-secrets-registered'] },
  { id: 'SF-12-doctrine-no-uncited-gate', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${GV}doctrine-contradiction.test.mjs`, governs: 'No doctrine clause asserts an uncited human gate in intake, triage, promotion or disposition.', evidence: { attackTest: t(`${GV}doctrine-contradiction.test.mjs`, 'RED: the pre-rewrite promotion clause') }, carries: ['SF-12-doctrine-no-uncited-gate'] },
  { id: 'SC-10-floor-source-complete', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/source-blocks.test.mjs`, governs: 'A source at or above the authority floor reaches the grounding model complete and the standard own-body floor is scoped.', evidence: { attackTest: t(`${LB}agent/source-blocks.test.mjs`, 'RED (pre-fix, order-based)') }, carries: ['SC-10-floor-source-complete', 'SC-14-standard-own-body-floor'] },
  { id: 'SC-11-floor-first-attribution', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/floor-attribution.test.mjs`, governs: 'A span present in a floor source and a corroborator is attributed to the floor source, never forced.', evidence: { attackTest: t(`${LB}agent/floor-attribution.test.mjs`, 'RED->GREEN: span in BOTH') }, carries: ['SC-11-floor-first-attribution'] },
  { id: 'SC-13-register-step-deterministic-tier', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}sources/register-step.test.mjs`, governs: 'The register-at-grounding step assigns a tier deterministically only.', evidence: { attackTest: t(`${LB}sources/register-step.test.mjs`, 'decidePoolHostRegistration: codified + unregistered') }, carries: ['SC-13-register-step-deterministic-tier'] },
  { id: 'SC-12-slot-forcing-genuine-support', kind: 'invariant', runsIn: 'static', enforcer: `selftest:${LB}agent/slot-forcing.test.mjs`, governs: 'Slot forcing never fabricates a fact to clear a criterion.', evidence: { attackTest: t(`${LB}agent/slot-forcing.test.mjs`, 'NEGATIVE: an unsupported assertion produces NO FACT') }, carries: ['SC-12-slot-forcing-genuine-support'] },

  // ---------------------------------------------------------------- behavioral goldens (run by run-goldens.mjs)
  { id: 'G-mint-gates', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}mint-gates.golden.mjs`, governs: 'The mint-time gates hold a FACT on a null or suspended source, a sub-floor tier or a conflated identity.', evidence: { attackTest: t(`${SV}mint-gates.golden.mjs`, 'authorityFloor: tier 3 vs floor 2 holds') }, carries: ['RD-41-mint-gates-report-only', 'SC-8-authority-floor'] },
  { id: 'G-mint-gates-live-hold', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}mint-gates-live-hold.golden.mjs`, governs: 'The mint gates are wired live with a hard hold for S-CONFLATE and a soft flag for S-NUMERIC.', evidence: { attackTest: t(`${SV}mint-gates-live-hold.golden.mjs`, 'S-NUMERIC does NOT set mint_hold_reason') }, carries: ['RD-41-mint-gates-report-only'] },
  { id: 'G-non-destructive-grounding', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}non-destructive-grounding.golden.mjs`, governs: 'A re-ground is a comparison, never a delete, and a claim is erased only on proven inaccuracy.', evidence: { attackTest: t(`${SV}non-destructive-grounding.golden.mjs`, 'diff: prior claim absent from new -> notReproduced (KEPT, not removed)') }, carries: ['RD-44-grounding-is-non-destructive', 'RD-45-erase-only-on-proven-inaccuracy'] },
  { id: 'G-drain-clear-two-condition', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}drain-clear-two-condition.golden.mjs`, governs: 'A claim auto-clears only when its span is absent and a foreign identifier is confirmed on an id-confirmed primary.', evidence: { attackTest: t(`${SV}drain-clear-two-condition.golden.mjs`, '4ff5cf56 pattern does NOT auto-clear') }, carries: ['RD-45-erase-only-on-proven-inaccuracy'] },
  { id: 'G-primary-text-permanent', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}primary-text-permanent.golden.mjs`, governs: 'A changed re-capture is a new versioned snapshot and never overwrites the prior.', evidence: { attackTest: t(`${SV}primary-text-permanent.golden.mjs`, 'changed re-capture yields a DIFFERENT storage key (no blob overwrite)') }, carries: ['RD-46-primary-text-permanent'] },
  { id: 'G-resolver-status-filter', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}resolver-status-filter.golden.mjs`, governs: 'A suspended source is unselectable by the grounding resolver.', evidence: { attackTest: t(`${SV}resolver-status-filter.golden.mjs`, 'suspended junk-drawer is UNSELECTABLE (sourceId null)') }, carries: ['RD-39-suspended-source-unselectable'] },
  { id: 'G-disposition-content-gate', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}disposition-content-gate.golden.mjs`, governs: 'An irreversible disposition executes on content emptiness, never on a label.', evidence: { attackTest: t(`${SV}disposition-content-gate.golden.mjs`, '--bucket outside allowlist is REFUSED') }, carries: ['RD-42-disposition-content-gate'] },
  { id: 'G-executor-parity', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}executor-parity.golden.mjs`, governs: 'Grounding doctrine binds to the shared pipeline chokepoint, not to the executor.', evidence: { attackTest: t(`${SV}executor-parity.golden.mjs`, 'divergence (d): replace-ledger guard requires both an injected ledger') }, carries: ['RD-47-doctrine-binds-to-pipeline-not-executor'] },
  { id: 'G-target-match', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}target-match.golden.mjs`, governs: 'A captured primary must be the item own instrument; a mismatch is held.', evidence: { attackTest: t(`${SV}target-match.golden.mjs`, 'eu_clean_trucking RED: CSRD capture for the HDV item is a MISMATCH') }, carries: ['RD-48-target-instrument-match'] },
  { id: 'G-surface-contract-gate', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}surface-contract-gate.golden.mjs`, governs: 'A decline or park decision records a five-surface test with a verdict and reason for each contract.', evidence: { attackTest: t(`${SV}surface-contract-gate.golden.mjs`, 'declined + no surface_test FAILS the gate (RED)') }, carries: ['PI-5-every-decline-names-the-five-contracts', 'SCS-1-surface-contracts-skill-copy'] },
  { id: 'G-cc-executor-submit', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}cc-executor-submit.golden.mjs`, governs: 'The executor submit path keeps only verbatim spans and holds a FACT that fails a per-fact gate.', evidence: { attackTest: t(`${SV}cc-executor-submit.golden.mjs`, 'paraphrased span absent from capture is REJECTED') }, carries: [] },
  { id: 'G-injected-no-synthesis-window', kind: 'golden', runsIn: 'static', enforcer: `selftest:${SV}injected-no-synthesis-window.golden.mjs`, governs: 'An injected ledger skips the synthesis window and builds no source blocks.', evidence: { attackTest: t(`${SV}injected-no-synthesis-window.golden.mjs`, 'buildSourceBlocks(...) is inside the guard') }, carries: [] },

  // ---------------------------------------------------------------- live-data audits (read-only, post-merge smoke)
  { id: 'A-one-tier-per-host', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}one-tier-per-host-audit.mjs`, governs: 'A host carries one base_tier unless an override is recorded.', evidence: { failureRun: '31468085014' }, carries: ['SC-6-one-tier-per-host'] },
  { id: 'A-claims-tier', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}claims-tier-audit.mjs`, governs: 'A claim tier equals the tier derived from its source.', evidence: { failureRun: '31468085014' }, carries: ['SC-7-claims-tier'] },
  { id: 'A-ledger-onepass', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}ledger-onepass-audit.mjs`, governs: 'The stored FACT stamps match a one-pass re-derivation of the ledger.', evidence: { failureRun: '31468085014' }, carries: ['SC-7-claims-tier'] },
  { id: 'A-quarantine-disposition', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}quarantine-disposition-audit.mjs`, governs: 'No item sits live-quarantined past the dwell bound without a disposition or a valid deferral.', evidence: { failureRun: '31468085014' }, carries: ['RD-4-quarantine-disposition', 'RD-6-deferral-vs-undispositioned'] },
  { id: 'A-flag-age', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}flag-age-audit.mjs`, governs: 'No open integrity flag outlives its dwell bound.', evidence: { failureRun: '31468085014' }, carries: ['RD-30-flag-age-dwell'] },
  { id: 'A-deferral-hygiene', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}deferral-hygiene-audit.mjs`, governs: 'A deferral names its blocker, its awaited path, an event and an owner, and no flag references a deleted subject.', evidence: { failureRun: '31468085014' }, carries: ['RD-6-deferral-vs-undispositioned'] },
  { id: 'A-substrate-agreement', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}substrate-agreement-audit.mjs`, governs: 'Stored provenance status agrees with the live gate in both directions.', evidence: { failureRun: '31468085014' }, carries: ['RD-5-status-is-a-cache'] },
  { id: 'A-orphan-source', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}orphan-source-audit.mjs`, governs: 'A source archived as an item is registered as an active source.', evidence: { failureRun: '31468085014' }, carries: ['SC-2-source-registration'] },
  { id: 'A-source-link', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}source-link-audit.mjs`, governs: 'No live item is source-less.', evidence: { failureRun: '31468085014', attackTest: t('fsi-app/src/lib/intake/source-link-invariant.test.mjs', 'RED: a source-less LIVE row (not grandfathered) is a violation') }, carries: ['RD-22-mint-source-link'] },
  { id: 'A-schema-drift', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}schema-drift-audit.mjs`, governs: 'Every live database object has a committed CREATE.', evidence: { attackTest: t(`${SV}lib/schema-drift.test.mjs`, 'diffSchema: TRIP') }, carries: ['RD-49-schema-drift-committed-source'] },
  { id: 'A-migration-history', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}migration-history-audit.mjs`, governs: 'The applied-migration ledger matches the migration files and the applied map.', evidence: { attackTest: t(`${SV}migration-history-audit.test.mjs`, 'ATTACK LEDGER_ROW_NOT_IN_MAP') }, carries: ['RD-94-migration-history'] },
  { id: 'A-ui-orphan', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}ui-orphan-audit.mjs`, governs: 'A field a UI read selects has a producer.', evidence: { attackTest: t(`${SV}ui-orphan-audit.test.mjs`, 'ATTACK: a UI field bound to a column with no producer') }, carries: ['RD-95-ui-orphan-field'] },
  { id: 'A-surface-acceptance', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}surface-acceptance.mjs`, governs: 'The entity spine passes the spec 00 acceptance assertions on live data.', evidence: { attackTest: t(`${SV}surface-acceptance.test.mjs`, '#1 refs-resolve: a dangling id') }, carries: ['RD-96-spine-coherence-acceptance'] },
  { id: 'A-prov-guard-adversarial', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}prov-guard-adversarial-audit.mjs`, governs: 'The provenance-verified binding denies a forged-input escalation under rollback.', evidence: { attackTest: t(`${SV}prov-guard-adversarial-audit.mjs`, 'A forged-GUC quarantined->verified DENIED') }, carries: [] },
  { id: 'A-spec09-org-rls', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}spec09-org-rls-adversarial-audit.mjs`, governs: 'One organisation cannot read another organisation rows.', evidence: { attackTest: t(`${SV}spec09-org-rls-adversarial-audit.test.mjs`, "org B can see org A's row is a cross-org RLS leak, not a pass") }, carries: [] },
  { id: 'A-admin-phrase-scan', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}admin-phrase-scan.mjs`, governs: 'No admin copy asserts a human gate in intake, triage or promotion outside the allowlisted operator controls.', evidence: { attackTest: t('fsi-app/scripts/lib/admin-phrase-scan.selftest.mjs', 'TRIPS: a human-gate phrase outside the allowlist is flagged') }, carries: [] },
  { id: 'A-section-markers', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}section-marker-audit.mjs`, governs: 'No stored brief body carries a forged section marker.', evidence: { attackTest: t(`${SV}section-marker-audit.test.mjs`, 'ATTACK: a corpus holding a forged body fails the audit (exit 1) and names the item') }, carries: [] },
  { id: 'A-check-vocabulary-drift', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}check-vocabulary-drift.mjs`, governs: 'The tracked CHECK-constraint inventory equals the live constraint allowed sets.', evidence: { attackTest: t(`${SV}lib/vocab-drift.test.mjs`, 'diffVocabulary: a null-vs-array mismatch on the SAME constraint is reported as drift') }, carries: [] },
  { id: 'A-layer-c-insert-gate', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}layer-c-insert-gate-proof.mjs`, governs: 'The data-audit block trigger bounces an unwaived insert and passes a valid waiver, proven in a rolled-back transaction.', evidence: { attackTest: t(`${SV}layer-c-insert-gate-proof.mjs`, 'RED-1  -- open block, no waiver: insert bounces') }, carries: [] },
  { id: 'A-pause-flag-guard-proof', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}pause-flag-guard-proof.mjs`, governs: 'An unmarked write to the pause flag columns is rejected by the guard trigger, proven on a synthetic table in a rolled-back transaction.', evidence: { attackTest: t(`${SV}pause-flag-guard-proof.mjs`, 'unmarked write bounced') }, carries: [] },
  { id: 'A-derivation-edges-rls', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}derivation-edges-rls-adversarial-audit.mjs`, governs: 'anon and authenticated are denied insert, update and delete on derivation_edges while service_role still reads.', evidence: { attackTest: t(`${SV}derivation-edges-rls-adversarial-audit.mjs`, 'A anon INSERT into derivation_edges DENIED') }, carries: [] },
  { id: 'A-harness-runs-rls', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}harness-runs-rls-adversarial-audit.mjs`, governs: 'anon and authenticated are denied insert, update and delete on harness_runs while service_role still reads.', evidence: { attackTest: t(`${SV}harness-runs-rls-adversarial-audit.mjs`, 'A anon INSERT into harness_runs DENIED') }, carries: [] },
  { id: 'A-harness-family-walk', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}harness-family-schedule-walker-audit.mjs`, governs: 'Every harness family that has a workflow has dispatched at least once, read from the harness_runs ledger (the one reader of that table).', evidence: { attackTest: t(`${SV}lib/harness-family-walk-scan.test.mjs`, 'summarizeFamilyDispatchHistory: KNOWN POSITIVE (PROD-2 shape), zero artifacts means everDispatched=false') }, carries: [] },
  { id: 'A-defect-signature-scan', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}defect-signature-scan.mjs`, governs: 'Known accuracy defect signatures (conflation, numeric span mismatch) produce hits on live facts.', evidence: { attackTest: t(`${SV}defect-signature-scan.golden.mjs`, 'positive: euro 6,800 not in span produces an S-NUMERIC hit') }, carries: [] },
  { id: 'A-no-generic-source', kind: 'audit', runsIn: 'post-merge smoke', enforcer: `audit:${SV}no-generic-source-audit.mjs`, governs: 'The count of facts on suspended sources never rises.', evidence: { attackTest: t(`${SV}no-generic-source-audit.golden.mjs`, 'flags exactly the 2 facts on suspended sources') }, carries: ['RD-40-no-fact-on-suspended-source'] },

  // ---------------------------------------------------------------- other verify scripts that gate
  { id: 'A-no-personal-identifiers', kind: 'audit', runsIn: 'static', enforcer: `audit:${SV}no-personal-identifiers.test.mjs`, governs: 'No tracked text file names the operator (first name, surname, personal webmail address) outside an exact, reasoned allowlist.', evidence: { attackTest: t(`${SV}no-personal-identifiers.test.mjs`, 'ATTACK first name in prose is a violation') }, carries: [] },
  { id: 'A-audit-finding-status', kind: 'audit', runsIn: 'static', enforcer: `audit:${SV}audit-finding-status.mjs`, governs: 'Every finding in a docs/audits file carries a status token.', evidence: { attackTest: t(`${SV}audit-finding-status.test.mjs`, 'ATTACK disposition: a finding with no disposition fails') }, carries: [] },
  { id: 'A-rls-persona-matrix', kind: 'audit', runsIn: 'schema', enforcer: `audit:${SV}attacks/rls-persona-matrix.mjs`, governs: 'Every persona is refused the writes, truncates and view or function calls it must not have, on the local stack.', evidence: { attackTest: t(`${SV}attacks/rls-persona-matrix.test.mjs`, 'evaluateMatrix ATTACK: a persona that can TRUNCATE one table is a violation naming the persona and the table') }, carries: [] },
  { id: 'A-routes-attacked', kind: 'audit', runsIn: 'app', enforcer: `audit:${SV}attacks/routes-attacked.mjs`, governs: 'An anonymous request to a proxy-gated page or route is refused on the built app.', evidence: { attackTest: t(`${SV}attacks/routes-attacked.test.mjs`, 'PAGE: an anonymous request served a proxy-gated page turns the run red') }, carries: [] },
];

// Files under the registry's governed directories that are not rows: libraries, fixtures, data files and the
// runners themselves. registry.test.mjs requires every other tracked file in those directories to be a row enforcer.
export const SUPPORT_FILES = [
  /^fsi-app\/scripts\/verify\/run-data-audit-lane\.mjs$/,
  /^fsi-app\/scripts\/verify\/run-goldens\.mjs$/,
  /^fsi-app\/scripts\/verify\/lib\//,
  /^fsi-app\/scripts\/verify\/fixtures\//,
  /^fsi-app\/scripts\/verify\/_baselines\//,
  /^fsi-app\/scripts\/verify\/attacks\/(?:attack-cli|f9-real-project-attack|forbid-fires-attack|rls-persona-attacks|rls-view-function-attacks)\.mjs$/,
  /^fsi-app\/scripts\/verify\/migration-history-(?:diff|objects)\.mjs$/,
  /^fsi-app\/scripts\/verify\/(?:ui-orphan|harness-family-walk)-allowlist\.json$/,
  /^fsi-app\/scripts\/verify\/(?:[^/]+\/)*[^/]+\.test\.mjs$/,
  /^fsi-app\/scripts\/verify\/(?:population-report|verification-audit-report|migration-number-collision)\.mjs$/,
];

// Audits that still carry a `// data-audit:` marker but WRITE through the guarded path, so the read-only smoke step
// (run-data-audit-lane.mjs --read-only) skips them and no registry row exists for them. They live outside
// scripts/verify/, which REG-1 may not edit; deleting them is owed (see the lane session log).
export const LANE_WRITING_AUDITS = [
  { label: 'holdings-audit', file: 'fsi-app/scripts/holdings-audit.mjs', reason: 'writes through guardedUpdate and guardedInsert' },
  { label: 'skill-conformance', file: 'fsi-app/scripts/audit-skill-conformance.mjs', reason: 'writes through guardedUpdate and guardedInsert' },
];

// Every id that left the registry, with the date, the reason and the surviving row (null when none). Recorded, never
// silently removed. Kind says where the id lived: fitness | invariant | script.
const D = '2026-10-11';
export const RETIRED = {
  F44: { kind: 'fitness', retiredOn: D, survivor: 'F67', reason: 'Absorbed as facet A of F67: both are the CLI main-guard class under scripts and .discipline; the F44 tests moved with the function.' },
  F38: { kind: 'fitness', retiredOn: D, survivor: 'F39', reason: 'Absorbed as facet A of F39: both bound a Supabase read against the PostgREST ceiling; the F38 tests moved with the function and the fitness-allow F38 marker still works.' },
  F65: { kind: 'fitness', retiredOn: D, survivor: 'F66', reason: 'Absorbed as facet B of F66: both are test-file hygiene classes that silently drop or flake a test; the F65 tests moved with the function.' },
  F42: { kind: 'fitness', retiredOn: D, survivor: 'F49', reason: 'Absorbed as facet A of F49: both forbid a shared-part literal outside the shared components; the F42 tests moved and the fitness-allow F42 marker still works.' },
  F61: { kind: 'fitness', retiredOn: D, survivor: 'F52', reason: 'Absorbed as facet B of F52: a workflow-file structure check; the F61 tests moved with the function.' },
  F68: { kind: 'fitness', retiredOn: D, survivor: 'F52', reason: 'Absorbed as facet C of F52: a workflow-file structure check; the F68 tests moved with the function.' },
  F47: { kind: 'fitness', retiredOn: D, survivor: 'F14', reason: 'Absorbed as facet B of F14: both hold the liveness of database objects, one by writers and one by the replayed schema; the F47 tests moved with the function.' },
  F11: { kind: 'fitness', retiredOn: D, survivor: 'F10', reason: 'Absorbed as a sentinel of F10: the source-credibility math is one property proven by three selftests.' },
  F12: { kind: 'fitness', retiredOn: D, survivor: 'F10', reason: 'Absorbed as a sentinel of F10: the source-credibility math is one property proven by three selftests.' },
};

const NOEV = 'Its only enforcers were data audits or migration presence checks with no retained truthful failure and no attack test, so no row can carry it; the skill statement stands without a registry row.';
Object.assign(RETIRED, {
  // ---- invariants whose last enforcer left the registry (the skill statements remain in the skills)
  'AC-1-section-construction': { kind: 'invariant', retiredOn: D, survivor: null, reason: `format-structure and skill-conformance audits deleted by REG-1 (no failure evidence, no attack test; skill-conformance writes). ${NOEV}` },
  'EP-1-integrity': { kind: 'invariant', retiredOn: D, survivor: null, reason: `Enforced only by migration presence checks (035, 044, 121). ${NOEV}` },
  'EP-2-workspace-anchored': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The no-names audit was deleted by REG-1. ${NOEV}` },
  'EP-3-format-mapping': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The routing audit was deleted by REG-1. ${NOEV}` },
  'EP-4-source-not-item': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The source-vs-item audit was deleted by REG-1; rule 019 still gates the reclassification path under SC-2. ${NOEV}` },
  'EP-5-cross-format-lens': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The format-structure audit was deleted by REG-1. ${NOEV}` },
  'EP-10-vocab-sync': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The vocab-sync audit was deleted by REG-1; check-vocabulary-drift and schema-drift remain as audit rows. ${NOEV}` },
  'EP-11-canonical-instrument-key': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The canonical-key-uniqueness audit was deleted by REG-1; the partial unique index from migration 200 still enforces it in the database. ${NOEV}` },
  'EP-12-figure-expression': { kind: 'invariant', retiredOn: D, survivor: null, reason: `Enforced only by migration presence checks (224, 225). ${NOEV}` },
  'PI-2-regulations-only-on-regulations': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The routing audit was deleted by REG-1. ${NOEV}` },
  'RD-17-rls-credential-parity': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The rls-credential-parity audit was deleted by REG-1; the RLS persona matrix covers the policies. ${NOEV}` },
  'RD-18-column-existence-parity': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The column-existence-parity audit was deleted by REG-1; schema-drift remains. ${NOEV}` },
  'RD-20-staged-transit-disposition': { kind: 'invariant', retiredOn: D, survivor: null, reason: `The staged-transit audit was deleted by REG-1. ${NOEV}` },
  'RD-27-snapshot-write-on-acquire': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'Its only enforcer, snapshot-store.test.mjs, holds a round-trip test with no negative case, so no attack test can be named; the test itself still runs in the suite.' },
  'A-candidate-dwell': { kind: 'audit', retiredOn: D, survivor: null, reason: 'It judged a candidate by whether a committed ledger-verdicts batch named it; CLEAN-1 (2026-10-11) deleted the committed batches as machine output, so the check had nothing to read.' },
  'RD-31-candidate-dwell': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'Carried only by the candidate-dwell audit, retired with the committed ledger-verdicts batches it read (CLEAN-1, 2026-10-11).' },
  'RD-38-funded-pass-run-lock': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'The funded-pass-lock golden writes lock rows to the live database and was deleted by REG-1 under the writes rule; migration 205 still holds the lock in the database.' },
  'RD-81': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'It governed live-writing goldens; the two such goldens (funded-pass-lock, mutation-lease) were deleted by REG-1, so no golden writes a live shared table.' },
  'SC-4-bias-external-only': { kind: 'invariant', retiredOn: D, survivor: null, reason: `Enforced only by the migration 092 presence check. ${NOEV}` },
  'RD-62-perf-budget-ratchet': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'Dead: the perf-budget registry file it governed was deleted with F37 (GATE-3, 2026-10-08), so no property remains to govern.' },
  'RD-86-workflow-run-chain-depth': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'Dead: F60 was deleted by GATE-3 (2026-10-08); the platform limit it quoted still exists but no gate checks it.' },
  'RD-91': { kind: 'invariant', retiredOn: D, survivor: null, reason: 'Dead: F63 was deleted with its test by GATE-3 (2026-10-08); the applied-status property is exercised by the migration applied-status test.' },
  // ---- verify scripts deleted
  'script:canonical-key-uniqueness': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit, no failure evidence or attack test. EP-11 retired with it.' },
  'script:column-existence-parity': { kind: 'script', retiredOn: D, survivor: 'A-schema-drift', reason: 'Deleted data audit, no failure evidence or attack test, overlap group schema and vocabulary.' },
  'script:dead-column-audit': { kind: 'script', retiredOn: D, survivor: 'A-ui-orphan', reason: 'Merged into the ui-orphan audit (overlap group orphan scan); the dead-column scan library stays as the ui-orphan dependency.' },
  'script:duplicate-table-audit': { kind: 'script', retiredOn: D, survivor: 'F14', reason: 'Deleted with its scan library, allowlist and fixture; duplicate and unreferenced tables are covered by F14 facet B (overlap group orphan scan).' },
  'script:format-structure': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit, no failure evidence or attack test. AC-1 and EP-5 retired with it.' },
  'script:id-redirect-target-audit': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit that never fired in a lane run, with no attack test.' },
  'script:mode-tag-coverage-audit': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit that never fired in a lane run, with no attack test.' },
  'script:no-names': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit with no failure evidence or attack test. EP-2 retired with it.' },
  'script:routing': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit with no failure evidence or attack test. EP-3 and PI-2 retired with it.' },
  'script:source-vs-item': { kind: 'script', retiredOn: D, survivor: 'R019', reason: 'Deleted data audit with no failure evidence or attack test (overlap group source registry); rule 019 gates the reclassification path. EP-4 retired with it.' },
  'script:staged-transit-audit': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit that never fired in a lane run, with no attack test. RD-20 retired with it.' },
  'script:rls-credential-parity': { kind: 'script', retiredOn: D, survivor: 'A-rls-persona-matrix', reason: 'Deleted data audit with no truthful failure evidence (its lane failures were harness defects) and no attack test; the RLS persona matrix covers the policies. RD-17 retired with it.' },
  'script:unregistered-span-host-audit': { kind: 'script', retiredOn: D, survivor: 'SC-11-floor-first-attribution', reason: 'Deleted data audit with no truthful failure evidence and no attack test; the item-scoped mirror in audit-gate stays in product code.' },
  'script:vocab-sync-audit': { kind: 'script', retiredOn: D, survivor: 'A-check-vocabulary-drift', reason: 'Deleted data audit with no failure evidence or attack test (overlap group schema and vocabulary). EP-10 retired with it.' },
  'script:wave-acceptance-audit': { kind: 'script', retiredOn: D, survivor: 'A-defect-signature-scan', reason: 'Deleted audit that never fired in a lane run (overlap group ground-truth scan); the defect-signature scan keeps its golden.' },
  'script:surface-visibility-audit': { kind: 'script', retiredOn: D, survivor: null, reason: 'Deleted data audit that writes through the guarded path, which a read-only smoke step cannot run; it never fired in a lane run.' },
  'script:remediate-orphan-sources': { kind: 'script', retiredOn: D, survivor: null, reason: 'Duplicate of scripts/maintenance/remediate-orphan-sources.mjs, which maintenance.yml runs; a remediation tool, not a check.' },
  'script:export-loop-fired-evidence': { kind: 'script', retiredOn: D, survivor: null, reason: 'Manual export, run by nothing; deleted with the committed evidence file by CLEAN-1 (2026-10-11).' },
  'A-loop-fired-evidence': { kind: 'audit', retiredOn: D, survivor: null, reason: 'Validated only the committed loop-fired-evidence.json, which CLEAN-1 (2026-10-11) deleted as committed machine output; a firing is read from the harness_runs table.' },
  'script:funded-pass-lock-golden': { kind: 'script', retiredOn: D, survivor: null, reason: 'Live-database golden that writes lock rows and self-skips in CI; deleted under the writes rule. RD-38 and RD-81 retired with it.' },
  'script:mutation-lease.golden': { kind: 'script', retiredOn: D, survivor: null, reason: 'Live-database golden that writes lease rows and self-skips in CI; deleted under the writes rule.' },
});

export function retiredByKind(kind) {
  return Object.fromEntries(Object.entries(RETIRED).filter(([, v]) => v.kind === kind));
}

/** Pure: the enforcedBy tokens a carried invariant derives from the rows that carry it. */
export function enforcedByFromRows(rows, invariantId) {
  const out = [];
  const add = (tok) => { if (!out.includes(tok)) out.push(tok); };
  for (const r of rows) {
    if (!(r.carries ?? []).includes(invariantId)) continue;
    add(r.enforcer);
    const at = r.evidence?.attackTest?.file;
    if (at && /\.(?:test|selftest|npmtest|golden)\.mjs$|-golden\.mjs$/.test(at) && `selftest:${at}` !== r.enforcer) add(`selftest:${at}`);
  }
  return out;
}

/** The one-screen summary every runner invocation prints last. Pure formatting over the rows. */
export function registrySummary(rows = REGISTRY_ROWS, retired = RETIRED) {
  const count = (key, values) => values.map((v) => `${v} ${rows.filter((r) => r[key] === v).length}`).join(', ');
  const lines = [
    `Enforcement registry: ${rows.length} rows (${count('kind', KINDS)})`,
    `  runs in: ${count('runsIn', RUNS_IN)}`,
    `  retired ids on record: ${Object.keys(retired).length}`,
    `  evidence: ${rows.filter((r) => r.evidence?.failureRun).length} with a retained failure run, ${rows.filter((r) => r.evidence?.attackTest).length} with an attack test`,
  ];
  return lines.join('\n');
}

// Built from char codes so this source never carries the glyphs rule 022 bans (en dash, em dash, horizontal bar,
// minus sign, non-breaking hyphen, section sign).
const GLYPH_RE = new RegExp(`[${[0x2013, 0x2014, 0x2015, 0x2212, 0x2011, 0xa7].map((c) => String.fromCharCode(c)).join('')}]`);
const ENFORCER_RE = /^(fitness|rule|consistency|selftest|audit):(.+)$/;

/**
 * Pure row audit. `env` is injected so the registry's own catching behaviour is negative-tested without the tree:
 *   fitnessIds, ruleIds, consistencyIds : Set<string> of the live mechanism ids
 *   fileExists(path) -> boolean         : is this repo path a tracked, readable file
 *   readFile(path) -> string | null     : its text
 * Returns { problems: string[] }. A row with neither evidence kind is the rule-15 failure this lane exists to make
 * mechanical: a check that has never failed and has no attack test is a guess wearing a gate's clothes.
 */
export function auditRegistry(rows, env) {
  const problems = [];
  const seen = new Set();
  const enforcers = { fitness: new Set(), rule: new Set(), consistency: new Set() };
  for (const r of rows) {
    const where = `row ${r.id}`;
    if (!r.id || typeof r.id !== 'string') { problems.push('a row has no id'); continue; }
    if (seen.has(r.id)) problems.push(`${where}: duplicate id`);
    seen.add(r.id);
    if (!KINDS.includes(r.kind)) problems.push(`${where}: kind "${r.kind}" is not one of ${KINDS.join(', ')}`);
    if (!RUNS_IN.includes(r.runsIn)) problems.push(`${where}: runsIn "${r.runsIn}" is not one of ${RUNS_IN.join(', ')}`);
    if (typeof r.governs !== 'string' || r.governs.trim().length < 20 || /[\r\n]/.test(r.governs)) problems.push(`${where}: governs must be one line of at least 20 characters`);
    else if (r.governs.length > 260) problems.push(`${where}: governs is longer than 260 characters`);
    if (GLYPH_RE.test(`${r.governs} ${r.id}`)) problems.push(`${where}: governs carries a dash or section-sign glyph`);
    const m = ENFORCER_RE.exec(r.enforcer ?? '');
    if (!m) { problems.push(`${where}: enforcer "${r.enforcer}" is not type:locator`); }
    else {
      const [, type, loc] = m;
      if (type === 'fitness') { enforcers.fitness.add(loc); if (!env.fitnessIds.has(loc)) problems.push(`${where}: fitness ${loc} is not in the fitness manifest`); }
      else if (type === 'rule') { enforcers.rule.add(loc); if (!env.ruleIds.has(loc)) problems.push(`${where}: rule ${loc} is not in the rules manifest`); }
      else if (type === 'consistency') { enforcers.consistency.add(loc); if (!env.consistencyIds.has(loc)) problems.push(`${where}: consistency ${loc} is not registered`); }
      else if (!env.fileExists(loc)) problems.push(`${where}: enforcer file ${loc} is not a tracked file`);
    }
    // EVIDENCE: a retained failure run id, or an attack test that exists and names itself.
    const ev = r.evidence ?? {};
    const hasRun = ev.failureRun !== undefined;
    const hasAttack = ev.attackTest !== undefined;
    if (!hasRun && !hasAttack) problems.push(`${where}: NO EVIDENCE (needs a retained failure run id or an attack test; rule 15)`);
    if (hasRun && !/^\d{8,}$/.test(String(ev.failureRun))) problems.push(`${where}: failureRun "${ev.failureRun}" is not a GitHub run id`);
    if (hasAttack) {
      const { file, name } = ev.attackTest;
      if (!file || !name) problems.push(`${where}: attackTest needs a file and a name`);
      else if (!env.fileExists(file)) problems.push(`${where}: attack test file ${file} is not a tracked file`);
      else if (!(env.readFile(file) ?? '').includes(name)) problems.push(`${where}: attack test text "${name}" does not appear in ${file}`);
    }
    for (const c of r.carries ?? []) if (typeof c !== 'string' || !c) problems.push(`${where}: carries holds a non-id`);
  }
  for (const id of env.fitnessIds) if (!enforcers.fitness.has(id)) problems.push(`fitness ${id} has no registry row (every fitness function is a row)`);
  for (const id of env.ruleIds) if (!enforcers.rule.has(id)) problems.push(`rule ${id} has no registry row`);
  for (const id of env.consistencyIds) if (!enforcers.consistency.has(id)) problems.push(`consistency ${id} has no registry row`);
  return { problems };
}
