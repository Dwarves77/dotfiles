export const meta = {
  name: 'caros-ledge-remediation',
  description: 'Fix the audited Caro\'s Ledge issues, one phase at a time, with per-file ownership + verify + adversarial review',
  whenToUse: 'Run AFTER the UI session is quiescent. Pass args.phase to select a phase (0,1,2,3,4,5). Reviews between phases; production DB steps are emitted as an operator checklist, never auto-run.',
  phases: [
    { title: 'Recon' },
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Review' },
    { title: 'Operator-checklist' },
  ],
}

// ---------------------------------------------------------------------------
// HOW THIS WORKFLOW IS SAFE
// - One agent owns each FILE end-to-end. Packages that share a file are merged
//   into a single package (see notes). No two parallel agents edit one file.
// - Packages with disjoint file sets run in parallel; the pipeline verifies and
//   adversarially reviews each before it counts.
// - PRODUCTION/DB and human-authorization steps are NOT executed here. They are
//   collected and returned as an operator checklist (verification-before-authorization).
// - Run ONE phase per invocation: Workflow({ scriptPath, args: { phase: '0' } }).
//   Read the result, merge/inspect, then run the next phase.
// ---------------------------------------------------------------------------
// MODEL POLICY (operator-directed): the judgment-heavy stages — recon,
// implement, review — are pinned to Fable ('fable') at high effort because it is
// the most capable model and this work rewards capability. The mechanical verify
// stage (running typecheck/build) runs on a cheaper tier at low effort so we do
// not spend the top model on command-running. Override per-phase via
// args.model / args.verifyModel if you want to force a different tier.
// ---------------------------------------------------------------------------

const MAIN_MODEL = (args && args.model) || 'fable'      // recon / implement / review
const VERIFY_MODEL = (args && args.verifyModel) || 'sonnet'  // mechanical build/typecheck stage

