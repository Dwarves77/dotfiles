# Live-Pages Audit — Findings Register + Traceability Matrix

Date: 2026-07-07 · Read-only deliverable (this doc + its commit; no code/data change).

## What this is

Coverage of the Caro's Ledge live-pages audit was **asserted, not checkable**. This register makes
it checkable: every finding gets a stable ID, a surface, a severity, an evidence line, and **exactly
one disposition**. A remediation program then cites finding IDs; a finding that maps to no phase is a
**silent drop** this matrix exists to catch.

**Source artifacts** (committed, authoritative):
- `DEEP-AUDIT-2026-07-07.md` — line-by-line functional audit of the five subsystems, reconciled to
  the live production DB (`kwrsbpiseruzbfwjpvsp`). Currently on branch
  `origin/claude/knowledge-transfer-docs-nm6zb8` (pending merge to master).
- `DATE-AND-DEDUP-AUDIT-2026-07-07.md` — the timeline-extraction + duplicate-instrument findings
  (same branch).
- Prior lineage (superseded where they conflict, per DEEP-AUDIT §2):
  `docs/audits/caros-ledge-product-audit-2026-05-15.md` (integrated the original in-browser Chrome
  findings) and `docs/plans/spec-audit-user-chrome-2026-05-23.md`.

**Reconstructed, stated plainly:** the DEEP-AUDIT consolidated its S1 list in §8 but left S2/S3/S4 as
prose inside §3–§7; DATE-AND-DEDUP is prose. The itemized IDs below (S2-*, S3-*, S4-*, DD-*) are
**reconstructed** from that prose into discrete rows — the enumeration is mine, the findings are the
audits'. No finding was invented; if a row felt like a judgment call it is marked so.

**Obsidian mirror:** `docs/` *is* the sole Obsidian vault (verified 2026-07-07 — one vault, no Sync),
so committing here **is** the one-way mirror; there is no second copy to drift.

## Disposition vocabulary

- **FIXED** — shipped + merged; names the PR.
- **IN-BLOCK** — inside the current option-2 (verifiable-backend) block; names the item (a–e).
- **PHASED** — deferred to a named phase AND its gate (browser-verification wave · intake-gate
  precondition · loop flip · DDL/apply window · dashboard action). The gate is why it isn't done now.
- **WON'T-FIX (proposed)** — recommended not to fix, with a reason; **Jason rules these**.

Standing gates in force: autonomous loop **OFF**, scrape hold **LIVE**, **zero mints**, migrations are
committed files until Jason's apply window.

---

## S1 — data-loss / security / false customer claims (DEEP-AUDIT §8)

| ID | Surface | Sev | Evidence (observed) | Disposition |
|----|---------|-----|---------------------|-------------|
| S1-01 | intake / system_state | S1 | `global_processing_paused=true`, `scrape_cadence='off'` since 2026-05-18 — loop off at the switch | **PHASED** — loop flip (operator); stays OFF per Jason's ruling |
| S1-02 | /api/staged-updates | S1 | outside `/api/admin/*`, only `requireAuth` then service-role approve/materialize — any customer could push to prod | **FIXED — PR #233** |
| S1-03 | intelligence_items/sources/staged_updates/provisional_sources | S1 | `SELECT TO public USING(true)` — anon reads 128 quarantined + 57 unverified + 497 provisional + all staged | **FIXED (authored) — PR #233 / mig 157**; PHASED on **apply** (operator DDL window) |
| S1-04 | 7 worker/cron routes | S1 | `WORKER_SECRET || "dev-worker-secret"` public fallback | **FIXED — PR #233** |
| S1-05 | canonical-pipeline generation | S1 | workspace profile never injected (`:570-581`) — every "anchored" brief is generic | **PHASED** — Phase 3 (P3-1); browser-verification wave |
| S1-06 | generate-brief / agent/run | S1 | no `provenance_status` gate; 498 runs on 39 items/wk desync brief↔certified spans | **IN-BLOCK — item c** (cooldown + verified short-circuit) |
| S1-07 | canonical-pipeline grounding | S1 | criterion-2 auto-stubs every URL (`:931-938`); ANALYSIS claims need no source | **FIXED (code: cited-host gate) + AUTHORED (mig 158, apply-gated)** — see P3c disposition section |
| S1-08 | supabase-server override reads | S1 | `workspace_item_overrides` read with anon client → RLS `[]` → dismissals/notes lost on reload | **FIXED — PR #234** |
| S1-09 | Ask assistant (all 5 surfaces) | S1 | context = `order("priority").limit(30)`, no retrieval/FTS/history | **PHASED** — Phase 1 (P1-6); browser-verification wave |
| S1-10 | worker/check-sources | S1 | `change_detected:false` hardcoded (`:80`); 0 change rows ever | **PHASED** — Phase 2 (P2-6); loop flip |
| S1-11 | staged-updates materialization | S1 | approval mints a stub, never generates → invisible to customers | **IN-BLOCK — item b** (approve→generate, DORMANT behind loop-flag + intake-gate/mint precondition) |
| S1-12 | Supabase advisors | S1 | 1 ERROR `security_definer_view` + 13 no-policy + 56 search_path + leaked-pw OFF | **PARTIAL**: definer view **FIXED (authored) PR #233/mig 157** (apply-gated); search_path 165-fn + leaked-pw → **PHASED** (DDL window / dashboard) |

