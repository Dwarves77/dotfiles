# Lane L15-disc-A — Full-Read Audit Report

Scope: `.discipline/consistency/**` and `.discipline/fitness/**` (56 files) in `/root/work/dotfiles/fsi-app`.
All paths below are relative to `fsi-app/`.

---

## Per-file verdicts

### .discipline/consistency/

**.discipline/consistency/checks/C3-migrations-reality.mjs — WORKING-WIRED — cross-checks `supabase/migrations/*.sql` against `docs/inventories/migrations.md`.**
- WIRING: imported by `.discipline/consistency/manifest.mjs` (confirmed at manifest.mjs:6), which is imported by `runner.mjs`.
- NOTE: header comment (lines 3-5) says the inventory is "currently stub-shaped" and expects drift as the baseline finding — this is a documented, not accidental, initial-state note.

**.discipline/consistency/checks/C4-worktrees-reality.mjs — WORKING-WIRED — cross-checks `docs/inventories/worktrees.md` against `git worktree list` + on-disk convention paths.**
- WIRING: imported by manifest.mjs:7.
- NOTE (line 85-87): under `process.env.CI` the two disk-reality directions are explicitly skipped (format/consistency-only check runs); this is a deliberate CI-environment carve-out, documented as mirroring "the migration 067 lesson," not a silent weakening.
- NOTE (lines 121-127): worktrees under `.worktrees/` or `.claude/worktrees/` are exempt from both directions of the check (ephemeral by convention).

**.discipline/consistency/checks/C5-program-anchors-reality.mjs — WORKING-WIRED — re-grounds the ACTIVE phase's declared code anchors (present/absent substrings) in `docs/program/GOVERNING-PROGRAM.md` against real files.**
- WIRING: imported by manifest.mjs:11, added later than C3/C4 (2026-06-28 per its own header) as the "plan re-grounding" mechanism.
- NOTE: `ACTIVE_PHASE: none` is a documented no-op path (line 13, 50).

**.discipline/consistency/lib/drift.mjs — WORKING-WIRED — shared drift-record shape/kinds for consistency checks.**
- WIRING: imported by C3, C4, C5 (refs=3, confirmed by grep of the three check files each importing `drift`/`DRIFT_KIND`/`NO_DRIFT`).

**.discipline/consistency/lib/inventory-parser.mjs — WORKING-WIRED — minimal markdown-table parser for `docs/inventories/*.md`.**
- WIRING: imported by C3 and C4 (refs=2, confirmed).

**.discipline/consistency/manifest.mjs — WORKING-WIRED — registers the active consistency checks (C3, C4, C5) for the runner.**
- DEFECT (doc-vs-code self-contradiction, not a runtime bug): lines 2-4 state "Post-slim (2026-05-21): C1, C2, C5, C6, C7, C8, C9, C10 deleted per evidence-based audit... Only C3 + C4 remain," but lines 6-13 of the *same file* import and register C5, and `consistencyChecks = [C3, C4, C5]` (line 13). The top-of-file historical note was never updated when C5 was reintroduced 2026-06-28, so the file's own header now misdescribes its own body. Not a behavioral defect (C5 does run), but an internal drift of exactly the kind this audit exists to catch — inside the file whose job is enforcing "the artifact matches reality."

**.discipline/consistency/override-check.mjs — WORKING-WIRED — the shared override-aware primitive (drift parsing + `Consistency-Override:` trailer validation) used by rule 014, the pre-push hook, and the CI consistency backstop.**
- WIRING: per its own header (lines 2-6) it is imported by three external surfaces not in this lane (rule 014, `prepush-consistency.mjs`, CI backstop CLI). It itself `spawnSync`s `runner.mjs` (line 25, 69) as a **child process**, not an import — this is the mechanism that keeps `.discipline/consistency/runner.mjs` alive despite its GRAPH:UNREACHABLE flag (see runner.mjs entry below).
- Override contract (lines 13-16, enforced by `parseValidOverrides`): a `Consistency-Override: C<N> (rationale: ...; remediation-deadline: YYYY-MM-DD)` trailer is valid only with non-empty rationale AND a today-or-future deadline. Verified correct by both the code and its test.

