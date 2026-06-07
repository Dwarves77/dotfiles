# Caro's Ledge — FULL CODEBASE AUDIT (every line)

Date: 2026-06-06. Method: 6 parallel readers, each reading **every file in full** across the whole tree
(no grep-and-skim). Coverage: `src/lib/agent/**`, `src/lib/sources/**`, `src/lib/credibility/**`,
`src/lib/d3/**`, `trust.ts`; all 130 `supabase/migrations/*.sql` + `data.ts` + `supabase-server.ts` +
`dashboard/**`; all 357 `scripts/**`; all `src/app/**` (30 pages + 73 API routes) + 180+ `components/**`
+ stores + hooks; remaining `src/lib/{api,llm,auth,supabase,utils,briefing,community,export,jurisdictions,
notifications}` + `types/**` + `data/**` + `proxy.ts` + `workflows/**` + `__tests__/**`; all root config +
`.github/workflows/**` + `.discipline/**` + `supabase/` non-migration + `public/**`. Verdict axis per file:
WIRED? · PURPOSE · FUNCTIONS?

---

## 1. THE LIVE SPINE (what actually runs and functions)

- **Generation pipeline** (LIVE): `POST /api/agent/run` → `start(generateBriefWorkflow)` (Vercel WDK,
  `src/workflows/generate-brief.ts`) → `preflight → generate → section → ground → grow`, each wrapping a
  `src/lib/agent/canonical-pipeline.ts` fn. generate fetches the primary source, **web_searches for
  corroborators** (`discoverCorroborators`), multi-source-fetches, synthesises; section extracts the
  format's sections; ground builds a claim ledger + verbatim span-check + `validate_item_provenance`;
  grow registers discovered sources + compounds credibility. WORKS.
- **Provenance gate** (LIVE, wired end-to-end — no customer leak found): `validate_item_provenance`
  (live def = migration **121**) + `set_provenance_status` trigger (115) + `_workspace_active_items`
  gated `provenance_status='verified'` (117) → inherited by every customer RPC
  (`get_market_intel_items`/`get_research_items`/`get_operations_items`/`get_technology_items`/
  `get_workspace_intelligence(_slim/_dashboard/_listings/_aggregates)`). Detail fetch fails CLOSED.
- **Five customer surfaces + Map + Community + Admin** (LIVE): every Sidebar nav entry resolves to a
  real wired surface; `/market` and `/operations` fail CLOSED (honest empty state, no seed fallback).
- **Enforcement engine** (LIVE): commit-msg hook → 6 content-verifying rules (012/014/015/016/017/018);
  pre-push hook → untracked-gate + consistency C3/C4 + unit tests + `tsc`; CI `discipline.yml` +
  `bug-class-guard.yml` (7 HARD selftests); crons (q7-daily, source-monitoring hourly, trust-recompute
  monthly, spot-check monthly) — **every CI/cron target route exists and is auth-gated**.
- **Auth/rate-limit** (REAL): `requireAuth`/`requireCommunityAuth` enforced on ~67 routes; `isPlatformAdmin`
  on admin mutations; `proxy.ts` protects non-public routes. Rate-limit is real but **in-memory single-
  instance** (under-counts on multi-instance Vercel; documented, pre-pilot-acceptable).

---

## 2. THE DISPUTED SUBSYSTEM — research → ground → "erase if fabricated"

Operator's intended design: empty/failed grounding → **RESEARCH to find the source** → if grounded,
verify → **if ungroundable/fabricated, ERASE** (never permanent-quarantine).

**As-built reality (HALF the design is wired):**
- ✅ **Research-to-find EXISTS and is wired — but only at GENERATE time.** `discoverCorroborators`
  (`canonical-pipeline.ts:86`, web_search) runs on every generate; "thin source ⇒ research wider."
- ❌ **No re-research on grounding failure.** `groundBrief` (`canonical-pipeline.ts:210`): empty/failed
  corpus or `validate_item_provenance` invalid → **rollback the just-inserted claims (`:301`) + return
  `{ok:false}`**; the item is left **`quarantined`** by the trigger. Nothing re-invokes web_search /
  `discoverCorroborators` / a wider fetch on failure.