## S2 — core feature broken or hollow (DEEP-AUDIT §4, §6)

| ID | Surface | Sev | Evidence | Disposition |
|----|---------|-----|----------|-------------|
| S2-01 | all read surfaces | S2 | provenance chips (`sourceTier`/`sourceName`) never populated — moat dark on ~80% of UI | **FIXED — PR #234** (detail + category paths) |
| S2-02 | detail pages | S2 | `fetchIntelligenceItem` maps none of severity/signal_band/theme/trajectory/… → index≠detail | **FIXED — PR #234** |
| S2-03 | detail pages | S2 | reads 3 phantom columns `penalty_range`/`enforcement_body`/`legal_instrument` (absent live) | **FIXED — PR #234** |
| S2-04 | Watch buttons | S2 | toggle local state, write nothing; `user_watchlist` table + widget exist, 0 rows (no writer) | **PHASED** — Phase 1 (P1-5 WATCH); browser-verification wave (needs 5-component wiring finished together) |
| S2-05 | Notes field | S2 | "visible to your workspace" but stored in localStorage; `workspace_item_overrides.notes` backend exists | **IN-BLOCK — item d** (NOTES ships only if fully standalone: backend exists → wire+verify+done) |
| S2-06 | export/share | S2 | `ExportBuilder`/`ShareMenu`/`BulkSelectBar`/`lib/export/*` mounted nowhere — dead code | **PHASED** — Phase 3 (P3-6); browser-verification wave |
| S2-07 | admin scan → stage | S2 | stages 3 non-existent columns, discards `jurisdiction_iso`, never resolves `source_id`, parses only first web_search block | **PHASED** — Phase 2 (P2-2/P2-3); intake-gate precondition + loop flip |
| S2-08 | portal sources | S2 | ~55% sources are root portals; nothing enumerates deep links → discovery = 1 manual path | **PHASED** — Phase 2 (P2-5 / new crawler); loop flip |
| S2-09 | /community | S2 | ~5,000 lines (groups/threads/moderation/bell/realtime) reachable only by URL; no group-create path; presence reads a column nothing writes | **PHASED** — Phase 4 (P4-1); browser-verification wave |
| S2-10 | admin add-member | S2 | discards email, re-inserts caller (`AdminDashboard.tsx:209-225`); working `/api/orgs/[id]/members` sits behind an honest-pending panel | **PHASED** — Phase 4 (P4-2); browser-verification wave |
| S2-11 | notifications | S2 | prefs never read; `mention`/`promote` never fire; no email library; invites copy-a-URL | **PHASED** — Phase 4 (P4-4); email = dashboard/provider decision |
| S2-12 | verifier sign-off | S2 | stub end-to-end (no admin queue; community button hard-disabled) | **PHASED** — Phase 4 (P4-3); browser wave (mig 153/154 consumer) |
| S2-13 | freshness / agent/run | S2 | `run/route.ts:80` starts workflow without `refresh` — "regenerate" can't re-pull | **IN-BLOCK — item c** (thread `refresh`; hold gate 503s it until hold-lift) |

## S3 — waste / quality (DEEP-AUDIT §3, §4)

| ID | Surface | Sev | Evidence | Disposition |
|----|---------|-----|----------|-------------|
| S3-01 | grounding pipeline | S3 | ~6–10× the documented $0.15/item; full ~560K-char pool re-sent, no prompt caching; $5/day cap double-counts | **PHASED** — Phase 3 (P3-3); routes through spend chokepoint (F15) |
| S3-02 | failure ladder | S3 | thinning-restore CASCADE-deleted by its own retry (H2); RELABEL no-op → guaranteed erase (H6) | **PHASED** — Phase 3 (P3-4) |
| S3-03 | scoring / exports | S3 | two unlabeled "urgency" scales (DB 1–10 vs client 0–240) shown side by side | **PHASED** — Phase 3 / backlog; browser wave |
| S3-04 | trust.ts | S3 | T1 gazette decays toward ~50 because health-checks count as citation "signals" (`:101-111`) | **PHASED** — backlog (trust-model calibration) |
| S3-05 | research/operations detail | S3 | related-item lists skip the provenance gate → unverified titles leak, links 404 | **PHASED** — Phase 1 tail / browser wave |
| S3-06 | /research, /operations | S3 | /research runs the pipeline twice + discards a paid coverage RPC; /operations regex-matches the whole ~450-row corpus | **PHASED** — Phase 3 / backlog |