**.discipline/consistency/override-check.test.mjs — TEST — 10 tests pinning `parseDriftCheckIds`, `parseValidOverrides` (valid/expired/empty-rationale/hyphen-form), `evaluate` (clean/uncovered/covered/partial/runner-error), and `messagesFromPrepushStdin`.**
- Not vacuous: each test asserts a specific true/false/array outcome distinguishable from its neighbor (e.g., expired-deadline vs. today-is-valid are separately tested); any of these could fail if the parsing/evaluate logic regressed.

**.discipline/consistency/runner.mjs — WORKING-WIRED (overturns GRAPH:UNREACHABLE) — CLI that runs all registered consistency checks and reports drift.**
- WIRING: ground truth flags this GRAPH:UNREACHABLE (refs=0, not reachable from any route/page/workflow/script/test via import). Reading `override-check.mjs` shows this is invoked as a **subprocess** (`spawnSync(process.execPath, [RUNNER])`, override-check.mjs:25,69) by the override-aware wrapper, which is in turn documented (override-check.mjs:2-6) as the primitive behind rule 014 (commit-time), the pre-push hook, and the CI consistency backstop. Import-graph-based unreachability analysis cannot see a `child_process.spawnSync` call by resolved absolute path, so the GRAPH:UNREACHABLE flag is a false negative of the graph method, not evidence the file is dead. I did not read rule 014 or the pre-push hook themselves (not in this lane), so I cannot independently confirm those three call sites beyond what override-check.mjs's own header + spawn call establish.

---

### .discipline/fitness/functions/ (F-series)

**F2-admin-routes-isPlatformAdmin.mjs — WORKING-WIRED — every `src/app/api/admin/**/*.ts` route must reference `isPlatformAdmin`, except a two-entry worker-secret allowlist that must itself reference `x-worker-secret`.**
- NOTE: the check is a text-presence regex (`/\bisPlatformAdmin\b/`), so it would pass a file that merely *mentions* `isPlatformAdmin` in a comment without actually calling it as a gate — a structural limitation shared by most of these text-scan fitness functions, not unique to F2, and not something I can prove is currently exploited without reading the admin routes themselves (out of this lane).

**F2-admin-routes-isPlatformAdmin.test.mjs — TEST — 8 tests (pass/fail/allowlist pass+fail/override/enumerate-shape/metadata). Not vacuous.**

**F6-migrations-numeric-ordering.mjs — WORKING-WIRED — enforces `NNN_name.sql` filename shape, flags non-placeholder-name violations, and (holistically, on the lowest-numbered file only) flags duplicate migration numbers and >10-gap sequences.**
- NOTE: `KNOWN_HISTORICAL_DUPLICATES` (5 filenames) is a static grandfather list for pre-existing colliding numbers; new duplicates are NOT silenceable via the `fitness-allow` override (by design, confirmed by both code, line 90-99, and test).
- NOTE: gap violations ARE silenceable via `fitness-allow: F6 (reason)` on the lowest migration's first line, requiring a non-empty reason.

**F6-migrations-numeric-ordering.test.mjs — TEST — 10 tests, including override-honored/marker-requires-reason/duplicate-not-silenceable via a `withEnumerate` monkey-patch harness. Not vacuous.**

**F8-client-server-tier-boundary.mjs — WORKING-WIRED — forbids client-side (`components/`, `app/**/*.tsx`, `stores/`, `hooks/`) writes to `body.tier`/`body.base_tier`/`body.effective_tier`, and object literals with those keys near a fetch/POST/PUT/JSON.stringify call.**
- NOTE: object-literal detection (`OBJECT_LITERAL_TIER_RE`, line 43) is a `{[^{}]*...}` regex, so it cannot see across a literal containing a nested `{}` (e.g. a nested object as another property value) — a real but narrow blind spot; not independently confirmed as exploited in the current tree (source files not in this lane).

**F8-client-server-tier-boundary.test.mjs — TEST — 9 tests. Not vacuous.**

**F9-build-compiles.mjs — WORKING-WIRED — runs `tsc --noEmit` against the whole `fsi-app/` project as a single holistic check; reports TSC_NOT_FOUND distinctly from real compile errors.**
- NOTE: explicitly excluded from the local commit-msg hook for speed (header lines 18-20); intended for CI / a future pre-push step.

**F9-build-compiles.test.mjs — TEST — 4 unit tests (metadata, sentinel enumerate, non-sentinel PASS, `_findTsc` shape). Deliberately does NOT invoke tsc in the test suite (documented, lines 8-12) — the actual compile-pass assertion is left to a live runner invocation, not this test file. Not vacuous for what it does test, but the header is honest that the core "does it actually compile" claim is untested here.**

