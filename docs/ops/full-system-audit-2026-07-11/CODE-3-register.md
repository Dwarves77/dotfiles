# CODE-3 Register — API/RPC & Data Access (2026-07-11)

Agent: CODE-3. Slice per coverage-manifest §A: `fsi-app/src/app/api/**` (81 route.ts), `src/lib/api/**` (7), `src/lib/supabase*` (3), `src/stores/**` (6) = **97 files / 21,202 lines**, all read line-by-line at baseline master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b`. READ-ONLY; no DB queries were needed for this register (cross-wiring against live DB objects is X-agent scope; RPC/column expectations are handed off below).

Severity: **P1** = correctness/security defect, act; **P2** = latent defect / drift / invariant gap; **P3** = observation, dead code, hygiene.

---

## 1. Route inventory (81 routes)

Legend — Auth: `RA` = requireAuth (Bearer JWT, any authenticated user), `RA+PA` = requireAuth + isPlatformAdmin(profiles.is_platform_admin), `CA` = requireCommunityAuth (cookie session, Bearer fallback), `WS` = workerAuthGuard (x-worker-secret; `WS+B` also accepts Bearer CRON_SECRET), `PUB` = unauthenticated by design. RL = checkRateLimit (in-memory 60/min/user). Cred: `svc` = service-role client, `rls` = caller's RLS-aware client, `anon` = anon key. Pause = pausedResponse/isGloballyPaused gate present. Caller = UI component / server / cron / **none found**.

| Route | Methods | Auth | RL | Cred | Pause | Caller |
|---|---|---|---|---|---|---|
| /api/admin/attention | GET | RA+PA | y | svc | – | useAdminAttention.ts |
| /api/admin/b2-progress | GET | RA+PA | y | svc | – | B2ProgressBanner |
| /api/admin/canonical-sources/bulk-approve | POST | RA+PA | y | svc | – | CanonicalSourceReview |
| /api/admin/canonical-sources/bulk-classify | POST | RA+PA | y | svc+Haiku | – | CanonicalSourceReview |
| /api/admin/canonical-sources/decide | POST | RA+PA | y | svc | – | CanonicalSourceReview |
| /api/admin/canonical-sources/pending | GET | RA+PA | y | svc | – | CanonicalSourceReview |
| /api/admin/canonical-sources/recommend-classification | POST | RA+PA | y | svc+Haiku | – | CanonicalSourceReview |
| /api/admin/coverage | GET | RA+PA | y | svc | – | CoverageMatrixView |
| /api/admin/integrity-flags | GET, PATCH | RA+PA | y | svc | – | IntegrityFlagsView, PlatformIntegrityFlagsView |
| /api/admin/integrity-flags/[id]/regenerate | POST | RA+PA | y | svc (+forwards Bearer to agent/run) | – | IntegrityFlagsView |
| /api/admin/integrity-flags/[id]/resolve | POST | RA+PA | y | svc | – | IntegrityFlagsView |
| /api/admin/intersections | GET | RA+PA | y | svc | – | IntersectionDetectionView |
| /api/admin/q7-daily-recompute | POST | WS+B | n | svc | – | scripts/cron/q7-daily-recompute.mjs (manual; nightly cron retired) |
| /api/admin/recompute-trust | POST | WS | n | svc | y (skip) | cron/manual (GHA workflow referenced, not in slice) |
| /api/admin/scan | POST | RA+PA | y | svc+Sonnet(spendSearch) | y | AdminDashboard |
| /api/admin/sources/[id]/fetch-now | POST | RA+PA | y | svc+Browserless | y | SourceAdminControls |
| /api/admin/sources/[id]/pause | POST | RA+PA | y | svc | – | SourceAdminControls |
| /api/admin/sources/[id]/regenerate-brief | POST | RA+PA | y | svc (+forwards Bearer to agent/run) | – (delegated) | SourceAdminControls |
| /api/admin/sources/[id]/tier-override | GET, POST | RA+PA | y | svc | – | SourceAdminControls, TierOpinionDisagreementsView |
| /api/admin/sources/[id]/visibility | POST | RA+PA | y | svc | – | SourceAdminControls |
| /api/admin/sources/bulk-import | POST | RA+PA | y | svc+Browserless | y | BulkImportView |
| /api/admin/sources/commit-tier-change | POST | RA+PA | y | svc | – | SourceTierAuditPanel |
| /api/admin/sources/discover | POST | RA+PA | y | svc+Sonnet | y | **none found** (operator-manual per header) |
| /api/admin/sources/pause-global | GET, POST | RA+PA | y | svc | n/a (is the control) | SourceAdminControls |
| /api/admin/sources/promote | POST | RA+PA | y | svc | – | ProvisionalReviewCard |
| /api/admin/sources/recently-auto-approved | GET | RA+PA | y | svc | – | **none found** (dead endpoint, W2.E UI never wired) |
| /api/admin/sources/recommend-classification | POST | RA+PA | y | svc+Haiku | – | ProvisionalReviewCard |
| /api/admin/sources/recommend-tier | POST | RA+PA | y | svc+Haiku (lib) | – | SourceTierAuditPanel |
| /api/admin/sources/tier-opinions | GET, POST | RA+PA | y | svc | – | TierOpinionDisagreementsView |
| /api/admin/sources/verify | POST | RA+PA | y (per-candidate) | svc+Browserless+Haiku | **MISSING** (see F-05) | **none found** (discovery lib calls verifyCandidate directly) |
| /api/admin/spot-check/recurring | POST | WS | n | svc+Browserless+Haiku | y | GHA monthly cron (per header; currently disabled per CLAUDE.md) |
| /api/admin/triage/ingest-rejections | GET, POST | RA+PA | y | svc | – | IngestRejectionsView |
| /api/admin/triage/pending-jurisdiction-review | GET, POST | RA+PA | y | svc | – | PendingJurisdictionReviewView |
| /api/admin/users | GET, POST | RA+PA | y | svc (auth.admin) | – | **none found in UI** (curl/script provision flow) |
| /api/agent/run | POST | **RA only** | **n** (per-item 1h cooldown instead) | svc | delegated to workflow F16 | server-side: regenerate-brief, integrity regenerate, drain-first-fetch, staged-updates approve→generate, scripts |
| /api/ask | POST | RA | y | svc+Sonnet(spendStream) | – | AskAssistant |
| /api/auth/linkedin/start | GET | PUB (by design, OAuth) | n | none | – | OnboardingWizard |
| /api/auth/linkedin/callback | GET | PUB entry; requires cookie session for upsert | n | rls(cookie) | – | LinkedIn redirect |
| /api/community/groups | POST | CA | y | rls + svc bootstrap | – | CommunityRooms |
| /api/community/groups/[id]/invitations | GET | CA | y | rls | – | GroupModals |
| /api/community/groups/[id]/invite-candidates | GET | CA | y | rls | – | GroupModals |
| /api/community/groups/[id]/invite | POST | CA | y | rls | – | GroupModals |
| /api/community/groups/[id]/join | POST | CA | y | rls + svc insert after public check | – | GroupCard/GroupHeader |
| /api/community/groups/[id]/members | GET, DELETE | CA | y | rls | – | GroupModals |
| /api/community/groups/[id]/settings | PATCH | CA | y | rls | – | GroupModals |
| /api/community/groups/[id]/star | PATCH | CA | y | rls | – | GroupCard |
| /api/community/invitations/[id]/accept | POST | CA | y | rls + svc member insert | – | CommunityShell/GroupModals |
| /api/community/invitations/[id]/decline | POST | CA | y | rls | – | CommunityShell/GroupModals |
| /api/community/invitations/[id]/revoke | POST | CA | y | rls check + svc write | – | GroupModals |
| /api/community/moderation/reports | GET, POST | CA | y | rls | – | ModerationQueue, ReportPostMenu |
| /api/community/moderation/reports/[id] | GET, POST | CA | y | rls (+svc notification via dispatch) | – | ModerationActions |
| /api/community/notifications | GET, POST | CA | y | rls | – | NotificationsBell/NotificationsList |
| /api/community/notifications/[id] | GET, POST | CA | y | rls | – | NotificationsList |
| /api/community/notifications/counts | GET | CA | y | rls | – | CommunitySidebar |
| /api/community/notifications/preferences | GET, PUT | CA | y | rls | – | NotificationPreferencesPanel |
| /api/community/posts | GET, POST | CA | y | rls | – | PostList/PostComposer/CommunityRooms |
| /api/community/posts/[id] | GET, PATCH, DELETE | CA | y | rls | – | Post.tsx, CommunityRooms |
| /api/community/posts/[id]/promote | POST | CA (member) | y | rls check + svc staged write | – | PromotePostDialog |
| /api/community/posts/[id]/replies | GET, POST | CA | y | rls | – | ReplyComposer/PostList |
| /api/community/posts/[id]/signoff | POST | CA (RLS is gate) | y | rls | – | CommunityRooms |
| /api/community/search | GET | CA | y | rls | – | CommunitySearchResults |
| /api/community/signoff/[id]/decide | POST | CA (verifier via RLS) | y | rls + svc post-stamp | – | CommunityRooms |
| /api/community/signoff/[id]/withdraw | POST | CA (RLS mig 154) | y | rls | – | CommunityRooms |
| /api/intelligence-items/[id]/metadata | GET | RA | y | svc | – | IntelligenceMetadataStrip |
| /api/invitations/[token] | GET | CA | y | rls (SECURITY DEFINER RPC) | – | InvitationLandingPage, NoWorkspaceLanding |
| /api/invitations/[token]/accept | POST | CA | y | rls RPC | – | InvitationLandingPage |
| /api/invitations/[token]/decline | POST | CA | y | rls RPC | – | InvitationLandingPage |
| /api/invitations/mine | GET | CA | y | svc | – | NoWorkspaceLanding |
| /api/notifications/trigger | POST | WS | n | svc | – | **none found** (webhook/worker never wired; target tables all empty) |
| /api/orgs | POST | CA | y | rls RPC | – | NoWorkspaceLanding |
| /api/orgs/[org_id] | GET, PATCH | CA (member / owner) | y | svc after membership check | – | OrganizationPanel |
| /api/orgs/[org_id]/invitations | GET, POST | CA (RLS admin) | y | rls | – | InvitationsPanel |
| /api/orgs/[org_id]/invitations/[id] | DELETE | CA (RPC gate) | y | rls RPC | – | InvitationsPanel |
| /api/orgs/[org_id]/members | GET, PATCH, PUT, POST(ban), DELETE | CA + owner-or-platform-admin | y | svc after explicit gates | – | MembersPanel (admin + profile) |
| /api/staged-updates | GET, POST | RA+PA | y | svc | y (approve→generate only) | AdminDashboard |
| /api/watchlist | GET, POST, DELETE | RA | y | svc scoped to caller id | – | WatchButton |
| /api/worker/check-sources | POST | WS | n | svc+Browserless | y (off-gate + window-gate) | GHA hourly cron (dotfiles workflows) |
| /api/worker/drain-first-fetch | POST | WS | n | svc (+minted user JWT → agent/run) | y (off-gate + window-gate) | GHA cron |
| /api/worker/reconcile | POST | WS | n | svc | y | cron/manual |
| /api/workspace/overrides | POST, DELETE | RA | y | svc scoped by resolved orgId | – | resourceStore, MarketSignalDetailSurface |
| /api/workspace/regulations-defaults | GET, PUT, POST | RA | y | svc scoped by resolved orgId | – | RegulationsSurface |

**Unguarded routes: none.** Every route has requireAuth / requireCommunityAuth / workerAuthGuard except the two LinkedIn OAuth legs, which are public by protocol design (start sets CSRF state; callback requires a cookie session before any write). Worker-secret routes fail closed on unset WORKER_SECRET (worker-auth.ts, constant-time compare).

---

## 2. Findings

### P1

- **F-01 — fetchDashboardData timeout fallback still serves SEED data.** `src/lib/supabase-server.ts:1425-1452`: the `withTimeout` fallback tuple passes `seedResources/seedArchived/seedChangelog/seedDisputes/seedXrefPairs/seedSupersessions`. On an 8s timeout, `resources = seedResources` (non-empty), so the `!resources.length` empty+`_error` sentinel branch does NOT fire and the dashboard renders seed content as if live — contradicting the SF-2 Phase 1 decision documented 60 lines earlier ("empty payload + _error sentinel **replaces** the prior seed-data fallback"; seed carries no source attribution → integrity-rule violation) and leaking around the provenance read gate on the home surface. The sibling fetchers (fetchMapData:1682-1694, fetchListingsMapData, fetchSettingsData) already use empty fallbacks — only fetchDashboardData kept the seed tuple. Next action: replace the fallback tuple with empties (identical to fetchMapData) so the timeout path lands in the `rpc_error` sentinel branch.

- **F-02 — Stale caller contract against async /api/agent/run (two admin routes).** `/api/agent/run` (route.ts:124-139) now `start()`s the durable workflow and returns **202 {runId} immediately**. Two callers still assume the pre-Sprint-4 synchronous contract:
  - `admin/sources/[id]/regenerate-brief/route.ts:66-121` posts `{sourceUrl, bypassPause:true}` (`bypassPause` is a **dead parameter** — agent/run reads only itemId/sourceUrl/refresh), then reads `payload.items_found/items_signal/synopses_written/citations_extracted/citations_written/provisionals_created` — none exist on the 202 body, so the response always reports zeros — and reads `intelligence_items.full_brief` **before** the workflow has run, reporting the pre-regeneration briefLength as if it were the result.
  - `admin/integrity-flags/[id]/regenerate/route.ts:105-163` treats the 202 as "agent succeeded", immediately re-reads the flag (still true because the workflow hasn't executed), and returns `regenerated:true, stillFlagged:true` on every call; the auto-resolve path (the route's whole purpose) is unreachable. Both also treat the `{skipped:"already_verified"}` 200 as success.
  Next action: rewrite both callers around the async contract (return runId + instruct the UI to poll agent_runs, or call `start()` directly like staged-updates does), and delete `bypassPause`.

- **F-03 — /api/agent/run is the only spend-triggering route without an admin gate or rate limiter.** route.ts:24-28: `requireAuth` only — any authenticated user (incl. viewer-role members) can start a paid generation workflow (Browserless + Sonnet, ~$0.15/item per CLAUDE.md). Mitigations exist (verified-item skip :91, per-item 1h cooldown via agent_runs :105-122, F16 fetch-hold 503 in the workflow), but there is no checkRateLimit and no isPlatformAdmin, so an authenticated user could iterate itemIds across the 653-item corpus (once per item per hour). CLAUDE.md's route table also states "1h cooldown per source" while the code implements per-**item** cooldown. Next action: add isPlatformAdmin (all legitimate callers are admin-forwarded or worker-minted admin tokens) or at least checkRateLimit; reconcile the doctrine wording.

- **F-04 — Error-swallow with a mutation consequence in integrity regenerate.** `admin/integrity-flags/[id]/regenerate/route.ts:140-146`: `const { data: refreshed } = await …` (no error). If the re-read ERRORS, `refreshed` is null → `stillFlagged=false` → the route proceeds to **auto-resolve** the flag on an item whose brief may still be flagged. This is the documented post-mortem smell shape with a write on the false-negative path. (Currently masked by F-02 — the flag is still true because the workflow hasn't run — but the code shape is the class defect.) Next action: destructure and fail closed on read error (skip auto-resolve, surface the error).

### P2

- **F-05 — /api/admin/sources/verify has no global-pause gate.** verify/route.ts runs `verifyCandidate` (reachability render + content GET + Haiku) per candidate with no `pausedResponse` call. The Phase 0.1 doctrine ("EVERY outbound-fetch entry point", pause.ts:1-6) lists check-sources, drain-first-fetch, spot-check, scan, bulk-import, fetch-now, discover, agent/run — verify is the one fetch-capable route omitted (in code AND in the pause.ts comment list). Mitigant: no caller currently exists (see F-19). Next action: add the gate (or retire the route, F-19).

- **F-06 — Legacy `tier` column selected on sources.** `admin/sources/recently-auto-approved/route.ts:70` selects `"…url, description, tier, jurisdictions…"` — the only remaining read of the pre-Phase-1.5 `tier` column in this slice (everything else uses base_tier/effective_tier via the mig-094 compat shim). If/when the shim or column is retired this route 500s. X-agent: confirm `sources.tier` still exists.

- **F-07 — api_endpoint vs api_endpoint_url split.** `admin/sources/[id]/fetch-now/route.ts:88` selects `sources.api_endpoint`; `worker/drain-first-fetch/route.ts:456` selects `sources.api_endpoint_url` (+ `api_auth_method`, `api_response_format`). Two different column names for the same concept across the two fetch paths — at least one is legacy. X-agent: check which exist; whichever route reads a nonexistent column gets a PostgREST error (fetch-now would 404 "Source not found" via the `.single()` error path — silent misbehavior class).

- **F-08 — drain-first-fetch mints an admin user JWT with a hardcoded personal-email fallback.** `worker/drain-first-fetch/route.ts:114-157`: service-role `auth.admin.generateLink(magiclink)` + `verifyOtp` mints a real session token for `DRAIN_WORKER_EMAIL || ADMIN_EMAIL || "jasonlosh@hotmail.com"`. A privilege-conversion pattern (service key → arbitrary user's session) with a hardcoded identity as last resort; also belongs to the out-of-repo-boundary class (behavior depends on which env vars are set). Next action: require DRAIN_WORKER_EMAIL and fail closed; drop the literal email.

- **F-09 — /api/ask FTS path does not re-apply the customer read gate; rate-limit doctrine drift.** ask/route.ts:150-159: the hit-row re-fetch (`.in("id", hitIds)` with CITATION_SELECT) applies **no** `is_archived=false` / `provenance_status='verified'` filters — it trusts `search_intelligence_items` (mig 159) to have enforced them internally; only the low-signal fallback (:162-168) applies the gate explicitly. If the RPC's internal gate ever drifts, quarantined/archived content reaches the assistant context via service-role. Also: CLAUDE.md's live-API table says /api/ask is limited "10/workspace/hour"; the code has only the generic 60/min/user limiter. X-agent: verify the RPC body enforces verified+non-archived. Next action: re-apply the two filters on the re-fetch (cheap belt), reconcile doctrine.

- **F-10 — /api/intelligence-items/[id]/metadata has no provenance/archive gate.** metadata/route.ts:39-47 selects by raw UUID via service-role with no `provenance_status`/`is_archived` filter — any authenticated user can read title/severity/tags/intersection_summary for quarantined items. Metadata-only (no full_brief), but the customer read gate (Sprint 4 task 1.10) is verified-only elsewhere. Policy call: flag for operator ruling.

- **F-11 — In-memory rate limiter and cooldowns are per-serverless-instance.** rate-limit.ts Map store means each Vercel lambda instance has its own window; the effective global limit is 60/min × concurrent instances. Documented in-file ("replace with Redis in production") — accepted debt, recorded so the "rate limiting is enforced" doctrine claim is read with the caveat.

- **F-12 — Hardcoded stale contract version in b2-progress.** b2-progress/route.ts:15 `CURRENT_SKILL_VERSION = "2026-04-29"` — doctrine says the contract version is emitted live as regeneration_skill_version, "not pinned in this doc"; this route pins it, so at_current/pct_complete are computed against a 2026-04 version and are misleading against the current contract. Next action: derive the current version from the live max(regeneration_skill_version) or a single SoT constant.

- **F-13 — /api/notifications/trigger is an orphan writer to an empty subsystem.** No caller anywhere in the repo (no webhook config in-slice); targets notification_events/notification_subscriptions/notification_deliveries — all 0-row tables (manifest §B). Its three subscriber selects drop `error` and the deliveries insert is unchecked. Note the naming collision: the LIVE community notification path is `notifications` (mig 032) via `dispatchNotification`, unrelated to this route. Next action: retire or wire; don't leave both.

- **F-14 — settingsStore writes workspace_settings from the BROWSER with total error swallow.** stores/settingsStore.ts:52-79 `debouncedSave` runs `.update(...)` on workspace_settings via the anon browser client, result unchecked, catch empty; loadFromWorkspace (:162) drops `error` too. RLS assumption: authenticated members must hold UPDATE on workspace_settings or every settings toggle silently never persists (classic reconciler-credential-class: code assumes a policy that may not exist). X-agent: confirm workspace_settings UPDATE policy for org members; if absent this store is a no-op writer.

- **F-15 — Anon-client reads with dropped errors across supabase-server.ts (RLS-assumption cluster).** fetchChangelog(:82), fetchDisputes(:112), fetchXrefPairs(:145), fetchSupersessions(:169), fetchSources(:340), fetchProvisionalSources(:346), fetchOpenConflicts(:379), fetchResearchPipelineRows count query(:842, error unchecked), item_timelines read inside fetchWorkspaceResources(:508 — anon client while the items came from the service-role RPC; warn-only). All use `getSupabase()` (anon) and most drop `error` — if anon SELECT RLS is missing/revoked on any of item_changelog, item_disputes, item_cross_references, item_supersessions, item_timelines, sources, provisional_sources, source_conflicts, source_bias_tags, intelligence_items(research read), sector_contexts, intelligence_changes, the surface silently renders empty (the documented Wave-1a class). X-agent: verify anon SELECT policies for that table list.

- **F-16 — ban_user moderation action has no re-join block.** community/moderation/reports/[id]/route.ts:345-367: `ban_user` only DELETEs the community_group_members row. For a public group the banned user can immediately self-re-join via /join (which checks only privacy+membership). Contrast: org-level ban (orgs/[org_id]/members POST) writes org_member_bans and accept_invitation enforces it (mig 156). No community_group_bans equivalent exists. Also the report `reason` column sentinel-encoding (`reason|body||action=…`) corrupts if user text contains `|`/`||`. Next action: group-ban table or mute column (the header itself marks mute_user as a Phase D stub).

- **F-17 — Silent-swallow writes on the canonical review path.** Audit-trail `source_trust_events` inserts are unchecked in canonical-sources/decide (:285), bulk-approve (:181), promote (:217, :263) — an audit row can silently fail while the promotion succeeds; inconsistent with tier-override (:282-305) which surfaces the audit failure as a `warning`. bulk-approve also leaves the candidate-approved UPDATE (:220-230) unchecked. Next action: adopt the tier-override warning pattern at all four sites.

- **F-18 — worker/check-sources persistence writes unchecked.** check-sources/route.ts:88-103: the sources UPDATE, source_trust_events INSERT and monitoring_queue INSERT results are all discarded. monitoring_queue is the reconcile-loop FEED (worker/reconcile consumes change_detected rows) — a failed insert silently drops a change signal (INV-3 / silent-error-swallow class, D3 living-set entry 1 shape). Next action: check + log at minimum.

### P3

- **F-19 — Dead endpoints (no caller found in repo).** `/api/admin/sources/verify` (discovery lib imports verifyCandidate directly; route unused), `/api/admin/sources/recently-auto-approved` (W2.E queue surface never wired to UI), `/api/admin/sources/discover` (operator-manual only per header; no UI), `/api/admin/users` (no UI; provision-by-curl), `/api/notifications/trigger` (F-13). Worker/cron routes (check-sources, drain-first-fetch, reconcile, q7, recompute-trust, spot-check) are externally invoked — not dead, but their cron wiring lives out-of-repo/in .github (CODE-2/X-agent to confirm which are actually scheduled).

- **F-20 — Phantom routes referenced in comments.** `/api/admin/sources/all` (visibility/route.ts:5 — does not exist; admin list actually hydrates via getSourceData server-side), `/api/auth/linkedin/status` (linkedin/start:13 — does not exist; the wizard gates on nothing of the sort). Comment drift only.

- **F-21 — LinkedIn OAuth uses deprecated scopes.** start/route.ts:30 `r_liteprofile r_emailaddress` — LinkedIn retired these for new apps (OpenID Connect `openid profile email` is current). Flow will fail at the provider for a newly provisioned app. External-dependency observation.

- **F-22 — Non-handler exports from route.ts files.** bulk-import (headReachabilityDecision + headReachabilityDecision_LEGACY_BUGGY — deliberately retained buggy baseline), check-sources (assessAndUpdateSource), drain-first-fetch (seedStubIntelligenceItem), linkedin/start (STATE_COOKIE consts imported by callback). Works under current Next config; fragile against route-export typechecking; test-only exports would sit better in lib/.

- **F-23 — Dead/dormant data paths.** (a) fetchDashboardData `allSynopses` is a hardcoded empty array (:1470-1506) → DashboardData.synopses always [] → resourceStore.setSynopses/synopses slice permanently empty; setIntelligenceChanges reads intelligence_changes (0-row table, DB-3) → slice effectively empty; setSectorDisplayNames populated but its consumers are the shelved sector surface. (b) fetchOpenConflicts + sourceStore.openConflicts + "conflicts" activeView run against the 0-row source_conflicts table — dormant surface. (c) workspaceStore.setJurisdictionWeights/setSectorWeights are **never called** (grep: definitions only); AskAssistant/HomeSurface/RegulationsSurface read the permanently-null values → urgencyScore always uses default weights; state shape promises a feature that has no writer.

- **F-24 — scan route bookkeeping.** scan/route.ts:326 `.single()` on existing-source lookup swallows real errors (returns null on both no-row and failure); :333 provisional upsert unchecked yet `sourcesAdded.push` runs regardless (response can overreport new sources); :429 staged insert failures silently omitted from stagedItems with no log; cooldown upsert (:434) unchecked (documented as intentional pre-mig-024 tolerance).

- **F-25 — Hardcoded literal dates in audit notes.** decide:268, bulk-approve:158, promote:182 stamp `"…2026-04-28…"` in sources.notes regardless of actual date — every future promotion carries a false date in its provenance note.

- **F-26 — pause.ts fail-open helpers.** isSourcePaused/pauseReason return `false`/null on read error (fail-open for the per-source flag) while getScrapeState fails closed for the global gate — asymmetry is deliberate per comments but worth noting: a DB read error can bypass a per-source pause.

- **F-27 — resourceStore has no DELETE usage of persistOverride.** The `method: "POST" | "DELETE"` signature supports DELETE but every store action uses POST; the route's DELETE handler is reachable only from MarketSignalDetailSurface (if at all). Minor: confirm the DELETE path has a live caller or note as reserved.

- **F-28 — supabase-server fetchIntelligenceItem uses `select("*")`** (:2215) — schema-drift-tolerant but pulls full_brief + every column for the detail page; the P1-4 comment shows phantom columns were already pruned once. Acceptable; noted for the column map (wildcard).

- **F-29 — /api/orgs/[org_id]/members is the reference implementation.** getMembership returns {membership,error} forcing fail-closed handling; last-owner guards fail closed on unverifiable counts; ban-then-delete ordering. Cited as the pattern the P2 swallow sites should converge on (positive finding).

---

## 3. RPC call map (machine-readable, for X-agent cross-check)

```yaml
rpc_calls:
  - {name: get_workspace_intelligence,            args: {p_org_id: uuid}, shape: item rows (full incl. full_brief), caller: supabase-server.ts:494, cred: service}
  - {name: get_workspace_intelligence_slim,       args: {p_org_id: uuid}, shape: item rows minus full_brief/operational_impact/open_questions/reasoning, caller: supabase-server.ts:494, cred: service}
  - {name: get_workspace_intelligence_dashboard,  args: {p_org_id: uuid}, shape: slim minus what_is_it/why_matters/key_data, LIMIT 50, caller: supabase-server.ts:494, cred: service}
  - {name: get_workspace_intelligence_listings,   args: {p_org_id: uuid}, shape: slim minus summary, no limit, caller: supabase-server.ts:494, cred: service}
  - {name: get_workspace_intelligence_aggregates, args: {p_org_id: uuid}, shape: jsonb {total_items,by_priority,by_status,by_jurisdiction,total_jurisdictions,last_updated_at}, caller: supabase-server.ts:619, cred: service}
  - {name: get_workspace_intelligence_aggregates_scoped, args: {p_org_id: uuid, p_scope_filter: jsonb|null}, shape: same as aggregates, caller: supabase-server.ts:694, cred: service}
  - {name: get_surface_counts,                    args: {p_org_id: uuid, p_surface: text}, shape: aggregates superset + by_severity/by_band, caller: supabase-server.ts:747, cred: service, note: null-on-absence fail-soft}
  - {name: get_source_citation_stats,             args: {source_ids: uuid[]}, shape: rows {source_id, citation_count, recency}, callers: supabase-server.ts:908/1189/1287 (anon+service), ask/route.ts:397 (service)}
  - {name: get_research_source_coverage,          args: {}, shape: rows {transport_mode, jurisdiction_iso, source_count}, caller: supabase-server.ts:992, cred: anon}
  - {name: get_market_intel_items,                args: {p_org_id: uuid}, shape: slim+ item rows (severity/signal_band/theme/trajectory_points/callouts), caller: supabase-server.ts:1138, cred: service}
  - {name: get_research_items,                    args: {p_org_id: uuid}, shape: slim+ rows, caller: supabase-server.ts:1138, cred: service}
  - {name: get_operations_items,                  args: {p_org_id: uuid}, shape: slim+ rows, caller: supabase-server.ts:1138, cred: service}
  - {name: get_technology_items,                  args: {p_org_id: uuid}, shape: slim+ rows (item_type-gated mig 134), caller: supabase-server.ts:1138, cred: service}
  - {name: admin_attention_counts,                args: {}, shape: 1 row {provisional_sources_pending, staged_updates_pending, staged_updates_materialization_failed, integrity_flags_unresolved, platform_integrity_flags_open, source_attribution_mismatches, auto_approved_awaiting_spotcheck, coverage_gaps_critical, total}, caller: admin/attention:87, cred: service}
  - {name: coverage_matrix,                       args: {}, shape: rows {jurisdiction_iso, item_type ('__no_items__' sentinel), item_count, source_count, most_recent_item_at, oldest_item_at, has_critical}, caller: admin/coverage:166, cred: service}
  - {name: detect_intersections,                  args: {min_strength: int, max_results: int}, shape: rows incl. explicitly_linked, strength, caller: admin/intersections:51, cred: service}
  - {name: get_tier_opinion_disagreements,        args: {window_days: int}, shape: rows {target_source_id, current_base_tier, opined_tiers[], opinion_count, distinct_disagreeing_tiers}, caller: tier-opinions:81, cred: service}
  - {name: search_intelligence_items,             args: {q: text, max_rows: int}, shape: rows {id,...} rank-ordered; MUST enforce verified+non-archived internally (see F-09), caller: ask:144, cred: service}
  - {name: create_org_for_self,                   args: {p_org_name: text, p_org_slug: text|null}, shape: org_id uuid, caller: orgs:49, cred: rls (auth.uid() inside)}
  - {name: lookup_invitation,                     args: {p_token: text}, shape: rows {id,org_id,org_name,invited_email,proposed_role,status,created_at,expires_at,is_expired}, caller: invitations/[token]:38, cred: rls, security_definer: true}
  - {name: accept_invitation,                     args: {p_token: text}, shape: org_id uuid; error codes 42501/P0002/22023 mapped; enforces org_member_bans (mig 156), caller: invitations accept:33, cred: rls}
  - {name: decline_invitation,                    args: {p_token: text}, shape: void, caller: invitations decline:31, cred: rls}
  - {name: revoke_invitation,                     args: {p_invitation_id: uuid}, shape: void, caller: orgs/[org_id]/invitations/[id]:33, cred: rls}