const REF = 'Context for every agent: read fsi-app/.claude/CLAUDE.md (doctrine), '
  + 'DEEP-AUDIT-2026-07-07.md and MASTER-PLAN.md at repo root (findings + plan). '
  + 'All product code is under fsi-app/. Obey: destructure `error` on every supabase call; '
  + 'no raw service-role write client (use scripts/lib/db.mjs for data); fail-closed on spend/write; '
  + 'semantic tokens only in UI; accordions default-closed. Make the SMALLEST correct change. '
  + 'Do NOT apply migrations, change production data, or touch system_state — if a fix needs that, '
  + 'author the migration file + describe the apply step and report it as operator-gated, do not run it.'

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
      description: 'Any production/DB/authorization step this fix requires but did NOT run',
      items: { type: 'string' },
    },
    residual: { type: 'string', description: 'Anything left undone or uncertain' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['package', 'typecheck', 'build', 'verdict'],
  properties: {
    package: { type: 'string' },
    typecheck: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    build: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    tests: { type: 'string', description: 'Result of any targeted node --test run, or n/a' },
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
// WORK PACKAGES — grouped by file ownership. `collides_with_ui: true` marks
// read-layer/surface packages to hold until the UI session lands (rebase first).
// ---------------------------------------------------------------------------
const PACKAGES = {
  '0': [
    {
      id: 'p0-worker-secret',
      files: ['src/app/api/worker/check-sources/route.ts', 'src/app/api/worker/reconcile/route.ts',
        'src/app/api/worker/drain-first-fetch/route.ts', 'src/app/api/notifications/trigger/route.ts',
        'src/app/api/admin/recompute-trust/route.ts', 'src/app/api/admin/spot-check/recurring/route.ts',
        'src/app/api/admin/q7-daily-recompute/route.ts', 'src/lib/api/worker-auth.ts (new)'],
      task: 'Remove the `|| "dev-worker-secret"` fallback in all 7 routes; throw at module load if '
        + 'WORKER_SECRET is unset. Extract a shared `assertWorkerSecret(req)` helper into '
        + 'src/lib/api/worker-auth.ts that compares with crypto.timingSafeEqual (length-guarded) and '
        + 'have all 7 routes call it. (GAPS #1/#18, DEEP-AUDIT S1-4)',
    },
    {
      // NOTE: staged-updates/route.ts is ALSO the approve->generate fix (P2). Merged into one owner
      // here so the admin-gate lands first; phase 2 re-opens the same file for the generate wiring.
      id: 'p0-staged-admin-gate',
      files: ['src/app/api/staged-updates/route.ts'],
      task: 'Add isPlatformAdmin(auth.userId, supabase) to GET and POST before any approve/reject/'
        + 'materialize path (mirror src/app/api/admin/users/route.ts). Return 403 for non-admins. '
        + 'Do NOT add the approve->generate call yet (phase 2 owns that). (DEEP-AUDIT S1-2)',
    },
    {
      id: 'p0-security-sql',
      files: ['fsi-app/supabase/migrations/154_security_hardening.sql (new)'],
      task: 'AUTHOR ONLY (operator applies). Write a migration that: (a) replaces the anon '
        + 'SELECT USING(true) policy on intelligence_items with '
        + 'USING (provenance_status=\'verified\' AND is_archived=false); (b) drops anon SELECT on '
        + 'staged_updates and provisional_sources; (c) recreates the ERROR-level security_definer '
        + 'view without SECURITY DEFINER; (d) sets search_path on the flagged functions. Add the '
        + 'apply command + read-back checks in the commit body. Report as operator-gated. '
        + '(GAPS #4, DEEP-AUDIT S1-3, §7 advisors)',
    },
  ],
  '1': [
    {
      id: 'p1-readlayer', collides_with_ui: true,
      files: ['src/lib/supabase-server.ts'],
      task: 'Four fixes in this one file: (1) read workspace_item_overrides via the service client '
        + '(getServiceSupabase) at the ~1575/1723/1459 fetchers, destructure error; (2) join '
        + 'sources(name, base_tier, effective_tier) and map sourceName/sourceTier in the workspace '
        + 'RPCs / rpcRowToResource / fetchIntelligenceItem; (3) map the classified columns in '
        + 'fetchIntelligenceItem (severity, signal_band, theme, trajectory_points, conversion_trigger, '
        + 'what_it_changes, does_not_resolve); (4) delete the phantom reads penalty_range/'
        + 'enforcement_body/legal_instrument (no such columns). (DEEP-AUDIT §4, S1-8)',
    },
    {
      id: 'p1-watchlist-notes', collides_with_ui: true,
      files: ['src/app/api/watchlist/route.ts (new)', 'src/components/*/WatchButton usages',
        'src/components/market/MarketSignalDetailSurface.tsx (NotesField)'],
      task: 'Create POST/DELETE /api/watchlist writing user_watchlist (requireAuth, org-scoped). Wire '
        + 'the WatchButtons to it (optimistic + rollback). Repoint NotesField from localStorage to '
        + 'POST /api/workspace/overrides (notes column). (DEEP-AUDIT S1)',
    },
    {
      id: 'p1-ask-retrieval', collides_with_ui: true,
      files: ['src/app/api/ask/route.ts'],
      task: 'Replace the fixed order("priority").limit(30) context with Postgres FTS '
        + '(websearch_to_tsquery over title/summary/full_brief) scoped by the question + workspace '
        + 'jurisdictions/sectors; pass prior conversation turns; keep the verified-gate. Add a '
        + 'deterministic order tiebreak. (DEEP-AUDIT S1-9)',
    },
  ],
  '2': [
    {
      id: 'p2-scan-materialize',
      files: ['src/app/api/admin/scan/route.ts', 'src/app/api/staged-updates/route.ts', 'src/lib/intake/mint-item.ts'],
      task: 'In scan: join ALL web_search text blocks before JSON.parse (copy discovery.ts:412-416); '
        + 'paginate the dedup select. In staged-updates/mint-item: strip the 3 non-existent columns '
        + '(penalty_range/cost_mechanism/authority_level) OR author a migration adding them (operator-'
        + 'gated); stage jurisdiction_iso; resolve source_url->source_id at mint; add the error '
        + 'destructure at mint-item.ts:56/60. THEN wire approve->generate: after successful new_item '
        + 'materialization, start(generateBriefWorkflow,[itemId]). (DEEP-AUDIT §5, S1-11)',
    },
    {
      id: 'p2-cooldown-refresh',
      files: ['src/app/api/agent/run/route.ts', 'src/workflows/generate-brief.ts'],
      task: 'Accept `refresh` in the POST body and thread to start(). Add a per-item cooldown (reject '
        + 'if an agent_runs row for this item exists in the last hour). Short-circuit the workflow on '
        + 'provenance_status=\'verified\' unless refresh=true; on refresh, clear status before regen. '
        + 'Fixes the 498-runs/39-items waste + verified-desync. (DEEP-AUDIT S1-6, §5 H7)',
    },
    {
      id: 'p2-change-detection',
      files: ['src/app/api/worker/check-sources/route.ts', 'src/app/api/worker/reconcile/route.ts',
        '.github/workflows/source-monitoring.yml', 'fsi-app/supabase/migrations/155_source_content_hash.sql (new)'],
      task: 'The one net-new organ. Author a migration adding sources.content_hash (operator-gated '
        + 'apply). check-sources: fetch via the transport ladder, hash the text, set '
        + 'change_detected=true on hash mismatch, store the new hash. Add a reconcile job to '
        + 'source-monitoring.yml; make reconcile enqueue generateBriefWorkflow(itemId, refresh=true) '
        + 'for affected items. (DEEP-AUDIT §5 C1/C2)',
    },
  ],
  '3': [
    {
      // canonical-pipeline.ts is touched by profile-injection AND grounding-holes: one owner.
      id: 'p3-pipeline-quality',
      files: ['src/lib/agent/canonical-pipeline.ts', 'src/lib/agent/system-prompt.ts'],
      task: '(1) Inject the workspace profile (read workspace_settings) + a compact {id,title} list of '
        + 'candidate related items into the synthesis user message (~line 570). (2) Restrict '
        + 'criterion-2 URL auto-stubbing (~931-938) to hosts already in the pool/registry; flag novel '
        + 'hosts instead of accepting. (3) Make the reg-family authority floor unconditional on '
        + 'item_type rather than model-chosen priority. (DEEP-AUDIT S1-5, S1-7)',
    },
    {
      id: 'p3-prompt-cache',
      files: ['src/lib/agent/anthropic-stream.mjs', 'src/lib/llm/spend-client.ts', 'src/workflows/generate-brief.ts'],
      task: 'Add cache_control to the shared source-block prefix reused across synthesis/ground/'
        + 're-ground (~40-50% spend cut). Fix the double-counted daily cap: make recordRun write cost 0 '
        + '(status only) now that per-call telemetry exists, OR exclude fetch_method=\'spend-call\' from '
        + 'one of the two sums. (DEEP-AUDIT S3, §3 H1/C4)',
    },
  ],
  '4': [
    {
      id: 'p4-community-nav', collides_with_ui: true,
      files: ['src/components/community/CommunityRooms.tsx', 'src/components/Sidebar.tsx',
        'src/app/api/community/groups/route.ts (new)'],
      task: 'Link /community -> /community/browse and /community/moderation; mount the built '
        + 'NotificationsBell + realtime layer on the reachable surface. Add POST /api/community/groups '
        + '+ a create-group affordance. Fix the two /account links -> /profile. (DEEP-AUDIT §6)',
    },
    {
      id: 'p4-admin-members',
      files: ['src/components/admin/AdminDashboard.tsx', 'src/components/admin/redesign/MembersPanel.tsx'],
      task: 'Fix addMember to route to /api/orgs/[org_id]/invitations (it currently discards the email '
        + 'and re-inserts the caller). Wire the honest-pending admin MembersPanel to the existing '
        + '/api/orgs/[org_id]/members backend like the profile-side panel already does. (DEEP-AUDIT §6)',
    },
    {
      id: 'p4-notifications',
      files: ['src/lib/notifications/dispatch.ts'],
      task: 'Read notification_preferences before inserting; add the missing mention/promote dispatch '
        + 'sites OR explicitly scope them out in UI. Leave email as a documented TODO unless a provider '
        + 'is chosen. (DEEP-AUDIT §6)',
    },
  ],
  '5': [
    {
      id: 'p5-wiredness-fitness',
      files: ['fsi-app/.discipline/fitness/functions/F18-wiredness.mjs (new)', 'fsi-app/.discipline/manifest.mjs'],
      task: 'Fitness function: every public table/column/RPC must have a live consumer in src/scripts '
        + 'OR an explicit @orphan/@shelved annotation in a registry. Fail on a third state. Register in '
        + 'the manifest. This is the structural antidote to the half-built pattern. (MASTER-PLAN P5-1)',
    },
    {
      id: 'p5-errordrop-guard',
      files: ['fsi-app/scripts/verify/error-drop-audit.mjs (new)', '.github/workflows/bug-class-guard.yml'],
      task: 'Scanner flagging `const { data` supabase destructures that drop `error` (with an inline '
        + '// error-intentionally-ignored: escape hatch). Wire into bug-class-guard.yml soft job first. '
        + '(GAPS #9, MASTER-PLAN P5-3)',
    },
    {
      id: 'p5-loop-smoke-and-backup',
      files: ['fsi-app/scripts/verify/loop-smoke.mjs (new)', '.github/workflows/db-backup.yml (new)'],
      task: 'End-to-end loop smoke test asserting a stage->approve->generate->verify path yields a '
        + 'verified item on a surface (can run read-only against a fixture). Add a weekly pg_dump GHA '
        + 'job using SUPABASE_DB_PASSWORD. (MASTER-PLAN P5-2/P5-4)',
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

// Recon: confirm current file state so implementers don't work from stale audit anchors,
// and detect whether the UI session has touched collides_with_ui files.
const recon = await agent(
  `${REF}\nRECON for remediation phase ${requested}. For each package below, open its files and report: `
  + `does the audited issue still exist (the UI session or a prior phase may have changed it), and are `
  + `there uncommitted local edits that suggest the UI session is mid-flight in these files? `
  + `Packages: ${JSON.stringify(pkgs.map(p => ({ id: p.id, files: p.files, collides: !!p.collides_with_ui })))}`,
  { label: `recon:phase-${requested}`, phase: 'Recon', model: MAIN_MODEL, effort: 'high', schema: {
    type: 'object', required: ['packages'], properties: {
      ui_session_active_in_files: { type: 'boolean' },
      packages: { type: 'array', items: { type: 'object', required: ['id', 'still_applies'], properties: {
        id: { type: 'string' }, still_applies: { type: 'boolean' }, note: { type: 'string' } } } },
    } } })

if (recon && recon.ui_session_active_in_files) {
  log('⚠ Recon detected likely in-flight UI edits in these files. HALTING before writes to avoid '
    + 'clobbering the other session. Re-run this phase once the UI session has committed.')
  return { halted: 'ui_session_active', recon }
}

const stillApplies = new Set((recon?.packages || []).filter(p => p.still_applies !== false).map(p => p.id))
const todo = pkgs.filter(p => stillApplies.size === 0 || stillApplies.has(p.id))
log(`Phase ${requested}: implementing ${todo.length}/${pkgs.length} packages (disjoint file sets run in parallel).`)

// Each package: implement -> verify -> review. Packages have disjoint files, so pipeline() runs
// them independently and concurrently; no two agents touch the same file.
const results = await pipeline(
  todo,
  (p) => agent(
    `${REF}\nIMPLEMENT package ${p.id}. Files you OWN (touch ONLY these): ${p.files.join(', ')}.\n`
    + `Task: ${p.task}\nMake the smallest correct change. If any part requires a production DB apply, `
    + `a migration apply, or changing system_state, DO NOT run it — author the file if applicable and `
    + `list the exact step under operator_actions.`,
    { label: `impl:${p.id}`, phase: 'Implement', model: MAIN_MODEL, effort: 'high', schema: IMPLEMENT_SCHEMA })
    .then(r => ({ p, impl: r })),
  ({ p, impl }) => agent(
    `${REF}\nVERIFY package ${p.id}. Run \`cd fsi-app && npm run typecheck\` and \`npm run build\`. `
    + `If the package added a .mjs with a co-located test, run \`node --test\` on it. Report results. `
    + `Files changed: ${JSON.stringify(impl?.files_changed || [])}.`,
    { label: `verify:${p.id}`, phase: 'Verify', model: VERIFY_MODEL, effort: 'low', schema: VERIFY_SCHEMA })
    .then(v => ({ p, impl, verify: v })),
  ({ p, impl, verify }) => agent(
    `${REF}\nADVERSARIALLY REVIEW package ${p.id}. Read the actual diff for ${JSON.stringify(p.files)}. `
    + `Check: does it fix the audited issue without regressions; does it obey the error-destructure and `
    + `no-raw-service-role rules; did it touch any file outside its ownership; did it silently run a `
    + `production/DB action it should have gated. Implementer summary: ${impl?.summary}. `
    + `Verify verdict: ${verify?.verdict}.`,
    { label: `review:${p.id}`, phase: 'Review', model: MAIN_MODEL, effort: 'high', schema: REVIEW_SCHEMA })
    .then(review => ({ package: p.id, files: p.files, impl, verify, review,
      operator_actions: impl?.operator_actions || [] })),
)

phase('Operator-checklist')
const clean = results.filter(Boolean)
const operatorChecklist = clean.flatMap(r => (r.operator_actions || []).map(a => `[${r.package}] ${a}`))
const needsChanges = clean.filter(r => r.review?.verdict === 'request_changes' || r.verify?.verdict === 'red')

log(`Phase ${requested} complete: ${clean.length} packages processed, ${needsChanges.length} need follow-up.`)
if (operatorChecklist.length) log(`Operator-gated steps (NOT run): \n- ${operatorChecklist.join('\n- ')}`)

return {
  phase: requested,
  packages: clean.map(r => ({ id: r.package, verify: r.verify?.verdict, review: r.review?.verdict,
    blocking: (r.review?.findings || []).filter(f => f.severity === 'blocking') })),
  needs_followup: needsChanges.map(r => r.package),
  operator_checklist: operatorChecklist,
  note: 'Code changes are on the working tree/branch, not merged. Production/DB steps above are for '
    + 'you to authorize and run per verification-before-authorization.',
}