## S4 — hygiene / governance (DEEP-AUDIT §2, §7)

| ID | Surface | Sev | Evidence | Disposition |
|----|---------|-----|----------|-------------|
| S4-01 | migration ledger | S4 | ledger stops at 135; live schema through 153; inventory says 146–153 "not applied" — 3 SoTs disagree | **PHASED** — P0-5 ledger reconcile (operator apply window; C3-vs-DB is a code change that can be IN a later block) |
| S4-02 | prod schema | S4 | ~16 orphan tables + ~60 dead/write-only columns + 5 `_pre_phase5` backups, flagged 2026-06-20, untouched | **PHASED** — Phase 4 (P4-5); operator DDL window ("deprecation = deletion") |
| S4-03 | CI — error-drop | S4 | 108 `const { data }`-without-`error` instances, no guard | **FIXED — PR #235** (soft scan + hard selftest) |
| S4-04 | CI — wired-ness | S4 | "table/column/RPC with no consumer" found by hand every audit | **FIXED (pre-existing)** — `F14-producer-consumer-orphan` / invariant RD-9 (retrieval check; not rebuilt) |
| S4-05 | CI — loop smoke | S4 | no end-to-end cron→stage→approve→generate→verify→render test | **PHASED** — Phase 5 (P5-2); needs loop live to assert render |
| S4-06 | DB backup | S4 | PITR/weekly `pg_dump` unconfirmed | **PHASED** — Phase 5 (P5-4); operator (Supabase plan / GHA secret) |

## DD — duplicates + date→timeline (DATE-AND-DEDUP-2026-07-07)

| ID | Surface | Sev | Evidence | Disposition |
|----|---------|-----|----------|-------------|
| DD-01 | timelines / extraction | S1-class | of 89 verified reg briefs carrying real dates, **exactly 1** has a correct complete timeline; ~85% have NO structured timeline (dates only in prose, incl. literal "Confirmed Regulatory Timeline" tables never harvested into `item_timelines`) | **PHASED** — Phase 3 (extraction-contract source/skill fix, so every future brief is fixed) + data-op backfill of the 88 (guarded writes, operator window) |
| DD-02 | timelines — wrong dates | S1-class | the ~16 stored timelines are mostly wrong: PPWR applies 12 Aug 2026 (Art.71, quoted ~8×) stored as Aug 1; CSRD "Omnibus adopted" on a political-agreement date; CountEmissions labels a past Parliament vote "expected"; EU Taxonomy 2025 milestone unsupported; HDV drops the −15% 2025 nearest deadline | **PHASED** — Phase 3 (same extraction fix) + backfill; **DD-02b display**: PPWR UI showed Jul-31 vs DB Aug-1 → a display-layer discrepancy on top of the wrong data (browser wave) |
| DD-03 | corpus duplicates | S2 | 6 confirmed duplicate-instrument groups: 4 clean auto-archives (PPWR, CSRD, Reuters, Clean Trucking Alliance); 2 need review (AFIR mislabelled "Sustainability Reporting"; Singapore two-agency) | **PHASED** — data-op (guarded delete-then-keep with per-item disposition list for authorization; operator window). 2 review rows → **operator rules** |
| DD-04 | intersection machinery | S2 | CSRD pair shares an identical CELEX source URL and nothing caught it — the xref/intersection layer only *relates* items, never asks "is this the same instrument?" | **PHASED** — Phase 5-class guard: nightly duplicate-instrument-audit (new fitness/invariant, sibling of F13/F14) |

---

## Summary counts

