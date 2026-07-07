export const meta = {
  name: 'caros-ledge-remediation',
  description: 'Fix the audited Caro\'s Ledge issues (code audit + live-DB + Claude-Chrome runtime audit), one phase at a time, per-file ownership + verify + adversarial review',
  whenToUse: 'Run AFTER the UI session is quiescent. Pass args.phase (0,1,2,3,4,5,6). Reviews between phases; production DB + data-remediation steps are emitted as an operator checklist, never auto-run.',
  phases: [
    { title: 'Recon' },
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Review' },
    { title: 'Operator-checklist' },
  ],
}

// ===========================================================================
// SOURCES OF TRUTH FOR THIS WORKFLOW
//   - DEEP-AUDIT-2026-07-07.md  (line-by-line code audit, reconciled to live DB)
//   - MASTER-PLAN.md            (sequenced plan)
//   - GAPS.md                   (top-down pass; superseded-in-part banner at top)
//   - Claude-Chrome runtime audit, 2026-07-07 (31 findings, live site, desktop+mobile)
//   - fsi-app/.claude/CLAUDE.md (binding doctrine)
//
// HOW THIS WORKFLOW IS SAFE
//   - One agent owns each FILE end-to-end. Packages sharing a file are merged into
//     one package. No two parallel agents ever edit the same file.
//   - Disjoint-file packages run in parallel; each is verified + adversarially
//     reviewed before it counts.
//   - PRODUCTION/DB/DATA-REMEDIATION steps are NEVER auto-run. Agents author the
//     migration/script and DRY-RUN only; the execute step is returned as an operator
//     checklist item (verification-before-authorization / code-vs-data separation).
//   - Run ONE phase per invocation: Workflow({ scriptPath, args:{ phase:'0' } }).
//     Read the result, merge/inspect, then run the next phase.
//
// MODEL POLICY: Fable BUILT this workflow and authored its direction; Fable does NOT
// run it. Agent stages inherit the session model (MAIN_MODEL/VERIFY_MODEL unset).
// Override per-run with args.model / args.verifyModel — default is inherit, never Fable.
// ===========================================================================

const MAIN_MODEL = (args && args.model) || undefined       // recon / implement / review — inherit session model
const VERIFY_MODEL = (args && args.verifyModel) || undefined // verify — inherit session model

// ---------------------------------------------------------------------------
// FINDINGS_MAP — every Chrome-audit finding → the package that fixes it, so
// nothing is lost. (C#=Chrome finding by surface; also references DEEP-AUDIT.)
// ---------------------------------------------------------------------------
// Watch stub / dashboard watchlist empty ............ p1-watchlist-notes
// Dismiss does not persist .......................... p1-readlayer (overrides via service client) + p1-regulation-detail (status dropdown write)
// PPWR 4 conflicting dates / "confirmed in primary
//   sources" false label ........................... p1-regulation-detail (display) + p3-timeline-extractor (extract) + p6-date-backfill (data)
// Structured Timeline omits prose dates (CSRD/AB1305/
//   ICS2/Reg2025-40) ............................... p3-timeline-extractor (code) + p6-date-backfill (data)
// /regulations?region=us ignores filter ............ p1-regulations-surface (accept national ISO) + p1-readlayer (map jurisdiction_iso)
// Duplicate PPWR (g2 + 5cc10a6d) ................... p6-dedup (data) + p2-scan-materialize (dedup pagination, prevents recurrence)
// Export brief / Share do nothing .................. p1-regulation-detail
// Owner/Assignee not assignable .................... p1-regulation-detail (assign control) + p6 note (backend) OR remove the dashboard instruction
// Stat tiles ≠ lists (home/regs/market/research/map) p1-home-surface, p1-regulations-surface, p1-market-surface, p1-research-surface, p1-map-surface + p5-count-consistency (guard)
// Sources tab raw template placeholder (PPWR) ...... p1-regulation-detail
// Connected-intelligence / lane-exposure pending ... p1-regulation-detail (honest copy) — real wiring gated on shipment data (out of scope)
// Market related "price signal" is enforcement item  p1-market-surface (filter) + p6-reclassification (data)
// Market/Research header vs body ±1-day date ....... p1-market-surface / p1-research-surface (timezone display)
// Market band total (24) ≠ header (59) ............. p1-market-surface
// Research tiles (40) ≠ 51; gov pages as research .. p1-research-surface + p6-reclassification
// Operations 6-dim mostly empty; off-topic op item  p1-readlayer (honest copy) + p6-reclassification (data)
// Map 6/30 charted; US excludes US-CA .............. p1-map-surface (grouping/drill-through/blank-Ask) + p6-map-coverage (data)
// Community leads with ledger not posts (WRONG_SURF)  p4-community-nav (reorder posts-first, ledger→sidebar)
// Community "YOU'RE HERE"+Join both; post-before-join
//   silent fail; intermittent room switch .......... p4-community-nav
// Profile = Account = "Workspace profile" (3 names).. p1-profile-naming
// Admin "NEWEST JOIN" raw UUID ..................... p4-admin-members
// Ask assistant ..................................... WORKS (audit PASS); p1-ask-retrieval widens context only, low priority
// Notes persist (market/research) .................. WORKS; p1-watchlist-notes only repoints reg-detail notes to workspace scope
// ---------------------------------------------------------------------------