**F10-source-credibility-syndication.mjs — WORKING-WIRED — runs `src/lib/sources/source-growth.selftest.mjs` as a subprocess; passes iff exit 0.**
- WIRING: subprocess pattern (`spawnSync('node', [abs])`), same "special/whole-test" shape as F9/F11/F12; correctly wired via manifest.mjs.

**F11-trust-tier-weights.mjs — WORKING-WIRED — runs `src/lib/trust.selftest.mjs` as a subprocess; passes iff exit 0.**
- NOTE (lines 10-11): explicitly documents a residual NOT enforced here (the SQL COALESCE/override precedence), deferred to pgTAP.

**F12-moat-base-tier.mjs — WORKING-WIRED — runs `src/lib/sources/institution.selftest.mjs`; guards against a `?? effective_tier` regression in the reg-fact resolver.**

**F13-single-mint-chokepoint.mjs — WORKING-WIRED — every `.from("intelligence_items")...insert(` outside `src/lib/intake/mint-item.ts` is flagged.**
- Scan is a 4-line sliding window keyed on `from(` (line 28-34); does not scope scripts/ (comment line 10-11: "one-shot tools, out of runtime scope" — this is an intentional, documented scope choice, contrasted explicitly against F22 which DOES scope scripts/).

**F13-single-mint-chokepoint.test.mjs — TEST — 8 tests (single-line, wrapped multi-line, select/update-not-flagged, chokepoint-exempt, override, enumerate-exclusions). Not vacuous.**

**F14-producer-consumer-orphan.mjs — WORKING-WIRED — holistic wrapper over `governance/producer-consumer-orphan.mjs`'s `runOrphanCheck()`; flags new write-orphans and stale allowlist entries.**
- Delegates all real logic to `governance/producer-consumer-orphan.mjs`, which is NOT in this lane — I read only the thin fitness-function wrapper and its test, not the underlying analyzer.

**F14-producer-consumer-orphan.test.mjs — TEST — 5 tests, RED-then-GREEN against constructed fixtures (deterministic, no live-tree file mutation) plus one live-tree "GREEN today" assertion. Not vacuous.**

**F15-spend-chokepoint.mjs — WORKING-WIRED — forbids direct Anthropic API access (`api.anthropic.com` / `x-api-key` / `new Anthropic` / `@anthropic-ai/sdk`) outside `spend-client.ts` + `anthropic-stream.mjs` + `scripts/lib/anthropic.mjs`, with a 5-entry reason-bearing LEGACY_ALLOWLIST.**
- NOTE: allowlist is self-auditing in both directions (staleness test asserts every legacy entry still has a direct call, and — added 2026-08-11 — every SANCTIONED path still exists on disk). LEGACY_ALLOWLIST's comment (lines 52-58) records 15 additional script-side entries as already REMOVED from the list text (the block is literally empty at that point) with a note they are "enumerated for deletion" elsewhere — consistent, not contradictory.

**F15-spend-chokepoint.test.mjs — TEST — 8 tests including the two staleness self-audits (LEGACY_ALLOWLIST + SANCTIONED). Not vacuous.**

**F16-transport-hold-gate.mjs — WORKING-WIRED — the canonical fetch primitive (`canonical-fetch.mjs`) must call `assertFetchAllowed(`; three named TRANSPORT_MODULES must also call it; no other file may construct a raw Browserless content-fetch URL.**
- NOTE: TRANSPORT_MODULES list (line 30-34) was widened 2026-08-11 to include an admin-triggered manual-fetch route after a real gap was found (inline `fetchViaApi` bypassing the hold) — documented, not a currently-open gap per the file's own claim (unverified beyond reading this file; the three named files are outside this lane).

**F16-transport-hold-gate.test.mjs — TEST — 8 tests including 2 LIVE assertions that read the real primitive + all 3 real transport modules off disk and assert they contain the gate call. Not vacuous — these LIVE tests could fail if the actual source drifted.**