- ❌ **No "erase if fabricated/ungroundable" exists as wired code.** The strongest action is rollback-of-
  claims + quarantine; **the `full_brief` stays in place**. The one gate that could reject a fabricated
  brief — `checkBriefContent` in `src/lib/sources/fetch-quality.ts` — is **DEAD (zero importers).**
- The only "don't mint fabricated" logic, `entity-gate.mjs` (`isErrorBody`/`shouldMintItem`), is
  **ingestion-side** (prevents minting an item from an error body), not a generation-time erase.

**Net:** a brief that cannot be grounded is **quarantined and left sitting, not re-researched and not
erased.** This is the gap behind "quarantine kicks the can." The fix is two wired steps that don't exist:
(a) ground-failure → re-research (re-run discovery with widened scope) → re-ground; (b) still-ungroundable
→ erase the brief (or hard-fail-and-flag), never leave a fabricated brief quarantined.

**Quarantine-cause note (market 48%):** validate failures observed are `unlabeled_assertion` (crit 4),
`missing_required_slot` (crit 5), `ungrounded_url` (crit 2), `no_section_content`. NB the rollback deletes
the run-time claims, so a post-hoc probe sees `claims={}` — the rollback itself erases the diagnostic
breadcrumbs (an observability defect). Several quarantined "items" are non-items (SAFA no-content,
news-feeds, org-overviews) that should be **archived upstream**, not generated then quarantined.

---

## 3. MASTER DEAD LIST (no production importer/caller)