- **Found (registered): 41** — S1 ×12, S2 ×13, S3 ×6, S4 ×6, DD ×4.
- **FIXED (merged): 8** — S1-02, S1-04, S1-08 (PR #233/#234), S2-01, S2-02, S2-03 (PR #234), S4-03 (PR #235), S4-04 (pre-existing F14). Plus **authored-but-apply-gated: 2** (S1-03, S1-12 definer view — PR #233/mig 157).
- **IN-BLOCK (option-2 now): 4** — S1-06, S1-11, S2-05, S2-13 (items b/c/d).
- **PHASED: 27** — Phase 1 browser wave (S1-09, S3-05), Phase 2 loop (S1-01, S1-10, S2-07, S2-08), Phase 3 quality/moats (S1-05, S1-07, S2-06, S3-01, S3-02, DD-01, DD-02), Phase 4 community/cleanup (S2-09, S2-10, S2-11, S2-12, S4-02), Phase 5 guards (S4-05, DD-04), operator windows (S1-03 apply, S1-12 search_path/leaked-pw, S4-01 ledger, S4-06 backup, DD-03 dedup), backlog (S3-03, S3-04, S3-06).
- **WON'T-FIX (proposed): 0.**
- **Silent drops (map to NO phase): 0.** Every registered finding has a row and a gate.

## Disposition updates — 2026-07-07 (later same day; operator delegated applies/merges to the agent)

- **S1-03** → **FIXED + APPLIED**: migration 157 applied + verified at both layers (pg_policies
  read-back; anon PostgREST smoke: staged/provisional/quarantined/unverified all 0, verified 283
  visible; service-role unaffected).
- **S1-12** → definer view **APPLIED** (security_invoker=on, read-back); **leaked-password
  protection ENABLED** (Management API PATCH + read-back). Residual: 165-fn search_path stays a
  reviewed companion migration (break-risky ruling — never a live-prod sweep).
- **S4-01** → **FIXED (DB side)**: ledger repaired — 136–157 recorded after per-migration signature
  verification (all 21 confirmed live); three sources of truth converge. Residual: C3-compares-
  against-DB code change stays a later-block item.
- **S1-04 (deploy half)** → verified live: `WORKER_SECRET` present in GHA secrets AND confirmed in
  Vercel prod behaviorally (wrong-secret probe → 401 from the new fail-closed guard, not 500).
- **S2-05** → **FIXED**: NotesField persists to `workspace_item_overrides.notes` (server-read
  initial value + debounced authed POST; localStorage removed; label now true).

## Disposition updates — 2026-07-07 (Phase-3 quality block)

- **S3-01** → **FIXED — PR #239**: prompt-cache (pool as cached prefix; telemetry records
  cacheRead/Write + savedUsd; measured savings report owed on the first funded batch) AND the
  double-counted daily cap cured (spend-call rows are the single cost ledger; step rows cost 0).
- **DD-01 / DD-02** → **FIXED — PR #240 + backfill EXECUTED**: §14 table+bullet parser (single
  home), precision-honest normalizer, sectionBrief harvest wiring; corpus re-harvested mechanically
  (964 rows / 121 items, $0). Verified stored: 984 rows / 127 items; **PPWR = 2026-08-12** (was
  Aug-1). Residual: 4 items HELD (ICS2, GLEC v3, CountEmissions EU, IMO Net-Zero — §14 unparseable;
  old rows kept + reported); DD-02b display-layer check rides the browser wave.
- **DD-03** → **ENACTED — PR #241** (operator rulings): 6 twins archived `duplicate_instrument`
  (PPWR/CSRD/Reuters/ECTA losers + 2 AFIR twins after the mislabel was RE-TYPED first); PPWR
  survivor adopted the canonical ELI URL; Singapore KEEP BOTH + xref edge (two-agency pattern).
  Residual: ECTA claim-port (archived twin retains its 3 extra claims).
- **S1-07 (P3c grounding holes)** → **QUEUED, next unit** — deliberately NOT rushed: touches
  `validate_item_provenance` + criterion-2/ANALYSIS semantics (the moat gate itself). Anchors:
  canonical-pipeline URL auto-stub site (pre-registers every section URL), mig 141/142/143/145/150
  chain, floor-conditional-on-priority bypass → make reg-family floor unconditional on item_type
  (migration 158, AUTHOR-ONLY per the migrations-are-files rule).

## Disposition updates — 2026-07-07 (P3c grounding-holes unit)