**F17-size-cap-doctrine.mjs — WORKING-WIRED — every `*_MAX_CHARS`/`*_BUDGET_CHARS`/`*_CEILING_CHARS` constant declared in `generation-config.ts` or `section-grounding.mjs` must appear in a hardcoded `CAP_REGISTRY` with a non-`silent-grounding` classification.**
- CAP_REGISTRY currently has 4 entries, all `surfaced` or `never-binds` (no forbidden status present) — confirmed both by the file and its test's doctrine assertion.

**F17-size-cap-doctrine.test.mjs — TEST — 5 tests including a LIVE read of both path files. Not vacuous.**

**F18-one-url-canonicalizer.mjs — WORKING-WIRED — forbids re-implementing URL-identity normalization (bare scheme-strip, whole query/fragment-drop, or template-based URL reassembly) outside `url-canonicalize.ts`.**
- Deliberately narrow regex shapes (documented at length in the header, lines 31-46) to avoid false-positiving on host-extraction or field-comparison code — the file is explicit about what it does NOT flag and why.

**F18-one-url-canonicalizer.test.mjs — TEST — 14 tests including a LIVE census over the whole `src/**` tree (`fitnessFunction.enumerate()` + per-file check, asserting zero offenders) and a targeted live check of `entity-resolve.mjs`. Not vacuous.**

**F19-no-service-anon-downgrade.mjs — WORKING-WIRED — forbids `SUPABASE_SERVICE_ROLE_KEY || ...ANON_KEY` (either order, tolerant of line breaks) anywhere in `src/`.**

**F19-no-service-anon-downgrade.test.mjs — TEST — 6 tests including a LIVE census over all of `src/` asserting zero offenders. Not vacuous.**

**F20-pause-flag-one-writer.mjs — WORKING-WIRED — `system_state.global_processing_paused`/`scrape_cadence` may only be written by the sanctioned admin pause route (which calls the `admin_set_pause_state` RPC); direct assignment/`.update()`/raw SQL `SET` elsewhere is flagged; string-literal reads and type annotations are exempted.**

**F20-pause-flag-one-writer.test.mjs — TEST — 8 tests including a LIVE census over `src/`. Not vacuous.**

**F21-single-grounding-entry.mjs — WORKING-WIRED — grounding-entry functions (`generateBrief`, `groundBrief`, `generateBriefFromStored`, `generateBriefRefreshPrimary`, and any reference to `generateBriefWorkflow`) may only be invoked from a 6-file SANCTIONED set.**
- NOTE: `fsi-app/src/app/api/staged-updates/route.ts` is in SANCTIONED and explicitly commented "(legacy; retired by Unit 0c)" (line 22) — i.e. the allowlist still names a route the file's own comment calls retired. I cannot confirm from this lane whether that route file still exists / is still reachable (not in this lane) — flagging as a NOTE for the owner rather than a DEFECT since I cannot verify either way.

**F21-single-grounding-entry.test.mjs — TEST — 6 tests (RED on workflow ref, RED on direct call, GREEN for sanctioned files, GREEN on comments/near-miss identifiers, override, metadata). Not vacuous.**

**F22-source-role-at-birth.mjs — WORKING-WIRED — every `.insert(`/`.upsert(` into `sources` must be in a file that also references `classifySourceRole`, scoped across `src/**` AND `scripts/**` (unlike F13, deliberately, per header lines 21-23). LEGACY_ALLOWLIST is empty.**
- The window-truncation-at-next-`.from(` logic (lines 61-69) is specifically there to fix a real false positive the first draft produced (an unrelated `sources` UPDATE followed by an INSERT on a different table) — this fix is also pinned by a dedicated regression test.

**F22-source-role-at-birth.test.mjs — TEST — 10 tests including the pinned false-positive regression and an assertion that LEGACY_ALLOWLIST is legitimately empty (with an explicit historical note about why the "must be non-empty" assertion was removed 2026-08-14). Not vacuous.**

