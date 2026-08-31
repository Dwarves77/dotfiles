# Full-read audit — every line, every active part (2026-08-31)

**Method.** Nineteen Sonnet read lanes, each assigned a disjoint slice of the codebase with a binding
brief: read every line, cite file:line for every claim, docs/plans and the session log inadmissible as
evidence. Coverage attested per lane: **1,199 files, 191,348 lines, 100% read** (162,471 lines of
TS/TSX/MJS/shell + 28,877 lines of migration SQL). Before the lanes ran, the coordinator built two
mechanical ground truths the lanes verified against: a full import/reachability graph (953 modules, 373
entry points, resolving Next.js routes, GitHub workflows, package.json, git hooks, test globs) and a
live-DB census (90 tables, exact row counts, per-table code-reference counts). After the lanes returned,
the coordinator re-verified the highest-impact claims directly against code and the live database; two
lane findings were refuted and are recorded as corrections (§9), the rest of the headline findings were
confirmed line-by-line. Per-file verdicts for all 1,199 files: `docs/audits/full-read-2026-08-31/`
(19 lane reports, one per slice).

**Live DB baseline used throughout:** intelligence_items 1,062 · sources 2,557 ·
section_claim_provenance 19,287 · item_cross_references 1,929 · agent_runs 23,564 · integrity_flags
3,793 · plus the 0-row and orphan tables detailed in §6-§7.

---

## 1. Verdict

This is not a non-working tool, and it is also not a finished one. What the full read shows is a
**working core with a specific, now-enumerated perimeter of broken, unfinished, unwired and dead
parts**:

- **The core intelligence pipeline works and is wired end-to-end**: intake → mint → grounding →
  provenance validation → surface routing → the four detail surfaces → admin queues. The four
  customer surfaces (regulations, market, operations, research) render, are populated, carry the
  connections card and relevance lens, and their read paths are org-scoped. The governance layer
  (discipline suite, fitness functions, consistency checks, goldens) is real, wired into CI, and its
  tests are not vacuous — lane after lane confirmed tests that genuinely fail on regression.
- **The community surface is engineered but effectively unused and its front door is broken** (§2.1).
- **A second tier of features is fully built and has never run in production** — 0 rows behind wired
  code (§6).
- **A third tier is built, tested, and wired to nothing** — the code equivalent of inventory (§4).
- **~1,900 lines are confirmed dead** (§5).
- **Six wired defects** need fixes (§2).
- **The compounding loop (U7) and the spec-08 propagation layer remain unbuilt** — unchanged from the
  pre-audit finding, now confirmed by full read rather than targeted read.

Counts across all lanes: **WORKING-WIRED 555 · TEST/TEST-ONLY 271 · OPERATOR-TOOL ~50 ·
WORKING-UNWIRED 45 · INCOMPLETE 10 · DEFECTIVE 4 files (6 defects) · DEAD ~25 files + in-file dead
code · DEAD-HISTORICAL ~9 · migrations 241 files inventoried separately.**

---

## 2. DEFECTS — wired and wrong (coordinator-verified, ranked)