const REF = 'Context for every agent: read fsi-app/.claude/CLAUDE.md (doctrine), '
  + 'DEEP-AUDIT-2026-07-07.md + MASTER-PLAN.md (findings + plan), and the Claude-Chrome runtime '
  + 'audit notes in DEEP-AUDIT §"Runtime audit". All product code is under fsi-app/. Binding rules: '
  + 'destructure `error` on EVERY supabase call; never build a raw service-role write client (data '
  + 'writes go through scripts/lib/db.mjs with a {skill,reason} cite + snapshot); fail-closed on '
  + 'spend/write; UI uses theme.css semantic tokens only (no raw hex); accordions default-CLOSED. '
  + 'Make the SMALLEST correct change. NEVER apply a migration, mutate production data, or touch '
  + 'system_state — if a fix needs that, AUTHOR the migration/guarded-script + DRY-RUN it, then list '
  + 'the exact execute step under operator_actions. The live DB is the arbiter, not the docs '
  + '(ledger/inventory are stale; schema is at 153).'

const IMPLEMENT_SCHEMA = {
  type: 'object',
  required: ['package', 'status', 'files_changed', 'summary', 'operator_actions'],
  properties: {
    package: { type: 'string' },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'What changed and why, 2-4 sentences' },
    operator_actions: {
      type: 'array',
      description: 'Every production/DB/data-remediation/authorization step this fix requires but did NOT run',
      items: { type: 'string' },
    },
    residual: { type: 'string', description: 'Anything left undone or uncertain' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['package', 'verdict'],
  properties: {
    package: { type: 'string' },
    typecheck: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    build: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    tests: { type: 'string', description: 'node --test result, script dry-run result, or n/a' },
    verdict: { type: 'string', enum: ['green', 'red'] },
    detail: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['package', 'verdict', 'findings'],
  properties: {
    package: { type: 'string' },
    verdict: { type: 'string', enum: ['approve', 'request_changes'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'note'],
        properties: {
          severity: { type: 'string', enum: ['blocking', 'minor'] },
          file: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// WORK PACKAGES — grouped by FILE OWNERSHIP. `collides_with_ui:true` = surface
// file the parallel UI session may be editing; recon halts if it's mid-flight.
// `data:true` = data-remediation package: author guarded script + DRY-RUN only.
// ---------------------------------------------------------------------------
const PACKAGES = {
  // ===== PHASE 0 — Security & governance (code-only, reversible, no UI collision) =====
  '0': [
    {
      id: 'p0-worker-secret',
      files: ['src/app/api/worker/check-sources/route.ts', 'src/app/api/worker/reconcile/route.ts',
        'src/app/api/worker/drain-first-fetch/route.ts', 'src/app/api/notifications/trigger/route.ts',
        'src/app/api/admin/recompute-trust/route.ts', 'src/app/api/admin/spot-check/recurring/route.ts',
        'src/app/api/admin/q7-daily-recompute/route.ts', 'src/lib/api/worker-auth.ts (new)'],
      task: 'Remove the `|| "dev-worker-secret"` fallback in all 7 routes; throw at module load if '
        + 'WORKER_SECRET is unset. Extract assertWorkerSecret(req) into src/lib/api/worker-auth.ts '
        + 'using crypto.timingSafeEqual (length-guarded); call it from all 7. (GAPS #1/#18)',
    },
    {
      id: 'p0-staged-admin-gate',
      files: ['src/app/api/staged-updates/route.ts'],
      task: 'Add isPlatformAdmin(auth.userId, supabase) to GET and POST before any approve/reject/'
        + 'materialize path (mirror admin/users/route.ts); 403 for non-admins. Do NOT add the '
        + 'approve->generate call yet (phase 2 owns that). (DEEP-AUDIT S1-2 — any authed user can '
        + 'currently materialize intelligence into production.)',
    },
    {
      id: 'p0-security-sql',
      files: ['fsi-app/supabase/migrations/154_security_hardening.sql (new)'],
      task: 'AUTHOR ONLY (operator applies). Migration: (a) replace anon SELECT USING(true) on '
        + 'intelligence_items with USING(provenance_status=\'verified\' AND is_archived=false); '
        + '(b) drop anon SELECT on staged_updates + provisional_sources; (c) recreate the ERROR-level '
        + 'SECURITY DEFINER view without it; (d) set search_path on flagged functions; (e) note the '
        + 'leaked-password-protection auth toggle. Put apply cmd + read-back checks in the commit body. '
        + 'Operator-gated. (GAPS #4 — live-confirmed anon exposure of 128 quarantined + 57 unverified rows.)',
    },
  ],

  // ===== PHASE 1 — Wire the read layer + per-surface display (collides with UI session) =====
  '1': [
    {
      id: 'p1-readlayer', collides_with_ui: true,
      files: ['src/lib/supabase-server.ts'],
      task: '(1) Read workspace_item_overrides via the SERVICE client (getServiceSupabase) at the '
        + '~1575/1723/1459 fetchers, destructure error — this is why Dismiss/Watch/notes vanish on '
        + 'reload. (2) Join sources(name,base_tier,effective_tier) + map sourceName/sourceTier in the '
        + 'workspace RPCs / rpcRowToResource / fetchIntelligenceItem (provenance chips are blank on '
        + '~80% of UI). (3) Map classified columns in fetchIntelligenceItem (severity, signal_band, '
        + 'theme, trajectory_points, conversion_trigger, what_it_changes, does_not_resolve). (4) Map '
        + 'jurisdiction_iso onto listings so the region filter can match. (5) Map ALL timeline states '
        + '(past/current/future) + milestone_date consistently. (6) DELETE phantom reads '
        + 'penalty_range/enforcement_body/legal_instrument (no such columns — always undefined). '
        + '(DEEP-AUDIT §4/S1-8; Chrome: dismiss, tier chips, index/detail date + severity disagree.)',
    },
    {
      id: 'p1-regulations-surface', collides_with_ui: true,
      files: ['src/components/regulations/RegulationsLedger.tsx'],
      task: 'Accept national ISO codes (e.g. "us") in the ?region= filter, not just sub-nationals — '
        + '/regulations?region=us currently returns all 132. Explain the "N shown / M" band counts '
        + '(filtered vs total). Stop placing undated/ongoing items in the "within 90 days" band, or '
        + 'label them. Bind the severity tiles to real by_severity counts so tiles==list. '
        + '(Chrome: region link broken, band counts unexplained, undated in 90-day band.)',
    },
    {
      id: 'p1-regulation-detail', collides_with_ui: true,
      files: ['src/components/regulations/RegulationDetailSurface.tsx'],
      task: '(1) Timeline tab: render dates consistently with the summary/prose; when the milestone '
        + 'set is derived/incomplete, DO NOT assert "confirmed in primary sources" (false assurance on '
        + 'legal dates). (2) Wire Export brief (reuse the existing single-item markdown export) + Share '
        + '(Blob download per doctrine — no clipboard/window.open) so they actually do something. '
        + '(3) Make Assignee assignable (write workspace_item_overrides.owner) OR remove the dashboard '
        + 'instruction that says you can. (4) Remove the raw "Source Name / URL · Tier estimate" '
        + 'template placeholder row from the Sources tab. (5) Dismiss dropdown must persist (writes via '
        + 'the overrides API; pairs with p1-readlayer read). (6) Fix accordion default-open to CLOSED '
        + '(doctrine). (Chrome: PPWR dates, Export/Share dead, owner, sources placeholder, dismiss.)',
    },
    {
      id: 'p1-market-surface', collides_with_ui: true,
      files: ['src/components/market/MarketIntelLedger.tsx', 'src/components/market/MarketSignalDetailSurface.tsx'],
      task: 'Reconcile "59 active signals" vs bands summing 24 (surface the "35 unclassified" as its '
        + 'own honest band, not a footnote). Fix header "published May 10" vs body "May 9" (+1-day '
        + 'timezone display bug — format dates in a fixed tz). Render trajectory data that is already '
        + 'mapped (TrajectoryBars) instead of "not yet captured". Filter the related-signals list so an '
        + 'enforcement/inspection item cannot render as a "COST ALERT · B1 price signal". '
        + '(Chrome: band≠header, ±1-day, trajectory hidden, wrong-surface related.)',
    },
    {
      id: 'p1-research-surface', collides_with_ui: true,
      files: ['src/components/research/ResearchLedger.tsx', 'src/components/research/ResearchFindingDetailSurface.tsx'],
      task: 'Reconcile "51 findings" vs relevance tiles summing 40 (render an "Other/unthemed" band '
        + 'for the missing rows instead of counting-but-hiding them). Fix header vs body ±1-day date. '
        + 'Render the bias-tags/citation-count/recency the pipeline already fetches. (Chrome: tiles≠51, '
        + 'unthemed hidden, ±1-day, methodology rail claims unrendered fields.)',
    },
    {
      id: 'p1-home-surface', collides_with_ui: true,
      files: ['src/components/home/DashboardHero.tsx', 'src/components/home/DashboardTopPriority.tsx',
        'src/components/home/WhatChanged.tsx', 'src/components/home/DashboardWatchlist.tsx'],
      task: 'Make the IMMEDIATE tile (6), the "Top priority this week" list (5), and the CTA ("All 6") '
        + 'agree — one count from one source (and note the duplicate PPWR inflates it; p6-dedup fixes '
        + 'the data). "What changed / this week" must reflect an actual detection window, not any '
        + 'changelog row ever. Route each changed item to its own surface, not always /regulations. '
        + 'Owner widget copy honest until backend lands. (Chrome: 6 vs 5 vs "All 6"; what-changed mislabel.)',
    },
    {
      id: 'p1-map-surface', collides_with_ui: true,
      files: ['src/components/map/MapPageView.tsx'],
      task: 'Reconcile "30 jurisdictions live · 115 items" vs the map\'s "6 charted · 71 items" — show '
        + 'the same denominator and explain uncharted (missing coords → p6-map-coverage backfills). Fix '
        + 'US grouping so "US" includes US-CA (or label them distinctly + consistently). Make List-view '
        + 'jurisdiction rows clickable (drill to that jurisdiction\'s regulations). Fix the blank "Ask '
        + 'AI" circle on initial load. (Chrome: 6/30 charted, US excludes US-CA, no drill-through.)',
    },
    {
      id: 'p1-watchlist-notes', collides_with_ui: true,
      files: ['src/app/api/watchlist/route.ts (new)', 'src/components/regulations/RegulationDetailSurface.tsx (WatchButton only — COORDINATE with p1-regulation-detail owner; if same run, MERGE)',
        'src/components/market/MarketSignalDetailSurface.tsx (WatchButton — COORDINATE with p1-market-surface owner)'],
      task: 'Create POST/DELETE /api/watchlist writing user_watchlist (requireAuth, org-scoped) — the '
        + 'table + the dashboard read already exist; only the write is missing. NOTE ownership overlap: '
        + 'the WatchButton lives inside detail components owned by p1-regulation-detail / p1-market-'
        + 'surface. To avoid a same-file collision, THIS package ships ONLY the new route + a tiny '
        + 'useWatch hook; the detail-component owners wire the button to the hook. Sequence this AFTER '
        + 'those, or merge. (Chrome/DEEP-AUDIT: Watch stub, dashboard "Nothing watched yet".)',
    },
    {
      id: 'p1-ask-retrieval', collides_with_ui: true,
      files: ['src/app/api/ask/route.ts'],
      task: 'LOW PRIORITY (runtime audit rated Ask a PASS). Widen context beyond the fixed '
        + 'order("priority").limit(30): add Postgres FTS (websearch_to_tsquery over title/summary/'
        + 'full_brief) scoped by question + workspace jurisdictions/sectors; pass prior turns; keep the '
        + 'verified-gate + deterministic tiebreak. (DEEP-AUDIT S1-9.)',
    },
    {
      id: 'p1-profile-naming', collides_with_ui: true,
      files: ['src/app/profile/page.tsx', 'src/components/**/UserMenu (the entry that opens it)'],
      task: 'Unify the three names for one destination: URL /profile, page title "ACCOUNT", menu entry '
        + '"Workspace profile". Pick ONE label and apply it to the route/title/menu. (Chrome: 3 names.)',
    },
  ],

  // ===== PHASE 2 — Close the autonomous loop (code + operator switch) =====
  '2': [
    {
      id: 'p2-scan-materialize',
      files: ['src/app/api/admin/scan/route.ts', 'src/app/api/staged-updates/route.ts', 'src/lib/intake/mint-item.ts'],
      task: 'scan: join ALL web_search text blocks before JSON.parse (copy discovery.ts:412-416); '
        + 'paginate the dedup select (readAll pattern — the unpaginated 1000-row cap is how the '
        + 'duplicate PPWR slipped in). mint-item: add the error destructure at :56/60; resolve '
        + 'source_url->source_id; stage jurisdiction_iso; strip the 3 non-existent columns '
        + '(penalty_range/cost_mechanism/authority_level) OR author a migration adding them (operator-'
        + 'gated). staged-updates: after a successful new_item materialization, '
        + 'start(generateBriefWorkflow,[itemId]) — the missing hinge that leaves approved items hollow. '
        + '(DEEP-AUDIT §5.)',
    },
    {
      id: 'p2-cooldown-refresh',
      files: ['src/app/api/agent/run/route.ts', 'src/workflows/generate-brief.ts'],
      task: 'Accept `refresh` in the POST body, thread to start(). Per-item cooldown (429 if an '
        + 'agent_runs row exists for this item in the last hour). Short-circuit the workflow on '
        + 'provenance_status=\'verified\' unless refresh=true; on refresh, clear status before regen '
        + '(prevents the verified-brief↔ledger desync). This also stops the 498-runs/~39-items waste. '
        + '(DEEP-AUDIT S1-6, §5 H7.)',
    },
    {
      id: 'p2-change-detection',
      files: ['src/app/api/worker/check-sources/route.ts', 'src/app/api/worker/reconcile/route.ts',
        '.github/workflows/source-monitoring.yml', 'fsi-app/supabase/migrations/155_source_content_hash.sql (new)'],
      task: 'The one net-new organ. AUTHOR migration adding sources.content_hash (operator-gated apply). '
        + 'check-sources: fetch via the transport ladder, hash the text, set change_detected=true on '
        + 'mismatch, store the new hash (today it is hardcoded false — "monitoring" is a reachability '
        + 'ping). Add a reconcile job to source-monitoring.yml; reconcile enqueues '
        + 'generateBriefWorkflow(itemId, refresh=true) for affected items. OPERATOR PRE-STEP: set '
        + 'system_state.scrape_cadence + scrape_start_date and confirm SCRAPE_HOLD is lifted — the '
        + 'hourly cron is currently gated OFF, which alone explains "no new items". (DEEP-AUDIT §5 C1/C2/C3.)',
    },
  ],

  // ===== PHASE 3 — Brief quality, grounding, cost, and the DATE-EXTRACTION defect =====
  '3': [
    {
      id: 'p3-pipeline-quality',
      files: ['src/lib/agent/canonical-pipeline.ts', 'src/lib/agent/system-prompt.ts'],
      task: '(1) Inject the workspace profile (read workspace_settings) + a compact {id,title} candidate '
        + 'related-item list into the synthesis user message (~L570) — today NO profile is injected, so '
        + 'every "workspace-anchored" brief is generic. (2) Restrict criterion-2 URL auto-stubbing '
        + '(~L931-938) to hosts already in the pool/registry; flag novel hosts instead of auto-'
        + 'accepting (hallucinated URLs currently launder past the gate). (3) Make the reg-family '
        + 'authority floor unconditional on item_type, not model-chosen priority. (DEEP-AUDIT S1-5/S1-7.)',
    },
    {
      id: 'p3-timeline-extractor',
      files: ['src/lib/agent/formats/regulation.ts', 'src/lib/agent/extract-sections.ts (+ the timeline/date extractor it calls)',
        'src/lib/agent/section-validator.ts'],
      task: 'THE #1 RUNTIME DEFECT — operator contract, verbatim: "it should flag any dates within the '
        + 'information and put them into the timeline." The full document IS already delivered to the '
        + 'model (full-delivery doctrine — do not re-litigate that); the failure is that the extraction '
        + 'contract never DEMANDS date completeness. Fix at the SOURCE (system-prompt + format spec + '
        + 'extractor), not per-brief: (1) every date appearing in the source/prose must either become a '
        + 'timeline milestone or be explicitly classified non-material (publication refs, historical '
        + 'context) — with the classification recorded; (2) section-validator cross-checks prose dates '
        + 'vs emitted milestones — a legally-material prose date with no milestone is a VALIDATION '
        + 'FAILURE, not a silent pass; (3) milestone dates must agree with prose dates (PPWR: prose '
        + '"12 Aug 2026" vs timeline "Jul 31" is exactly the bug); (4) never render/emit "confirmed in '
        + 'primary sources" for a derived or partial milestone set. Known broken exemplars to test '
        + 'against: PPWR (g2), CSRD (c1), AB1305, ICS2 (g32), Reg 2025/40-OJ. Existing rows heal via '
        + 'p6-date-backfill + targeted refresh=true regeneration; the standing nightly guard is '
        + 'p5-dup-and-date-audits. (Chrome criticals 1,4,5.)',
    },
    {
      id: 'p3-prompt-cache',
      files: ['src/lib/agent/anthropic-stream.mjs', 'src/lib/llm/spend-client.ts', 'src/workflows/generate-brief.ts'],
      task: 'Add cache_control to the source-block prefix reused across synthesis/ground/re-ground '
        + '(~40-50% spend cut; grounding re-sends the full ~560K-char pool at full price today). Fix the '
        + 'double-counted daily cap: make recordRun write cost 0 (status only) now that per-call '
        + 'telemetry exists, OR exclude fetch_method=\'spend-call\' from one of the two sums. '
        + '(DEEP-AUDIT S3, §3 H1/C4.)',
    },
  ],

  // ===== PHASE 4 — Community, admin, notifications =====
  '4': [
    {
      id: 'p4-community-nav', collides_with_ui: true,
      files: ['src/components/community/CommunityRooms.tsx', 'src/components/Sidebar.tsx',
        'src/app/api/community/groups/route.ts (new)'],
      task: 'REORDER the hub so it reads like a forum (Reddit-style): lead with member posts/threads '
        + '(author, timestamp, replies, upvotes); move the "FROM THE LEDGER" regulation/research cards '
        + 'to a sidebar — today it leads with ledger items and reads as a reg feed. Link /community -> '
        + '/community/browse + /community/moderation (5k lines of working forum UI are unreachable from '
        + 'nav). Mount the built NotificationsBell + realtime layer on the reachable surface. Add POST '
        + '/api/community/groups + a create-group affordance. Fix: "YOU\'RE HERE"+"Join room" showing '
        + 'together; silent post-before-join failure (label it); intermittent room-card switch; two '
        + '/account links -> /profile. (Chrome WRONG_SURFACE + community UX.)',
    },
    {
      id: 'p4-admin-members',
      files: ['src/components/admin/AdminDashboard.tsx', 'src/components/admin/redesign/MembersPanel.tsx'],
      task: 'Fix addMember — it currently discards the typed email and re-inserts the caller; route it '
        + 'to /api/orgs/[org_id]/invitations. Wire the honest-pending admin MembersPanel to the '
        + 'existing /api/orgs/[org_id]/members backend (the profile-side panel already uses it). Fix '
        + '"NEWEST JOIN" showing a raw UUID fragment — resolve to name/org. (DEEP-AUDIT §6; Chrome admin.)',
    },
    {
      id: 'p4-notifications',
      files: ['src/lib/notifications/dispatch.ts'],
      task: 'Read notification_preferences before inserting (today prefs are decorative). Add the '
        + 'missing mention/promote dispatch sites OR explicitly scope them out of the prefs UI. Leave '
        + 'email as a documented TODO unless a provider is chosen (no email lib exists). (DEEP-AUDIT §6.)',
    },
  ],

  // ===== PHASE 5 — Permanent guards (the structural antidote to "half-built") =====
  '5': [
    {
      id: 'p5-wiredness-fitness',
      files: ['fsi-app/.discipline/fitness/functions/F18-wiredness.mjs (new)', 'fsi-app/.discipline/manifest.mjs'],
      task: 'Fitness function: every public table/column/RPC must have a live consumer in src/scripts '
        + 'OR an explicit @orphan/@shelved registry annotation. Fail on a third state. Register in the '
        + 'manifest. Directly prevents the ~60 write-only/dead columns + 16 orphan tables recurring. '
        + '(MASTER-PLAN P5-1.)',
    },
    {
      id: 'p5-errordrop-guard',
      files: ['fsi-app/scripts/verify/error-drop-audit.mjs (new)', '.github/workflows/bug-class-guard.yml'],
      task: 'Scanner flagging `const { data` supabase destructures that drop `error` (inline '
        + '// error-intentionally-ignored: escape hatch). Wire into bug-class-guard.yml soft job first, '
        + 'then hard once burned down. (GAPS #9 — 108 instances, no guard today.)',
    },
    {
      id: 'p5-count-and-migration-consistency',
      files: ['fsi-app/scripts/verify/count-consistency.mjs (new)', 'fsi-app/.discipline/consistency/checks/C3-migrations-reality.mjs'],
      task: '(1) A check asserting each surface\'s tile totals reconcile with its list/band totals '
        + '(the systemic Chrome INCONSISTENCY class) — run against fixtures or the live RPCs. (2) HARDEN '
        + 'C3 so it compares the migration inventory against the LIVE DB schema, not just committed '
        + 'files — the ledger stopped at 135 while the DB is at 153 and nothing caught it. '
        + '(Chrome count mismatches; DEEP-AUDIT ledger-drift finding.)',
    },
    {
      id: 'p5-dup-and-date-audits',
      files: ['fsi-app/scripts/verify/duplicate-instrument-audit.mjs (new)',
        'fsi-app/scripts/verify/date-completeness-audit.mjs (new)',
        'fsi-app/scripts/verify/run-data-audit-lane.mjs'],
      task: 'Two STANDING nightly guards added to the data-audit lane (the operator\'s class fix: '
        + '"the cross-reference rule should also catch duplicate info" — today NO mechanism owns the '
        + 'same-instrument question; xrefs/intersections only RELATE items). '
        + '(1) duplicate-instrument-audit: flag non-archived item pairs sharing a canonical source URL, '
        + 'normalized title, or legal-instrument number (e.g. "2025/40") that are not marked as '
        + 'supersession/xref — live-confirmed baseline: 6 groups incl. CSRD (same CELEX), PPWR 2025/40, '
        + 'AFIR 2023/1804. Red on any NEW group beyond the accepted baseline. '
        + '(2) date-completeness-audit: for verified regulation-family items, extract date candidates '
        + 'from full_brief prose and red-flag any legally-material date absent from item_timelines '
        + '(the PPWR/CSRD/AB1305/ICS2 class). Wire both into run-data-audit-lane.mjs (hard lanes).',
    },
    {
      id: 'p5-loop-smoke-and-backup',
      files: ['fsi-app/scripts/verify/loop-smoke.mjs (new)', '.github/workflows/db-backup.yml (new)'],
      task: 'End-to-end loop smoke test: stage->approve->generate->verify yields a verified item on a '
        + 'surface (read-only against a fixture is fine). Add a weekly pg_dump GHA job using '
        + 'SUPABASE_DB_PASSWORD (no backup exists today). (MASTER-PLAN P5-2/P5-4.)',
    },
  ],

  // ===== PHASE 6 — DATA INTEGRITY (operator-gated: author guarded scripts, DRY-RUN only) =====
  '6': [
    {
      id: 'p6-dedup', data: true,
      files: ['fsi-app/scripts/dataops/dedup-duplicate-items.mjs (new)'],
      task: 'CORPUS-WIDE dedup (not just PPWR). Live-confirmed 2026-07-07: 6 duplicate groups across '
        + '654 items — (a) PPWR 2025/40: efdb3390/g2 + 5cc10a6d, both verified/CRITICAL; (b) CSRD ×2 '
        + 'sharing CELEX:32022L2464; (c) AFIR 2023/1804 ×2 (one mistitled "Sustainability Reporting"); '
        + '(d) Reuters Sustainability ×2 (same URL); (e) European Clean Trucking Alliance ×2 (same '
        + 'URL+title); (f) Singapore Green Finance Incentive ×2 (same title). Author a guarded script '
        + '(scripts/lib/db.mjs, {skill,reason} cite, snapshot) that sweeps ALL non-archived items on '
        + 'three signals — canonical source URL, normalized title, legal-instrument number — plus a '
        + 'fuzzy near-title pass; for each group: keep the richer row (more sections/claims/timeline), '
        + 'archive the other via the sanctioned path, re-point xrefs/watchlist/overrides/community '
        + 'refs, and merge any unique metadata. DRY-RUN prints the disposition list only; the execute '
        + 'step is an operator_action. Root cause is fixed by p2-scan-materialize (mint-gate error-'
        + 'swallow + 1000-row dedup cap); the standing guard is p5-dup-and-date-audits.',
    },
    {
      id: 'p6-date-backfill', data: true,
      files: ['fsi-app/scripts/dataops/audit-prose-vs-timeline-dates.mjs (new)'],
      task: 'Author a READ-ONLY audit script: for each verified regulation, extract candidate '
        + 'legally-material dates from full_brief prose and diff against item_timelines.milestone_date; '
        + 'emit the gap/conflict list (PPWR Jul31-vs-Aug12, CSRD 2025, AB1305 Jan-1-2024, ICS2 Release-1, '
        + 'Reg2025/40). Then the remediation is TARGETED REGENERATION (run p2-cooldown-refresh\'s '
        + 'refresh=true on the affected items once p3-timeline-extractor is merged) — NOT a hand-edit. '
        + 'Script produces the disposition list for operator authorization; do not mutate. (Chrome '
        + 'criticals 1,4,5. Pairs with p3-timeline-extractor.)',
    },
    {
      id: 'p6-reclassification', data: true,
      files: ['fsi-app/scripts/dataops/audit-surface-misfit-items.mjs (new)'],
      task: 'Author a READ-ONLY audit flagging items on the wrong surface: enforcement/inspection item '
        + 'tagged as a market price_signal ("International Roadcheck"); a contaminated-site remediation '
        + 'as a regional_data ops fact ("Former Monsanto/Solutia"); government webpages surfaced as '
        + 'peer-reviewed research findings; Reg2025/40 tagged modes "GLOBAL"/topic "transport" for an EU '
        + 'packaging law. Output the reclassify/retag disposition list (item_type / domain / '
        + 'jurisdictions / topic). Remediation via guarded reclassifyToSource / item_type correction is '
        + 'operator-authorized per row. (Chrome WRONG_SURFACE + data-quality.)',
    },
    {
      id: 'p6-map-coverage', data: true,
      files: ['fsi-app/scripts/dataops/audit-map-coordinate-coverage.mjs (new)'],
      task: 'Author a READ-ONLY audit of why only 6 of 30 live jurisdictions are charted: which '
        + 'jurisdiction_iso values lack map coordinates/region rows, and which items lack a mappable '
        + 'jurisdiction. Output the backfill list (region -> coords) for operator-authorized guarded '
        + 'insert. (Chrome map 6/30.)',
    },
  ],
}

// ---------------------------------------------------------------------------
const requested = String((args && args.phase) != null ? args.phase : '0')
const pkgs = PACKAGES[requested]

phase('Recon')
if (!pkgs) {
  log(`No packages for phase "${requested}". Valid phases: ${Object.keys(PACKAGES).join(', ')}`)
  return { error: `unknown phase ${requested}`, valid: Object.keys(PACKAGES) }
}

const anyCollides = pkgs.some(p => p.collides_with_ui)
const recon = await agent(
  `${REF}\nRECON for remediation phase ${requested}. For each package: open its files and report '
  + 'whether the audited issue still exists (a prior phase or the parallel UI session may have changed '
  + 'it), and — for collides_with_ui packages — whether there are uncommitted local edits suggesting '
  + 'the UI session is mid-flight in those files. Packages: `
  + JSON.stringify(pkgs.map(p => ({ id: p.id, files: p.files, collides: !!p.collides_with_ui, data: !!p.data }))),
  { label: `recon:phase-${requested}`, phase: 'Recon', model: MAIN_MODEL, effort: 'high', schema: {
    type: 'object', required: ['packages'], properties: {
      ui_session_active_in_files: { type: 'boolean' },
      packages: { type: 'array', items: { type: 'object', required: ['id', 'still_applies'], properties: {
        id: { type: 'string' }, still_applies: { type: 'boolean' }, note: { type: 'string' } } } },
    } } })

if (anyCollides && recon && recon.ui_session_active_in_files) {
  log('⚠ Recon detected likely in-flight UI edits in collides_with_ui files. HALTING before writes to '
    + 'avoid clobbering the other session. Re-run this phase once the UI session has committed.')
  return { halted: 'ui_session_active', recon }
}

const stillApplies = new Set((recon?.packages || []).filter(p => p.still_applies !== false).map(p => p.id))
const todo = pkgs.filter(p => stillApplies.size === 0 || stillApplies.has(p.id))
log(`Phase ${requested}: ${todo.length}/${pkgs.length} packages (disjoint file sets run in parallel).`)

// Each package: implement -> verify -> review. Disjoint files => safe concurrency.
const results = await pipeline(
  todo,
  (p) => agent(
    `${REF}\nIMPLEMENT package ${p.id}. Files you OWN (touch ONLY these): ${p.files.join(', ')}.\n`
    + `Task: ${p.task}\n`
    + (p.data
      ? 'THIS IS A DATA-REMEDIATION package: AUTHOR the guarded script and DRY-RUN it only. Do NOT '
        + 'mutate production data. Put the exact execute command under operator_actions.'
      : 'Make the smallest correct change. If any part needs a migration apply / production data / '
        + 'system_state change, AUTHOR the file and DRY-RUN only; list the execute step under operator_actions.'),
    { label: `impl:${p.id}`, phase: 'Implement', model: MAIN_MODEL, effort: 'high', schema: IMPLEMENT_SCHEMA })
    .then(r => ({ p, impl: r })),
  ({ p, impl }) => agent(
    `${REF}\nVERIFY package ${p.id}. ${p.data
      ? 'This is a data-ops script: run it with --dry-run (must not write), and `node --test` on any '
        + 'co-located test. Confirm it reads via scripts/lib/db.mjs and cites {skill,reason}.'
      : 'Run `cd fsi-app && npm run typecheck` and `npm run build`; run `node --test` on any new .mjs.'} `
    + `Report results. Files changed: ${JSON.stringify(impl?.files_changed || [])}.`,
    { label: `verify:${p.id}`, phase: 'Verify', model: VERIFY_MODEL, effort: 'low', schema: VERIFY_SCHEMA })
    .then(v => ({ p, impl, verify: v })),
  ({ p, impl, verify }) => agent(
    `${REF}\nADVERSARIALLY REVIEW package ${p.id}. Read the actual diff for ${JSON.stringify(p.files)}. `
    + `Check: does it fix the audited issue without regressions; obey the error-destructure + '
    + 'no-raw-service-role rules; touch ONLY its owned files; and (critical) did it silently run a '
    + 'production/DB/data mutation it should have gated as an operator_action. Implementer summary: '
    + `${impl?.summary}. Verify verdict: ${verify?.verdict}.`,
    { label: `review:${p.id}`, phase: 'Review', model: MAIN_MODEL, effort: 'high', schema: REVIEW_SCHEMA })
    .then(review => ({ package: p.id, files: p.files, impl, verify, review,
      operator_actions: impl?.operator_actions || [] })),
)

phase('Operator-checklist')
const clean = results.filter(Boolean)
const operatorChecklist = clean.flatMap(r => (r.operator_actions || []).map(a => `[${r.package}] ${a}`))
const needsChanges = clean.filter(r => r.review?.verdict === 'request_changes' || r.verify?.verdict === 'red')

log(`Phase ${requested} complete: ${clean.length} packages processed, ${needsChanges.length} need follow-up.`)
if (operatorChecklist.length) log(`Operator-gated steps (NOT run):\n- ${operatorChecklist.join('\n- ')}`)

return {
  phase: requested,
  packages: clean.map(r => ({ id: r.package, verify: r.verify?.verdict, review: r.review?.verdict,
    blocking: (r.review?.findings || []).filter(f => f.severity === 'blocking') })),
  needs_followup: needsChanges.map(r => r.package),
  operator_checklist: operatorChecklist,
  note: 'Code changes are on the working tree/branch, not merged. Migration applies, system_state, and '
    + 'all Phase-6 data mutations above are for YOU to authorize and run (verification-before-authorization).',
}