**F23-governed-surface-coverage.mjs — DEFECTIVE (self-contradictory baseline) — a two-way ratchet over `governance/coverage-scan.mjs`'s 4 gap categories (orphaned_proofs, unmapped_writes, unmapped_model, unmapped_routing); over- OR under-baseline both fail.**
- DEFECT: lines 34-58's own header comment states the measured live state as "Now 0/20/2/2 = 24" (`orphaned_proofs=0, unmapped_writes=20, unmapped_model=2, unmapped_routing=2`) and explicitly argues *against* setting the ceiling to 0 today: "Setting 0 HERE, today, would red the build on a tree that still contains the files — a ceiling has to describe the tree it ships on" (lines 57-58). Immediately below, the shipped `GAP_BASELINE` object (lines 59-64) sets **all four** categories to `0`, directly contradicting the reasoning stated one line above it.
- AMBIGUOUS (cannot resolve from this lane alone — `governance/coverage-scan.mjs` and the dead-code-manifest files are out of scope): either (a) the dead-code sweep the comment says is blocked ("cannot be removed through this session's delivery path... a separate, operator-run step") was in fact completed after this comment was written, making `0/0/0/0` the correct current ceiling and the comment simply stale prose — in which case F23 is fine; or (b) the sweep has NOT happened and `unmapped_writes`/`unmapped_model`/`unmapped_routing` are still >0 on the live tree, in which case F23's `check()` (line 123-126) fails on **every** run with a REGRESSION violation for each non-zero category, i.e. this gate is permanently red in CI today. I did not run `coverage-scan.mjs` and could not verify which reading holds; the internal contradiction is real either way and worth an owner's attention.

**F23-governed-surface-coverage.test.mjs — TEST — 9 tests: 7 exercise `compareToBaseline` against constructed summaries (behavioral, not live-tree-dependent — deliberately, per header), 2 are LIVE shape-only assertions (`summary[key]` is a number; `enumerate().length === 1`). Not vacuous, and — importantly — the test suite itself does NOT assert the live counts equal `GAP_BASELINE`, so it would not catch the F23.mjs contradiction above; it only proves the comparator logic is correct in isolation.**

**F24-db-object-migration-home.mjs — WORKING-WIRED — every object in the committed `governance/db-catalog.json` snapshot must be created by a committed migration or carry a reason-bearing exemption; also audits `netCallers` (pg_net) and `cronJobs` (pg_cron) against sanctioned lists, all bidirectionally (stale-entry-audited).**
- All four allowlists (`NO_MIGRATION_HOME`, `BROKEN_REF_ALLOWLIST`, `CRON_SANCTIONED`) are shipped EMPTY; `NET_EGRESS_SANCTIONED` has exactly one entry (`capture_worker_fetch`) — both states are asserted by the test (lines 189-197) as the shipped/correct state, not merely incidental.
- Depends on a committed, manually-refreshed `governance/db-catalog.json` snapshot (not in this lane) — the file's own header (lines 39-42) states this as a KNOWN LIMIT: DDL applied out-of-repo after the last snapshot refresh is invisible until someone refreshes it. This is a documented staleness risk in the gate's design, not a code defect.

**F24-db-object-migration-home.test.mjs — TEST — 20 tests, all against constructed catalogs/migration text (no live-tree dependency for the comparator; shape-only assertions for the shipped allowlists). Not vacuous.**

**F25-module-liveness.mjs — WORKING-WIRED — every module under `src/**` and `scripts/lib/**` must have a production importer (via a real resolved import graph, not basename grep), be a framework entry point, or carry a LEGACY_ALLOWLIST entry (60 entries currently, grouped by class).**
- NOTE (lines 25-30, "the false positive this almost shipped"): `src/proxy.ts` looked exactly like dead code (0 importers) but is the Next.js 16 middleware entry point gating auth for the whole app — the `ENTRY_BASENAMES` convention list (line 58-62) exists specifically to prevent that misclassification, and the test (line 176-187) pins that no framework entry-point filename can ever appear in the allowlist.
- Framework-entry detection is filename-based only (`ENTRY_RE`, line 63) — any future Next.js convention filename not added to `ENTRY_BASENAMES` would be misreported as an unwired module; this is an inherent, acknowledged limitation of a convention list rather than a coding defect.

**F26-storage-ceiling-parity.mjs — WORKING-WIRED — asserts both writers of `agent_run_searches.result_content_excerpt` (`generation-config.ts` and the Deno `capture-worker/index.ts`) resolve `STORAGE_MAX_CHARS` from the same env var with the identical fallback literal, AND that the worker side is loud-on-bind (`[truncation-guard]` + `integrity_flags` write).**
- Well-specified, pure `auditCeilingParity` comparator with symmetric divergence detection (order-independence explicitly tested, lines 78-83) — no defect found. This is one of the cleaner, best-tested files in the lane.