- **S1-07** → **FIXED (code) + AUTHORED (mig 158, apply-gated)** — all three holes, probe-first:
  1. **Criterion-2 self-grounding** → **FIXED — cited-host gate** (`cited-host-gate.mjs` pure +
     tested, wired into both stub loops in `groundBriefImpl`): a cited URL stubs into
     `agent_run_searches` ONLY when its host (exact or institution-level, `hostInstitution` keying)
     is already in the item's real fetched pool (>200ch), the registry, or the item's `source_url`.
     Novel hosts are NOT stubbed — flagged via `integrity_flags` (`cited-host-gate`), criterion-2
     then fails them honestly. Probe: 38/309 existing stubs across 23 items sat on novel hosts
     (all real institutional URLs on inspection — ecfr.gov, undocs.org, gesetze-im-internet.de,
     unregistered fmcsa.dot.gov subdomains — the intent was right, the verification was missing).
     The safety4sea fix (2026-06-21) is preserved for known hosts. Also cured two `{ data }`-only
     error-drops in the rewritten loops (#235 bug-class).
  2. **Floor-conditional-on-priority bypass** → **AUTHORED — mig 158 (NOT applied)**: reg-family
     floor unconditional on item_type; non-reg floors keep CRITICAL/HIGH; `floor_basis` added.
     Blast radius probed live: 72 of 113 verified reg-family items hold 947 sub-floor FACT claims
     (385 tier-NULL/no-source_id across 39 items; 562 at tiers 3-6) — flips happen at
     RE-VALIDATION, not apply; disposal via re-home-to-floor-pool (4b) / research-or-erase.
  3. **Section-scoped ANALYSIS label** → **AUTHORED — mig 158 (NOT applied)**: per-claim
     (paragraph-scoped) label check; expression red-then-green'd read-only against prod.
     Blast radius: 1 claim / 1 item (Japan MLIT 68e05861) of 517 claims / 78 items — the
     generation prompt already demanded per-sentence labels; only the gate lagged.
- **RESIDUAL → CLOSED (same day, operator "Proceed")**: cross-run self-licensing seam —
  `registerPoolHostsForGrounding` now excludes `canonical:cited-*` stub rows from host registration
  (real pool rows only), so a run-1 citation can no longer auto-register into a source row that
  criterion-2's registry branch accepts on run-2.
- **Mig 158 APPLIED 2026-07-07** (operator "Proceed" ruling): ledger row 158 same transaction;
  read-back + three behavioral probes green (Japan MLIT forces exactly 1 label failure; LOW-priority
  reg fails floor with `floor_basis=item_type_unconditional`; CRITICAL/HIGH control still valid).
  No items flipped at apply — flips ride future re-validation writes (zero-mints/loop-OFF gated).

## Disposition updates — 2026-07-07 (browser wave, operator "Proceed — do not stop")

- **S2-04 (WATCH)** → **FIXED — PR #245**: NEW /api/watchlist writer (GET/POST/DELETE, requireAuth
  Bearer + rate limit, onConflict on the mig-060 unique) + ONE shared ui/WatchButton replacing the
  two byte-identical local-state stubs (state loads on mount; optimistic toggle, revert-on-failure).
  The dashboard watchlist rail can now honestly fill. Recon note: the audit's "5 components" = the
  5 pieces (2 buttons + writer + table + widget); only 2 toggle components exist.
- **S2-10 (admin members)** → **FIXED — PR #246**: the addMember defect (discarded the email,
  re-inserted the CALLER) removed; MembersPanel wired to /api/orgs/[org_id]/members for
  role/remove/ban + NEW PUT add-by-email (existing accounts only — honest 404 to the provision
  flow; org_member_bans blocks re-add). **AUTHORITY RULING FLAGGED for operator review**: the route
  now accepts owner OR platform admin (profiles.is_platform_admin — the axis /admin gates on).
  Ban copy corrected to org-scoped (the old copy claimed platform-wide; the backend never was).
- **S2-09 (community)** → **LARGELY STALE + residuals FIXED — PR #247**: recon found the rebuilt
  index already had nav, group-create (PR #229), honest presence. Landed: rail-footer links to the
  two URL-only routes (/community/browse, /community/moderation); dead CommunityView.tsx (0
  importers) deleted. REMAINING ORPHAN (flagged, decision owed): C9 realtime libs built, mounted
  nowhere — mount into bell/PostList or remove.
- **S1-09 (Ask retrieval)** → **FIXED — mig 159 APPLIED + code**: FTS substrate (weighted
  search_tsv generated column + GIN + ranked RPC with the customer read predicate INSIDE the fn);
  /api/ask retrieves top-12 by relevance, priority-pull fallback for low-signal questions. ALSO
  CLOSED (found in recon): /api/ask was the last raw api.anthropic.com fetch on a customer path —
  now routed through the F15 spend chokepoint (ticketed, budget-checked, telemetried).

## Standing rule (codified here, going forward)

**Any future page/surface audit lands as a findings register FIRST** (stable IDs + surface + severity
+ evidence). Remediation programs then cite finding IDs; a program that touches a finding without a
register row is out of process. Same class/discipline as `docs/ops/deletion-reclassification-log.md`.
This register is the template.