**Dead modules (src):**
- `src/lib/agent/source-pool.ts` — registry-pool builder; replaced by web_search discovery.
- `src/lib/agent/section-validator.ts` — superseded by registry/prose-extractor; also stale (14 vs 15 sec).
- `src/lib/agent/generation-config.ts` — **DEAD: canonical-pipeline re-declares `FETCH_CONCURRENCY`
  inline (`:47`) and never imports this.** (This is the file the operating-mechanism build created;
  rule 017's premise is not actually applied because the pipeline still reads `process.env` inline.)
- `src/lib/agent/extract-research-sections.ts` — superseded by `formats/research.ts` prose-extractor.
- `src/lib/sources/fetch-quality.ts` (`checkFetchQuality`, `checkBriefContent`) — never imported; the
  pipeline uses its own `>200ch`/`looksBlocked` filter. (This is the dead "reject fabricated brief" gate.)
- `src/lib/briefing/systemPrompt.ts` — "ready for Phase 3," never wired.
- `src/data/source-mapping.ts` (`URL_TO_SOURCE`) — migration artifact, no external importer.
- `src/data/seed-scoring-data.ts`, `seed-clusters.ts` `CLUSTERS` — unimported.
- `src/lib/verification.ts` + `src/lib/lineage.ts` — transitively dead (only importer is dead `ResourceDetail`).
- `src/types/intelligence.ts` converters (`resourceToIntelligenceItem`, `mapResourceType`,
  `mapPriorityToSeverity`, `LegacySourceMapping`) — migration-era / stub.
- `src/lib/llm/haiku-classify.ts` `__internals.{htmlToText,sha256Hex}` — orphaned post-`haikuClassify` removal.
- `.discipline/lib/adr-loader.mjs` — support for deleted attestation rules; its `.test.mjs` still runs in CI (tests dead code).

**Dead functions inside live files:**
- `src/lib/sources/reconcile.ts`: `recordItemChange`, `openSourceConflict`, `computeDiff`, `classifyChange`
  (only `recordSourceChangeTrigger` wired — via the DEAD `/api/worker/reconcile` route).
- `src/lib/trust.ts`: `evaluatePromotion`, `evaluateDemotion`, `evaluateProvisionalSource`,
  `computeConflictResolutionImpact`, `computeCitationComponentFromRows`.
- `src/lib/sources/url-canonicalize.ts`: `wwwNormalize`. `parse-output.ts`: `extractClaimLedger` (strict).

**Dead components (~19) + store + hook:** ResourceCard / ResourceDetail / ShareMenu / SectorSynopsis(View)
/ AcronymText (legacy card island); domains/{FacilityOptimization,RegionalIntelligence,TechnologyTracker}
(legacy domain views); ExportBuilder + `stores/exportStore` (dead pair); TabBar; ui/{Skeleton,PageContext,
UrgencyFilterBar}; explore/{SearchBar,SortSelector}; market/{FreightRelevanceCallout,OwnersContent};
community/NotificationPreferencesPanel; shell/PageMasthead. **CONFLICT to resolve:** `hooks/useScrollToResource`
— reader 4 found DEAD, reader 5 found WIRED (regulations/resource surfaces); re-confirm before deleting.

**Dead API routes (auth-gated but uncalled):** `api/worker/reconcile`, `api/notifications/trigger`,
`api/admin/sources/verify` (pipeline called in-process by discovery.ts), `api/admin/sources/recently-auto-approved`.

---

## 4. MASTER BROKEN LIST

- **`/events` → hard 404** (`src/app/events/page.tsx:13` `permanentRedirect("/community/events")`; that
  route does not exist; `next.config.ts` has no `redirects()`). Live customer-facing breakage. HIGHEST.
- **`src/__tests__/staged-updates-approval.test.ts`** — imports uninstalled `vitest`; un-runnable. No
  `test` script / vitest in package.json (so the whole `__tests__` vitest surface is non-executable;
  the `node --test` one (`leakage-fix-classifier`) does run).
- **`src/data/index.ts` supersessions mapper (45-53)** — sets both `old` and `new` to `s.newId`,
  collapsing the supersession edge. Latent (only consumed by dead `lineage.ts`).

---

## 5. MASTER ORPHANED LIST (built, real, but invoked by nothing recurring)

**Orphaned proofs (~20 selftests proving real invariants, run by nothing):** `verify.selftest`,
`verify-reconstruction`, `drift-check.selftest`+`-reconstruction`, `surface-registry.selftest`+
`-reconstruction`, `decision-anchors.selftest`, `decision-log-audit`, `exclusion-audit.selftest`+
`-reconstruction`, `liveness.selftest`+`-reconstruction`, `block1-reaudit`, `bootstrap-test1`,
`batch-primitives.test`, plus src `classify-source-role.selftest`, `instrument-identity.selftest`,
`reconcile.selftest`, `chip-selection.test`, `hooks.selftest`. The **entire D3 verification tier is
dormant**: its orchestrator `scripts/d3-run.mjs` is invoked by nothing, `--write` is off, and the
`d3_runs` heartbeat table (`scripts/d3-runs.ddl.sql`) was never applied. (7 selftests ARE wired — via
`bug-class-guard.yml` HARD job: inconclusive-probe, type-consumer-probe, reachability, entity-gate,
fetch-now-decision, check-sources-decision, verification-decision.)

**Orphaned DB objects (created, never read by app):** `active_intelligence_items` VIEW (116) — *the
originally-designed customer read-gate; the implementation routed around it via RPC predicates, leaving
the gate view dead*; `intelligence_item_versions` (053, write-only audit); `intelligence_summaries`
(009, 2325 rows, shelved by decision); `open_conflicts` VIEW (043).

**Superseded-but-confusing (multiple CREATE OR REPLACE — live def buried):** `validate_item_provenance`
114→119→**121**; `_workspace_active_items` 073→077→**117 (only the 117 copy carries the gate predicate)**;
`get_market_intel_items` 070→071→073→077→084→117→**125**; `get_research_items/get_technology_items`→
133→**134**; etc. Reading an early copy in isolation gives a false "ungated" alarm.

---

## 6. THE GOVERNANCE SYSTEM BUILT THIS SESSION — its OWN dead/drift (honest)

The operating-mechanism work is itself partially unwired — the same disease it was meant to cure:
- **`scripts/lib/anthropic.mjs` does NOT exist**, yet rule 016 allowlists it + its remediation tells
  authors to import `canonicalGenerate` from it, and `exemptions.mjs` exempts it. Phantom path.
- **`src/lib/agent/generation-config.ts` is DEAD** — the pipeline still reads `process.env` inline (`:47`),
  so rule 017's intent ("knobs live in the config") is not actually realised in the live pipeline.
- **`governance/coverage-scan.mjs` is orphaned** — manual-run only; its ~30-gap report is gated by nothing.
- **The skill-map PreToolUse auto-fire hook does NOT exist** — `skill-map.mjs` advertises a dual
  enforcement ("commit-verifier rules AND a PreToolUse auto-fire hook"). CORRECTED (verified 2026-06-06):
  a PreToolUse hook *does* exist, but **at the user level (`~/.claude/settings.json`, out of repo)** and it
  is a **Bash destructive-op guard** (matcher `Bash`; greps the command string for `update intelligence_items`
  / `set provenance_status` / `drop table` / `delete from` / `git push` / `seed/apply-` / `reconcile.*--execute`
  etc. → `permissionDecision:"ask"`, fail-closed). It is NOT the skill-map/Edit-Write auto-fire hook — that
  was never deployed; only the commit-time `.discipline` rules + this out-of-repo Bash guard run at/before
  action time. (The original audit said "no PreToolUse block in any settings.json" — that was a claim about
  the user-level file the reader never read; the substantive point, "no skill-map auto-fire hook," holds.)
- (Rules 015/016/017/018 + F10 + the commit/pre-push wiring ARE live and fire — confirmed by reader 6.)

---

## 7. OTHER CROSS-CUTTING FINDINGS

- **13-field metadata contract dropped by the live generate path:** `generateBrief` uses only
  `parsed.body`; severity/priority/topic_tags/signal_band/operational_scenario_tags/compliance_object_tags/
  related_items/intersection_summary are parsed then discarded — only `full_brief`+`updated_at` are written.
  So intersection-detection metadata + severity/priority are NOT persisted by canonical generation.
- **GroundingModel per format is decorative:** `groundBrief` always span-grounds regardless of
  `spec.grounding` ('corroboration'/'matrix' only manifest at render time, never as a generation switch).
- **Technology is a 6th customer surface** in primary nav (Sidebar:36), outside the binding five-surface
  model — sanction-or-fold decision outstanding.
- **Provenance gate is correct but STARVING:** until items are run through the grounding pipeline at
  scale, the honest corpus state is "nothing verified ⇒ customer RPCs return 0 rows." Corpus-completeness
  condition, not a wiring bug.
- **Seed-fallback latent dead code** in `supabase-server.ts` `fetchDashboardData`/`fetchMapData` timeout
  tuples (passes seedResources) despite the SF-2 "seed removed" claim; the empty-guard returns before seed
  reaches the UI, so latent not active. Worth cleaning to match the stated contract.

---

## 8. PRIORITISED FIX BACKLOG (derived from the audit)

1. **Wire research-or-erase** (the operator's core principle): ground-failure → re-research → re-ground;
   still-ungroundable → erase the brief (or hard-fail+flag), never leave a fabricated brief quarantined.
   Stop the rollback from erasing the diagnostic breadcrumbs.
2. **Fix `/events` 404** (restore `/community/events` or repoint to `/community`).
3. **Resolve the governance self-drift:** create `scripts/lib/anthropic.mjs` (or fix rule 016 + exemption);
   wire `generation-config.ts` into the pipeline (remove inline `process.env`); deploy the PreToolUse
   auto-fire hook or drop the claim from `skill-map.mjs`; decide coverage-scan's gate status.
4. **Persist the 13-field metadata** in the canonical generate path (intersection + severity/priority).
5. **Wire the high-value orphaned proofs** into `bug-class-guard.yml` (cheap, no-DB: verify, drift-check,
   surface-registry, decision-anchors, exclusion-audit, liveness, batch-primitives) + revive the D3 tier
   (apply `d3_runs`, schedule `d3-run --write`) OR record-exempt with reason.
6. **Technology surface** sanction-or-fold decision.
7. **Delete the dead** (modules, components, routes, `adr-loader`) per the repo's own Rule 11
   (deprecation = deletion), after resolving the `useScrollToResource` conflict.
8. **Archive the non-item quarantines** (feeds/org-overviews/no-content) upstream so they never generate.

---

---

## 9. OUT-OF-REPO DEPENDENCY SURFACE — the named boundary where in-repo governance ends

This audit is the definitive map **of the repository**. It is NOT a map of the out-of-repo harness +
runtime layer, and the app's behavior is partly governed there — where the in-repo governance layer
(skill-map, `.discipline` rules, coverage-scan) cannot see or enforce anything. The review-only residuals
keep landing on exactly this boundary. The full surface (read 2026-06-06):

1. **Harness hooks** — `~/.claude/settings.json` (USER level, out of repo): the **PreToolUse Bash
   destructive-op guard** (the only deployed action-time enforcement); `defaultMode:"dontAsk"`;
   `enabledPlugins` (superpowers/vercel inject skills + behavior); `additionalDirectories`. In-repo
   harness config exists too (`.claude/settings.json` = enabledPlugins; `fsi-app/.claude/settings.json` +
   `.claude/settings.local.json` = permissions) but the **hooks block is only in the out-of-repo user file**.
2. **Harness instructions** — `~/.claude/CLAUDE.md` (global prefs) + `~/.claude/projects/.../memory/**`
   (auto-memory) govern the agent's behavior; out of repo.
3. **Env vars (~40, Vercel + `.env.local`)** — secrets (legitimately out of repo: `ANTHROPIC_API_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET`, `RECONCILER_DB_PASSWORD`, `BROWSERLESS_API_KEY`) AND
   **behavior tunables that should be in-repo**: `BROWSERLESS_FETCH_CONCURRENCY` (generation concurrency —
   git-invisible, red-team Finding 1), `GENERATION_DAILY_CAP_USD` (the spend cap value).
4. **DB-stored config (Supabase)** — governs runtime behavior: `item_type_required_slots` (grounding
   criterion-5 requirements — seeded in-repo by migrations 113/126/129/130/131, good), `system_state`
   (global pause), `sources.processing_paused`/`auto_run_enabled`, `admin_action_cooldowns`,
   `sector_contexts`, `workspace_settings`, source tier overrides. Mutable-at-runtime by design.
5. **GitHub repo secrets** — `WORKER_SECRET`, `APP_URL`, `GITHUB_TOKEN`: referenced by CI workflows,
   stored in GitHub settings, not the repo.
6. **Vercel project config** — env injection + cron *scheduling* (vercel.json declares them in-repo, but
   the schedule + env live Vercel-side).
7. **Exposed credentials (security)** — `~/.claude/settings.json` `allow` list embeds a plaintext GitHub
   PAT and the Supabase **service_role JWT** (full DB write, RLS-bypass). Unguarded-DB-access residual.

### Why config falls out of the repo (root cause)
The repo is **not the only config source**. The harness reads hooks/instructions from user/project/local
scopes; the runtime reads tunables/secrets from env and operational config from the DB. For each, the
**path of least resistance lands outside the repo**: a hook is easiest to add in user-settings (applies
everywhere, no commit); a tunable is easiest as an inline `process.env.X` read; mutable config is easiest
as a DB row. The same gradient-expedience that bypassed `/api/agent/run` bypasses the repo as the config
home — and **nothing asserts "governance/config artifacts have an in-repo source of truth,"** so out-of-repo
authorship goes uncaught. (Concretely: the skill-map advertised "a PreToolUse hook" as part of the system,
but a PreToolUse hook's natural home is the out-of-repo user-settings file, and that was never reconciled;
`generation-config.ts` was built in-repo but left DEAD because the pipeline still reads `process.env` inline.)

### Prevention (so future-built artifacts can't fall out of the repo)
- **In-repo source-of-truth + thin out-of-repo pointer.** Any harness hook = a one-line settings entry that
  invokes an **in-repo** script (`command: node fsi-app/.discipline/hooks/<x>.mjs`); the logic + tests live
  in-repo and are version-controlled + governed. → Move the Bash-guard logic into an in-repo script the
  settings hook calls.
- **No raw `process.env` in governed paths** — behavior tunables become in-repo named constants
  (`generation-config.ts`); rule 017 enforces it (needs the pipeline actually wired to the config). Secrets
  stay in env (they're credentials, not behavior); document that split.
- **Behavior-defining DB config seeded by in-repo migrations** (as `item_type_required_slots` already is);
  operational toggles stay DB-only and are listed in this boundary doc.
- **A checked out-of-repo boundary manifest.** This §9 is that manifest; pair it with a check that (a) flags
  new `process.env.X` in governed code, (b) asserts settings hooks point at in-repo scripts, (c) requires any
  new out-of-repo dependency to be added here. The boundary becomes a reviewed artifact, not a blind spot.

*This document is the durable artifact of the full-codebase read. Every file was opened and read; the
DEAD/BROKEN/ORPHANED lists above are the actionable surface; §9 is the out-of-repo boundary the in-repo
governance layer cannot reach.*