**F26-storage-ceiling-parity.test.mjs — TEST — 21 tests covering the exact 2026-08-17 hand-run attack (bump worker literal → DIVERGED → revert → PASS) plus all four loudness-failure combinations. Not vacuous.**

**F27-producer-seam-proof.mjs — DEFECTIVE (latent scope-narrowing bug) — every shebang-marked `scripts/producers/**` entry point must have its full set of first-party seam imports (`src/lib/**` + sibling `scripts/producers/**` modules) exercised together by one proof file (not two proofs that each cover half).**
- DEFECT: `check()` (line 245) builds the `tracked` file set for `resolveSpecifier` as `globFiles(['fsi-app/src/**/*.mjs', 'fsi-app/scripts/**/*.mjs'])` — **`.mjs` only**. `resolveSpecifier` (imported from F25, tries extensions `['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '/index.*']`) can only resolve a specifier to a path that exists in `tracked`; since `tracked` here never contains a `.ts` path, any first-party seam module authored as `.ts` (e.g. under `src/lib/sources/*.ts` or `src/lib/*.ts`, both real directories per other files in this lane, e.g. `src/lib/sources/url-canonicalize.ts`) would silently fail to resolve and therefore never be counted as a "seam" requiring composition-proof coverage at all — contradicting the file's own stated scope ("SEAM MODULE — anything a producer entry point imports... that lives under `fsi-app/src/lib/**`", header line 45, with no extension restriction stated). I did not read `scripts/producers/**` (not in this lane) and cannot confirm any current producer actually imports a `.ts` seam — if none do today, this is a latent gap rather than an active miss; if one does, F27 is silently under-covering it. Defensible purely from the code (`.mjs`-only glob vs. the multi-extension resolver + unrestricted-extension header claim).