### 2.1 Community sidebar 404s on every group link — **the feature's front door is broken**
`src/components/community/CommunitySidebar.tsx:603` links every Starred/Private/Public group row to
`/community/groups/${slug}`. No such route exists — `src/app/community/` contains only `[slug]`,
`browse`, `moderation`, `page.tsx`. Every click 404s. The sidebar is mounted by `CommunityShell`,
which every community page renders. **Fix: one-line href change to `/community/${slug}`** (verify the
`[slug]` route's param semantics first). This, together with §6's zero-row community tables, is the
strongest single explanation of "built but nobody can use it."

### 2.2 Promotion audit trail stamps a hardcoded date
`src/app/api/admin/sources/promote/route.ts:177`: every promoted source's `notes` says "Promoted from
provisional **2026-04-28**" — a literal, while the computed `now` (line 93) goes unused in the string.
Sibling routes (`bulk-approve`, `decide`) do it correctly. Every promotion since April carries a false
audit date.

### 2.3 Two demotion triggers can never fire
`src/lib/trust.ts:438-442` (`critical_conflict`) and `:463-465` (`paywall_introduced`) are
comment-only switch cases — `evaluateDemotion` can never fire either trigger despite both being named
in the demotion vocabulary. Either implement (conflict data / paywall events are available in
`source_trust_events`) or remove them from the advertised trigger set.

### 2.4 Tier badges silently vanish for T6/T7 sources
`src/components/regulations/sections/SourcesList.tsx:20-26`: `TIER_STYLE` covers tiers 1-5; a tier-6/7
citation renders no badge at all. Every other tier-badge component clamps 1-7 with a fallback.

### 2.5 Coverage-gap flags from the flywheel writer carry a wrong subject_type
`src/lib/connections/gaps.mjs:104-105` writes `subject_type: "item"` with `subject_ref` = a
`connection_themes` id — a real defect, fixed in Wave A2. **CORRECTION (coordinator, post-audit,
verified live): the blast radius is 3 rows, not 198.** The 198 open `coverage_gap` flags come from
many writers (citation-harvest, gate_a_verifier, authorship shards, …) with valid subject_types; only
the 3 rows in the `flywheel-gap:%` namespace carried the mismatch, and they are backfilled to
`system`. The original "all 198" line joined two separate lane facts without checking the join.

### 2.6 Latent, currently-harmless: path-stripping bug in dead variable
`.discipline/governance/wire-pretooluse-settings.mjs:38`: unused `canonicalCommand` strips the leading
`/` from an absolute path; if ever swapped in for `cmdWin`, the hook silently degrades to "ask" every
time. Delete the dead variable.

---

## 3. INCOMPLETE — visibly unfinished, in the code's own words

1. **U7 / graph-feeds-briefs does not exist.** `synthesiseAndWriteBrief`
   (`canonical-pipeline.ts:695-753`) reads no connection table; `CURRENT_SKILL_CONTRACT_VERSION`
   unchanged at `"2026-05-27"` (`contract-version.mjs:13`). Briefs feed the graph; the graph never
   feeds a brief. The one piece that makes the flywheel compound. Code, not spend.
2. **3 of 4 market-series producers are declared stubs** — `series-registry.mjs`: `eex-eua`,
   `ecb-fx`, `eia-v2` all `implemented: false`; `market_series` = 6 rows, all from the one real
   producer (EU Oil Bulletin).
3. **`refresh-published-price-statistics.mjs`** — `SERIES_ITEM_MAP` deliberately empty pending
   operator ratification; every refresh outputs `[]`. `published_price_statistics` = 4 rows, written
   by something else.
4. **Invitation email never delivers** — `send-invitation-email.ts` always returns
   `delivered:false`; no email provider exists anywhere in the codebase. With `org_invitations` = 0
   rows, no real invite has ever gone out.
5. **`mute_user` moderation action** — disclosed Phase-D stub
   (`community/moderation/reports/[id]`).
6. **Onboarding "Primary region"** collected, never persisted (`OnboardingWizard.tsx` —
   `persistIdentity()` writes only `full_name`/`updated_at`).
7. **Research pipeline items**: `owner` hardcoded `null`, `partnerFlagged` hardcoded `false`
   (`src/app/research/page.tsx:95-96`).
8. **Saved searches** capture only free text — modes/topics/jurisdictions always `[]`; localStorage
   only (`SavedSearchesSection.tsx`).
9. **`CoverageCatalogueView.tsx`** promises promotion controls ("mount here alongside") that do not
   exist in the file; `promotion_policy` = 0 rows.
10. **`RoleBadge`/`VerifierBadge`** are fed a field the posts API never projects — permanently null
    until the route widens its SELECT (`Post.tsx:174-200` vs `api/community/posts/route.ts`).

**Spec-08 (decision propagation)**: no `entities` table, no outbox, no DAG, no state machine, no
statutory/estimate isolation, no antitrust gates. Confirmed unbuilt in both code and live schema.

---

## 4. BUILT, TESTED, WIRED TO NOTHING (working code with zero production callers)

The codebase's own F25 module-liveness gate tracks four of these in a `PROVEN_BUT_UNWIRED` allowlist
(`.discipline/fitness/functions/F25-module-liveness.mjs:80-82`) — the pattern is known, not hidden:

| Module | What it is | Note |
|---|---|---|
| `src/lib/llm/program-total.mjs` | pagination fix for the real 1000-row PostgREST cap under-count | `agent_runs` = 23,564 rows, 23× past the cap; **`seedSpend()` has no caller anywhere** (coordinator-verified) — the paginated total protects nothing |
| `src/lib/llm/spend-gauge.mjs` | spend gauge | same stack, same state |
| `src/lib/llm/metered-emit.mjs` | metered batch emitter | its guard `metered-gate.mjs` is wired but guards this dead end |
| `src/lib/agent/derived-consistency.mjs` | DERIVED-mint consistency check | its own header claims callers it does not have |
| `src/lib/dashboard/credibility.ts`, `critical-items.ts` | dashboard features | `critical-items` claims to "replace" copy it never replaced |
| `src/lib/coverage/identity.mjs` | CELEX/ELI identity classifier | only its own test imports it; something else stamps `census_worklist.identity_scheme` (21,609 rows) — writer not found in repo |
| `src/lib/export/download.ts` | CSV export | sole caller `BulkSelectBar.tsx` is itself dead (§5) |
| `.discipline/lib/adr-loader.mjs` | ADR frontmatter loader | orphaned by rule-013's deletion |
| `src/lib/sources/census-writer.mjs` | census writer | production caller not found in repo |
| `scripts/lib/anthropic.mjs`, `net-agent.mjs` | "canonical" HTTP/API infra | zero importers |
| `scripts/lib/urgency.mjs`, `fetch-quality.mjs` | hand-maintained TS mirrors | zero importers, zero tests — the exact divergence pattern that caused the documented run-#66 incident elsewhere |
| 3 admin API routes | `admin/promotion-policy`, `admin/run-intake`, `admin/users` | no frontend or workflow caller found repo-wide |
| assumption_register machinery (WO-20) | migration 271 + seeder + tests | never `--apply`'d; 0 rows — schema shipped, register never started (§6) |
| 5 `src/lib/sources` walk/diff modules | `amendment-diff`, `change-sweep`, `feed-walk`, `register-walk`, `intake-url-corpus` | TEST-ONLY |

**`supabase/functions/capture-worker`** deserves its own line: its queue `pending_first_fetch` holds
**1,376 live rows**, `cron.job` = 0, and the only drain is a manual SQL RPC (`capture_worker_fetch`,
migration 256) that nothing in the repo calls. Either this backlog is intentional (build-mode hold) or
1,376 first-fetches are silently never happening. Operator decision required.

---

## 5. DEAD CODE — confirmed, deletable (~1,900 lines)

- **`src/components/credibility/` — all 7 files** (`BiasBadge`, `CitationCountChip`,
  `CredibilityBadge`, `JurisdictionChip`, `ProvenancePanel`, `RecencyChip`, `SignalStrength`). An
  entire subsystem whose headers describe an integration that never happened. Grep-confirmed zero
  importers.
- **`src/data/` legacy seed subgraph** — `index.ts` + 6 `seed-*.ts` (546 lines); live data comes from
  Supabase. Contains its own latent bug (`index.ts:41-42` sets `old: s.newId`), harmless only because
  dead. Note `seed-resources.ts` imports a JSON file that does not exist — it could not even compile
  into a build that referenced it.
- **5 orphaned regulations components** — `BulkSelectBar`, `ConfidenceFacet`, `SectorChipFilter`,
  `SortRow`, `ViewToggles` — left behind by the Template-02 ledger redesign.
- **8 orphaned shell/ui components** — `SectionHeader`, `StatStrip`, `SourceProvenanceBadge`, `Pill`,
  `RowCard`, `Tag`, `Toggle`, `Tooltip` (incl. an unreferenced 30-entry regulatory acronym glossary).
- **`src/types/intelligence.ts`** (273 lines) — complete conversion module, zero references.
- **`jurisdictionCentroids.ts`** — ~130 lines of dead exports from the Phase-6 map rebuild.
- **In-file dead**: `supabase-server.ts` `allSynopses` always `[]` (the 2,040-row
  `intelligence_summaries` table is read by nothing — see §7); `discover.mjs:142`'s computed
  `relationship` discarded by both callers; `vocabularies.mjs:363` 19-entry RELATION set used only by
  its own test; `profile.ts:69-72` four fetched-never-read profile fields;
  `trust.selftest.mjs` false-positive cleared (spawned by F11).
- **`scripts/dead-code-sweep.sh`** cannot run: its required manifest
  `docs/audits/dead-code-manifest-2026-08-11.txt` does not exist in the repo. The dead-code sweeper is
  itself dead. This audit supersedes it — the list above is the new manifest.

---

## 6. BUILT BUT NEVER RAN — wired code over 0-row tables

Features whose full read+write paths exist and whose tables have never held a production row:

| Feature | Table(s) | State |
|---|---|---|
| Org invitations | `org_invitations` 0 | code-complete; email cannot deliver (§3.4) |
| Team watchlist | `org_watchlist` 0 | code-complete, RLS-correct |
| Personal archive / list order | `user_item_state`, `user_list_order` 0 | code-complete |
| Community sign-off | `community_post_signoff_requests` 0 | full request/withdraw/decide UI + API |
| Post promotion | `post_promotions`, `promotion_policy` 0 | promote dialog wired; policy engine fail-closed by design |
| Moderation reports | `moderation_reports` 0 | queue built |
| Topics | `community_topics`, `community_topic_groups` 0 | UI renders empty |
| Notifications | `notifications`, `notification_preferences` 0 | bell + prefs save path wired |
| Tier opinions | `source_tier_opinions` 0 | writer "finally wired 2026-08-11" per its own comment — still zero rows; upstream never fires |
| Change detection | `intelligence_changes` 0 | writer live; detection was hardcoded-false until recently |
| Bulk import audit | `bulk_imports` 0 | apply-mode never run, or its insert fails uncaught (route line 632) |
| Assumption register | `assumption_register` 0 | seeder never `--apply`'d |

The pattern: **the multi-tenant/community/collaboration half of the product is engineered but has
never had a second real user.** `organizations` = 1, `org_memberships` = 2, `profiles` = 2,
`community_posts` = 1. None of this is a code defect; all of it is unvalidated-in-production code.

## 7. Orphaned data — rows nothing reads

`intelligence_summaries` **2,040 rows, zero readers** (dashboard synopses shelved) ·
`intelligence_item_versions` 2,219 rows written by trigger, never read (version history by design) ·
`institutions` 459 rows, no code references · `drain_worklist` 66 rows, no code references ·
`system_state_flag_audit` 8 rows (forensic, unsurfaced) · `taxonomy_nodes` 38 / `data_sources` 27 /
`case_studies` 6: no runtime readers found · `pending_first_fetch` 1,376 (§4).

## 8. Schema and migration integrity

1. **Replay-breaking drift (C3-class): `coverage_gap_candidates`'s 5 newest columns exist live but in
   no migration** — `data_class`, `discovery_class`, `disposition`, `surface_test`, `access_model`
   (coordinator-verified live). View 223 (`acquisition_backlog_v`) depends on them; a clean replay of
   001→272 fails at 223. Needs a catch-up migration recording the live DDL.
2. **Migration 091 references a column renamed by 090** (`s.tier` → `base_tier`) — replay-order
   contradiction; function later fixed by 099. Same replay risk class as #1.
3. **`validate_item_provenance` body lineage is unprovable from files alone**: 206 and 225 spliced
   criteria in against the then-live body; 202's full-body REPLACE reproduces neither. The live body
   should be dumped and committed as the canonical version.
4. Historical, self-documented and fixed, listed for the record: the 114→119 vacuous-pass incident
   (207 items mis-certified), the 164 org-gate regression, the 200→255 canonical-key false-duplicate
   archival, the 250 provenance-guard trio, and a recurring RLS enable-without-policy class
   (043/091/112/169/230/248/249/257/259).
5. Housekeeping: two files both numbered 151; `007` changes a RETURNS TABLE via CREATE OR REPLACE
   (the 42P13 class the repo later learned); migration 260 (CONCURRENTLY) may never have applied;
   an anon JWT literal is committed in 256 (public-by-design, still poor hygiene).

## 9. Corrections — lane claims the coordinator refuted, and graph limits

- **Refuted**: L13's headline "no `.github/workflows` exists; the data-audit lane has no trigger."
  The workflows live at the repo root, not under `fsi-app/`; `data-audit-lane.yml` invokes
  `run-data-audit-lane.mjs` + `run-goldens.mjs` (dispatch; schedule commented out under the build-mode
  ruling). Its subsidiary findings (the two hard:true no-op audits, the fail-open
  `emergencyPaused()`, unwired mirror files) stand.
- **Refuted**: L15's reading that F23's zero baseline makes CI red — CI is green on master (run
  evidence, PR #500). The stale header prose contradiction stands as doc-drift inside the
  drift-detection system itself.
- **Graph false-positives corrected by lanes** (recorded so nobody deletes live code on graph
  evidence): everything loaded via `next/dynamic` (`UserMenuDropdown`, 4 Settings panels,
  `navigationStore`), spawn/hook-invoked files (`consistency/runner.mjs`,
  `pretooluse-skill-gate.mjs`, `_fmt-present.mjs`, selftests spawned by F10/F11/F12),
  `src/proxy.ts` (Next 16 auto-registration), `.npmtest.mjs` files (separate CI job), and
  jiti-imported `relabel-unlabeled.mjs`.
- **Active schedules, for the record**: `trust-recompute` (monthly) and `uptime-probes` still carry
  live cron triggers; every data lane's schedule is commented out per the build-mode ruling.

## 10. Action queue (ordered; nothing here needs new spend)

| # | Action | Size | Gate |
|---|---|---|---|
| 1 | Fix 2.1 sidebar href | XS | none |
| 2 | Fix 2.2 promotion date, 2.4 tier badges, 2.5 gap-flag subject_type, 2.6 dead variable | XS each | none |
| 3 | Decide 2.3: implement or remove the two dead demotion triggers | S | vocabulary decision |
| 4 | Catch-up migration for §8.1 live-only columns; dump+commit canonical `validate_item_provenance` (§8.3) | S | migration window (DDL is additive/recording only) |
| 5 | **Operator decision: `pending_first_fetch` backlog (1,376)** — drain, schedule, or write off | decision | Jason |
| 6 | Delete §5 dead code (one PR, file list above is the manifest) | M | none — deletion only |
| 7 | Wire-or-delete each §4 row (each is one decision + small PR; F25 allowlist shrinks accordingly) | S each | none |
| 8 | Build U7: brief generation reads graph candidates; advance contract version; A3 assertion | M | the flywheel's missing joint |
| 9 | §6 never-ran features: pick per feature — ship (needs an email provider decision for invites), hold, or remove | decisions | Jason |
| 10 | §3 stubs: implement or descope the 3 market producers, SERIES_ITEM_MAP ratification, region persistence, saved-search filters | S-M each | SERIES_ITEM_MAP is an operator ratification |