```
Additional RPC surface reached indirectly from this slice (via lib, out-of-slice code): `validate_item_provenance` (workflow), spend RPCs in spend-client — CODE-1 scope.

---

## 4. Column-expectation map (table → columns referenced in this slice; machine-readable)

```yaml
select_map:
  sources:
    read: [id, name, url, description, base_tier, effective_tier, tier_override, tier_at_creation, override_reason, override_date,
           intelligence_types, domains, jurisdictions, transport_modes, update_frequency, last_checked, last_substantive_change,
           next_scheduled_check, status, paywalled, access_method, api_endpoint, api_endpoint_url, api_auth_method,
           api_response_format, rss_feed_url, confirmation_count, conflict_count, conflict_total, accuracy_rate,
           avg_lead_time_days, lead_time_samples, consecutive_accessible, total_checks, successful_checks, accessibility_rate,
           last_accessible, last_inaccessible, independent_citers, total_citations, highest_citing_tier, self_citation_count,
           trust_score_overall, trust_score_accuracy, trust_score_timeliness, trust_score_reliability, trust_score_citation,
           trust_score_computed_at, tier_history, cited_by, notes, created_at, updated_at, admin_only, processing_paused,
           spotchecked, tier, auto_run_enabled, category, last_content_hash]   # `tier` only at recently-auto-approved:70 (F-06); api_endpoint vs api_endpoint_url split (F-07)
    write: [processing_paused, admin_only, base_tier, effective_tier, tier_override, override_reason, override_date,
            last_checked, last_accessible, last_inaccessible, consecutive_accessible, total_checks, successful_checks,
            status, last_content_hash, last_content_changed_at, trust_score_* , source_role, topic_tags, vertical_tags,
            tier_at_creation, source_id?  # insert shape at decide/bulk-approve/promote]
  intelligence_items:
    read: ["*" (fetchIntelligenceItem), id, legacy_id, title, summary, priority, severity, item_type, category, jurisdictions,
           jurisdiction_iso, transport_modes, source_id, source_url, intersection_summary, related_items, full_brief,
           pipeline_stage, added_date, what_it_changes, does_not_resolve, is_archived, provenance_status, domain, topic_tags,
           regeneration_skill_version, last_regenerated_at, operational_scenario_tags, compliance_object_tags, sources_used,
           urgency_tier, format_type, agent_integrity_flag, agent_integrity_phrase, agent_integrity_flagged_at,
           agent_integrity_resolved_at, updated_at, status]
    write: [source_id, source_url, updated_at, agent_integrity_resolved_at, agent_integrity_resolved_by, status,
            is_archived, archive_reason, archive_note, archived_date, jurisdictions, jurisdiction_iso]
    embeds: [source:sources(id,name,url,base_tier,effective_tier)]
  canonical_source_candidates: {read: ["*", id, candidate_url, candidate_title, candidate_publisher, rationale, intelligence_item_id, recommended_classification, decision, issue_classification, confidence, verified], write: [decision, promoted_to_source_id, reviewer_id, reviewed_at, reviewer_notes, reviewed, recommended_classification, candidate_url, candidate_title, candidate_publisher]}
  provisional_sources: {read: ["*", id, name, url, description, recommended_classification, status, discovered_via], write: [status, promoted_to_source_id, reviewed_at, reviewer_notes, recommended_classification, name, url, description, discovered_via, provisional_tier]}
  source_trust_events: {read: [event_type, reviewer_id, created_at, details], write: [source_id, event_type, details, created_by, reviewer_id]}
  source_verifications: {read: [id, candidate_url, ai_relevance_score, ai_freight_score, ai_trust_tier, verification_tier, rejection_reason, verification_log, resulting_source_id, created_at], embeds: ["sources:resulting_source_id(id,name,url,base_tier,status)"]}
  source_tier_opinions: {write: [dismissed_at, dismissed_by, dismissed_reason], filter: [target_source_id]}
  source_bias_tags: {read: [source_id, dimension, tag, confidence]}
  staged_updates: {read: ["*", proposed_changes, status, created_at, reason, update_type, item_id, materialized_at, materialized_item_id], write: [status, reviewed_by, reviewed_at, reviewer_notes, materialized_at, materialized_item_id, materialization_error, update_type, proposed_changes, reason, source_url, confidence, source_id]}
  admin_action_cooldowns: {read: [last_triggered_at], write: [action_key, last_triggered_at, triggered_by, metadata]}
  integrity_flags: {read: ["*", category, status, id, description, created_at], write: [status, resolved_at, resolved_by, resolution_note, category, subject_type, subject_ref, description, recommended_actions, created_by]}
  ingest_rejections: {read: [id, raw_value, rejection_reason, source_url, source_id, ingest_attempted_at], write: [triage_action, triaged_by, triaged_at, triage_notes], embeds: [source:sources(id,name,url)]}
  pending_jurisdiction_review: {read: [id, intelligence_item_id, current_value, flagged_reason, source_column, flagged_at, resolved_at], write: [resolved_at, resolved_by, resolution_value], embeds: [item:intelligence_items(id,title,jurisdictions,jurisdiction_iso)]}
  org_memberships: {read: [id, org_id, user_id, role, created_at], write: [org_id, user_id, role (insert), role (update), delete], embeds: [organizations(id,name), user:profiles!user_id(full_name,display_name,email,avatar_url)]}
  organizations: {read: [id, name, slug, plan, created_at, updated_at], write: [name, slug, updated_at]}
  org_invitations: {read: [id, token, org_id, invited_email, proposed_role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, invited_by_user_id], write: [org_id, invited_email, invited_by_user_id, proposed_role], embeds: [organizations(name,slug)]}
  org_member_bans: {read: [user_id], write: [org_id, user_id, banned_by, reason]}
  profiles: {read: [id, full_name, display_name, email, avatar_url, sector_overrides, verifier_status, is_platform_admin], write: [linkedin_verified, verification_tier, updated_at, full_name, headline, linkedin_url], aliases: ["user_id:id", "name:full_name", "headshot_url:avatar_url"]}
  workspace_settings: {read: [sector_profile, home_sections, default_export_format, alert_config, default_filters], write: [home_sections, default_export_format, alert_config, default_filters, org_id, updated_at]}
  workspace_item_overrides: {read: [item_id, priority_override, is_archived, archive_reason, archive_note, notes, dismissed_at], write: [org_id, item_id, priority_override, is_archived, archived_at, archive_reason, archive_note, notes, dismissed_at, updated_at]}
  user_watchlist: {read: [id, item_type, item_id, created_at, user_id], write: [user_id, org_id, item_type, item_id]}
  community_groups: {read: [id, name, slug, region, privacy, owner_user_id, description, vertical, member_count, weekly_post_count, last_active_at, created_at], write: [name, slug, region, privacy, owner_user_id, vertical, description, delete]}
  community_group_members: {read: [group_id, user_id, role, joined_at, starred], write: [group_id, user_id, role (insert), starred, delete]}
  community_group_invitations: {read: [id, group_id, inviter_user_id, invitee_user_id, status, created_at], write: [group_id, inviter_user_id, invitee_user_id, status]}
  community_posts: {read: [id, group_id, parent_post_id, author_user_id, title, body, created_at, last_reply_at, reply_count, attribution, promoted_from_post_id, promoted_at], write: [group_id, parent_post_id, author_user_id, title, body, promoted_at, promoted_to_item_id, signed_off_at, signed_off_by, delete]}
  community_post_signoff_requests: {read: [id, post_id, requested_by, status, verifier_id, primary_doc_url, decision_note, created_at, decided_at], write: [post_id, requested_by, status, verifier_id, decided_at, primary_doc_url, decision_note]}
  moderation_reports: {read: [id, target_kind, target_id, reporter_user_id, reason, status, created_at, resolved_at, resolved_by_user_id], write: [target_kind, target_id, reporter_user_id, reason, status, resolved_at, resolved_by_user_id]}
  notifications: {read: [id, kind, payload, read_at, created_at, user_id], write: [read_at]}
  notification_preferences: {read: [user_id, enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels, updated_at], write: [same via upsert]}
  notification_events: {write: [event_type, source_table, source_id, payload]}          # orphan route F-13
  notification_subscriptions: {read: [user_id, channels], filters: [target_id, subscription_type]}  # orphan route F-13
  notification_deliveries: {write: [event_id, user_id, channel, status]}                 # orphan route F-13
  post_promotions: {read: [id, promotion_kind, staged_update_id, intelligence_item_id, created_at], write: [post_id, promoted_by, promotion_kind, staged_update_id, intelligence_item_id, notes]}
  monitoring_queue: {read: [id, source_id, checked_at], write: [source_id, scheduled_check, priority, last_result, change_detected, checked_at, error_message, reconciled_at], filters: [change_detected, reconciled_at]}
  pending_first_fetch: {read: [id, source_id, attempt_count], write: [status, attempt_count, last_attempt_at, last_error_text], filters: [status, queued_at]}
  system_state: {read: [scrape_cadence, scrape_start_date, global_processing_paused, updated_at], write: [scrape_cadence, scrape_start_date, global_processing_paused, updated_at], filter: [id = true singleton]}
  agent_runs: {read: [created_at], filters: [intelligence_item_id, created_at >= 1h ago]}
  bulk_imports: {write: [imported_by, format, total_rows, sources_inserted, provisional_inserted, rejected, raw_input, preview_summary]}
  portal_link_candidates: {write: [source_id, url, anchor_text, last_seen_at (upsert onConflict url)]}
  item_changelog: {read: [change_date, change_type, field, previous_value, new_value, impact], embeds: [intelligence_items!inner(id,legacy_id)]}
  item_disputes: {read: [note, disputing_sources], filters: [is_active], embeds: [intelligence_items!inner(id,legacy_id)]}
  item_cross_references: {read: [source_item_id, target_item_id], embeds: ["source:intelligence_items!source_item_id(id,legacy_id)", "target:intelligence_items!target_item_id(id,legacy_id)"]}
  item_supersessions: {read: [supersession_date, severity, note], embeds: ["old:intelligence_items!old_item_id(id,legacy_id,title)", "new:intelligence_items!new_item_id(id,legacy_id,title)"]}
  item_timelines: {read: [item_id, milestone_date, label, is_completed, sort_order]}
  intelligence_changes: {read: [item_id, change_type, change_severity, change_summary]}   # 0-row table
  sector_contexts: {read: [sector, display_name]}
  intelligence_item_sections: {read: [section_key, section_order, content_md, is_conditional, source_ids]}
  state_cost_facts: {read: [state_code, fact_label, value, unit, trend, statute_citation, effective_date], embeds: [source:sources(name)]}
  regional_data_facts: {read: [region_id, dimension, fact_label, value, status, trend, source_note], embeds: [source:sources(name,url)]}
  region_dimension_coverage: {read: [region_id, dimension, state, fact_count, notes]}
  regions: {read: [id, code, label, severity, display_order]}
  coverage_gaps: {read: [id, title, jurisdiction, sector_affinity, severity, description, suggested_action_label, suggested_action_href]}
  source_conflicts: {read: ["*"], filters: [status=open]}   # 0-row table, dormant surface
```

Cross-check priorities for X-agent: `sources.tier` (F-06), `sources.api_endpoint` vs `sources.api_endpoint_url` (F-07), `search_intelligence_items` internal gate (F-09), anon SELECT policies for the F-15 table list, workspace_settings member-UPDATE policy (F-14), `profiles.email` existence (members PUT resolves by `profiles.email` ilike — mig lineage), `sources.spotchecked` (mig 036).

---

## 5. Error-swallow register (the documented post-mortem smell: `data` destructured without `error`)

Every instance in the slice; “consequence” = what silently degrades when the query errors.

**Routes (50 instances):**
ask:200 (sources context empty); notifications/trigger:52,59,66 (subscribers=0, no deliveries); intelligence-items/[id]/metadata:53 (related unresolved); orgs/[org_id]:41 (getMembership → member treated as non-member → 403), :94 (owner block null); canonical recommend-classification:201 (grounding context blank); linkedin/callback:244,252 (returnTo heuristic only); scan:96 (cooldown skipped — documented), :326 (dup-source check false-negative → duplicate provisional possible); workspace/overrides:25 (legacy_id resolve → 404); moderation/[id]:168,278 (post block null → side-effects skipped as "no post"); canonical pending:61 (item join null), :78 (existing-source map empty → UI shows new-source flow for registered URLs); bulk-classify:167,180,188 (cands empty → silent no-op; registry dedup defeated → redundant Haiku spend; parent grounding lost); bulk-approve:95 (registry dedup defeated → **duplicate sources insert possible**, the Q10 class); moderation reports:267 (membership → 403 false-negative); orgs:61 (response slug null); signoff decide:147 (precise-403 read only; RLS still gates), :189 (409-vs-404 message only); **integrity regenerate:140 (F-04 — auto-resolve on read error)**; orgs invitations/[id]:56 (org-match sanity check skipped); spot-check:269 (cooldown skipped); community invitations revoke:56,77 / decline:38 (404/403 false-negatives — RLS backstops); bulk-import:449 (dup detection defeated → duplicate provisional); commit-tier-change:66 (prior=null → 404 false-negative, blocks the write — fail-closed by accident); tier-opinions:102 (source identity nulls in UI); posts:156,259 / posts/[id]:111,232 / replies:143,249 (author blocks null); promote:239 (409 without promotion detail); pause-global:110 (read-back nulls); tier-override GET:121 (audit list empty); regenerate-brief:96 (briefLength=0 — moot per F-02); groups invite:63 / invitations:55 / invite-candidates:45 (membership → 403 false-negative); members:139 (leave → 404 false-negative); join:78 (already-member short-circuit missed — unique index backstops).

**supabase-server.ts:** :82, :112, :145, :169 (relationship reads render empty); :340, :346, :379 (registry/provisional/conflicts empty); :842 count (total=0 under an honest cap indicator); :1477-1493 changesResult/sectorsResult error unchecked (overridesResult via service — errors also unchecked); :2244-2273 five detail Promise.all results — `data` consumed, errors ignored (timeline/changelog/dispute/xref/supersessions silently empty on detail page); :2489, :2511 watchlist title/label resolution; fetchAwaitingReview :2653-2672 three result errors unchecked.

**lib/api:** org.ts:22, :49 (org resolution → null → 403 "no membership" on DB error — fail-closed by accident but wrong error); community-auth.ts:48 (cookie getUser — falls through to Bearer, acceptable); server-bootstrap.ts:68-81 membership/profile errors unchecked, :92 ws swallow (workspace sectors empty).

**stores:** settingsStore:55-75 (update result fully ignored + silent catch — F-14), :162 (load swallow).

Class note: ~15 of these sit in **auth/membership gates** where a transient DB error reads as "not a member/not found" — fail-closed by accident (denies service, doesn't leak), but the 403/404 mislabels a 500. The orgs/[org_id]/members route (F-29) shows the corrected shape. Candidate class fix: a `must()` helper or the {data,error} tuple pattern from members/route.ts applied to gate reads.

---

## 6. Stores (state shape vs consumers)

- **resourceStore** — overrides layer + optimistic rollback verified against /api/workspace/overrides contract (payload keys match route's `"key" in body` checks; dismissedAt/priorityOverride clear-couplings match migration-111 semantics). `mergeWithOverrides` consumed by surfaces; healthy. Stale slices: synopses (writer feeds constant []), intelligenceChanges (0-row source table), sectorDisplayNames (shelved surface) — see F-23a.
- **settingsStore** — F-14 (browser-side workspace_settings writer, total swallow; RLS assumption unverified). localStorage theme/savedFilters fine.
- **sourceStore** — shape matches fetchSourceData payload; openConflicts/conflicts view dormant (F-23b).
- **workspaceStore** — jurisdictionWeights/sectorWeights have no writer anywhere (F-23c); consumers permanently receive null.
- **navigationStore / exportStore** — pure UI state; consumers verified (TabBar, ResourceCard/Detail, ExportBuilder); no data-layer coupling; no findings.

---

## 7. RLS-assumption register (code assumes a policy exists — reconciler-credential class)

| Site | Assumption | If wrong |
|---|---|---|
| settingsStore.debouncedSave (browser anon+JWT) | member UPDATE policy on workspace_settings | settings never persist, silently (F-14) |
| supabase-server anon reads (F-15 list) | anon SELECT on 12 tables | surfaces silently empty |
| fetchWorkspaceResources:508 item_timelines via anon | anon SELECT on item_timelines | timelines render empty (warn logged) |
| community routes "RLS is the auth boundary" (posts, signoff, invitations, settings, star, reports) | migrations 028/029/030/032/153/154 policies live | pre-checks give right errors, but service-role escapes (join :96, accept :104, revoke :101, decide stamp :214, groups bootstrap :149) would be the only enforcement left |
| orgs/[org_id]/invitations POST | RLS admin WITH CHECK on org_invitations (route inserts via rls client and maps 42501) | non-admin invite possible if policy missing |
| ask FTS re-fetch | verified+non-archived enforced INSIDE search_intelligence_items | quarantined content in assistant context (F-09) |
| migration-077 membership checks in workspace RPCs | service-role bypass intentional for SSR (documented supabase-server:487-493) | n/a — verified-by-design, org resolved upstream |
| worker/reconcile note | provenance flip requires bound reconciler credential (mig 118 guard); route deliberately does NOT flip as service-role | consistent with Phase-2 credential binding |

---

## 8. Manifest check-off

**97/97 files read** (reconciled against `_manifest_files.tsv` rows 2277-2357 [81 routes], 2640-2646 [7 lib/api], 2743-2745 [3 supabase clients], 2755-2760 [6 stores]). Every file read in full, line-by-line; supabase-server.ts (2,738 lines) in two passes.

**Tool-call count:** 112 (109 Read/Grep/Glob/TodoWrite calls during the audit + this Write + 2 closing calls).

**Deviation log:**
1. Initial `Glob` of the audit docs directory timed out (20s ripgrep limit on the large repo); replaced with a targeted Grep of `_manifest_files.tsv` — no coverage impact.
2. No live-DB SELECTs were issued: all findings are code-level; the DB-facing questions are packaged as explicit X-agent cross-check items (sections 3, 4, 7) per the audit's partitioning (RPC/table existence and RLS policies are DB/X-agent scope).
3. UI-caller determination (route inventory "Caller" column, F-19 dead endpoints) used repo-wide greps for `/api/` string literals including template-prefix matches; dynamic URL construction was resolved manually for SourceAdminControls/GroupModals/CommunityRooms. Cron wiring in `dotfiles/.github` was not re-read (CODE-2 slice); "cron" attributions come from route headers.