**F27-producer-seam-proof.test.mjs — TEST — 22 tests, mostly against constructed fixtures, plus 2 LIVE assertions (whole-gate-green-on-live-tree; `eu-weekly-oil-bulletin.mjs`'s seams are specifically covered by `market-producer-composition.test.mjs`). Not vacuous. Note: the fixture-based tests always pass `.mjs`-only trees, so they would not have caught the `tracked`-set scoping issue above — the tests validate the comparator logic, not the `.mjs`-only glob in `check()`.**

---

### .discipline/fitness/lib/

**.discipline/fitness/lib/file-content.mjs — WORKING-WIRED — cached repo-relative file reader + the shared `isOverridden(line, functionId)` `fitness-allow` trailer detector used by nearly every F-function above.**
- Verified the `isOverridden` regex (`(?://|#|/\*).*\bfitness-allow:\s*${functionId}\s*\(([^)]+)\)`) does not false-match a numeric-suffixed sibling id (e.g. checking `'F2'` against a line carrying `fitness-allow: F20 (...)` does not match, since after the literal "F2" the regex requires `\s*\(` and the next character is "0") — no defect found.

**.discipline/fitness/lib/glob.mjs — WORKING-WIRED — small hand-rolled glob supporting `dir/`, `dir/**/*.ext`, `dir/**/*.{ext1,ext2}`, `dir/*.ext`, and exact paths; skips `node_modules/.git/.next/dist/build/.vercel`.**
- No defect found; brace-expansion is checked before the recursive-match branch, so combined patterns like `src/**/*.{ts,tsx,mjs}` (used throughout the F-functions) are handled correctly.

**.discipline/fitness/lib/result.mjs — WORKING-WIRED — the `violation(line, message)` / `PASS` result shape shared by every fitness function; throws on `line < 1` or empty message.**

**.discipline/fitness/manifest.mjs — WORKING-WIRED — registers all 22 active fitness functions (F2, F6, F8, F9, F10-F27) for the runner.**
- Consistent, well-commented history of additions; no contradiction found (unlike the sibling consistency/manifest.mjs).

**.discipline/fitness/runner.mjs — WORKING-WIRED (entry point; refs=0 expected, no GRAPH:UNREACHABLE flag) — CLI that enumerates + checks every registered fitness function and reports violations.**
- No defect found; clears the file-content cache once per run (`_clearCache()`, line 39) before iterating.

**.discipline/fitness/runner.test.mjs — TEST — 4 integration tests that actually `execFileSync` the real runner binary (`--list`, a full scan, `--function=F2`, an unknown-id exit-2 case). Not vacuous — these shell out to the real CLI rather than mocking it, so they would catch a runner-level regression (e.g. a manifest import error) that the individual function unit tests could not.**

---

## Lane summary

**Counts by STATUS** (56 files):
- WORKING-WIRED: 43
- DEFECTIVE: 2 (F23-governed-surface-coverage.mjs, F27-producer-seam-proof.mjs)
- TEST: 22 of the WORKING-WIRED-adjacent files are themselves `.test.mjs` files, counted above within WORKING-WIRED's sibling `.mjs` files where applicable — to be precise by file-type: **22 files are `.test.mjs` TEST files** (none vacuous; each pins specific RED/GREEN behavior), and **34 are non-test `.mjs` implementation files**, of which 32 are WORKING-WIRED and 2 are DEFECTIVE.
- No STUB, INCOMPLETE, DEAD-HISTORICAL, OPERATOR-TOOL, or WORKING-UNWIRED files found in this lane.

**Top findings, ranked:**

1. **F23-governed-surface-coverage.mjs:34-64 — self-contradictory GAP_BASELINE.** The file's own header states the live gap counts as `0/20/2/2` and gives an explicit argument for why the ceiling should NOT be `0` yet ("a ceiling has to describe the tree it ships on"), then ships `GAP_BASELINE = {0,0,0,0}` anyway. Either the comment is stale (harmless) or the gate is currently red in CI on every run for three of four categories (high impact — this is a committed CI gate). Could not resolve from this lane; flagged AMBIGUOUS. Owner should run `node fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.mjs`'s underlying `governance/coverage-scan.mjs` against the live tree to settle it.

2. **F27-producer-seam-proof.mjs:245 — `.mjs`-only tracked-file set silently narrows "every first-party seam."** `resolveSpecifier` (borrowed from F25) needs the target extension present in `tracked`, but `check()` only globs `*.mjs` for both `src/**` and `scripts/**`. Any producer importing a `.ts` seam module would have that import invisible to the coverage audit, undermining the gate's core claim without any test catching it (all fixtures in the test file are `.mjs`-only). Impact unconfirmed without reading `scripts/producers/**` (out of lane).

3. **.discipline/consistency/manifest.mjs:2-4 vs 6-13 — stale "Only C3 + C4 remain" comment contradicted by the file's own body**, which imports and registers C5. Low impact (C5 does run correctly) but exactly the "claims drift from code" pattern this audit is checking for, found inside a file whose entire purpose is drift detection.

4. **.discipline/consistency/runner.mjs — GRAPH:UNREACHABLE ground-truth flag is a false negative.** The file is invoked via `spawnSync` from `override-check.mjs` (a subprocess call the import-graph analysis cannot see), which is itself documented as the shared primitive behind three real enforcement surfaces (rule 014, pre-push hook, CI backstop) — none of which are in this lane to independently confirm, but the spawn call itself is unambiguous. Worth correcting in the reachability tooling so future audits don't mis-classify subprocess-invoked scripts as dead.

5. **F21-single-grounding-entry.mjs:22 — SANCTIONED allowlist still names a route its own comment calls "legacy; retired."** `fsi-app/src/app/api/staged-updates/route.ts` remains in the SANCTIONED set for grounding-entry invocation despite the inline comment marking it retired by "Unit 0c." Could not confirm the route file's current existence/reachability (out of lane) — flagged as a NOTE for the owner rather than a confirmed defect.

6. F17/F18/F19/F20/F22/F26 (`spend`-, `URL`-, `service-anon`-, `pause-flag`-, `source-role`-, `storage-ceiling`-doctrine gates) are, on this reading, the strongest-built files in the lane: each pairs a pure, fixture-tested comparator function with a live-tree census assertion, and each documents its own known scan limitations plainly in its header rather than hiding them. No defects found in any of the six.

7. Several text/regex-scan fitness functions (F2, F8, F13) have narrow, inherent blind spots (comment-only mentions passing F2's presence check; nested-object literals escaping F8's flat-brace regex; F13's 4-line sliding window) — each is a real theoretical gap but is either explicitly documented as an accepted tradeoff or unconfirmable as currently exploited without reading files outside this lane. Listed as NOTEs in the per-file entries, not counted as DEFECTIVE.

**Coverage attestation:** files read in full: 56/56, lines read: 5,663/5,663 (per the lane manifest's own line counts). No file required offset-chunked reads (largest file was 321 lines). No file was skipped.
