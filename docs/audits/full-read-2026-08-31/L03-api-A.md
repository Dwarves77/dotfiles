# Lane L03-api-A — API routes (admin/community/misc), part A

Repo: /root/work/dotfiles/fsi-app. All paths below are relative to that root.

## Per-file verdicts

`src/app/api/admin/attention/route.ts` — WORKING-WIRED — aggregated admin-attention counts (RPC `admin_attention_counts`), server + HTTP cached.
- WIRING: 1 non-route file references `/api/admin/attention` (admin UI). requireAuth + isPlatformAdmin gate present.

`src/app/api/admin/b2-progress/route.ts` — WORKING-WIRED — read-only Phase B.2 regeneration stats over `intelligence_items`, paginated via `fetchAllRows`.

`src/app/api/admin/canonical-sources/bulk-approve/route.ts` — WORKING-WIRED — batch approve of `canonical_source_candidates`; fail-closed dedup lookup, deterministic tier via `classTierForHost`, vertical-fit gate.

`src/app/api/admin/canonical-sources/bulk-classify/route.ts` — WORKING-WIRED — Haiku pre-classification cache for candidates, concurrency=5, max 30/call.

`src/app/api/admin/canonical-sources/decide/route.ts` — WORKING-WIRED — approve/reject/defer flow for one candidate; canonical dedup guard before insert; explicit partial-write failure surfaced (not silently swallowed) at line ~334-350.

`src/app/api/admin/canonical-sources/pending/route.ts` — WORKING-WIRED — read-only grouped/sorted pending-candidate queue.

`src/app/api/admin/canonical-sources/recommend-classification/route.ts` — WORKING-WIRED — Haiku classification + bias-tag validation, cached on the candidate row.

`src/app/api/admin/coverage/route.ts` — WORKING-WIRED — jurisdiction × item_type coverage matrix from `coverage_matrix()` RPC, tier/country filters.

`src/app/api/admin/integrity-flags/[id]/regenerate/route.ts` — WORKING-WIRED — queues brief regeneration via `/api/agent/run`; correctly defers flag resolution (async workflow, no premature auto-resolve — documented fix for a prior defect).

`src/app/api/admin/integrity-flags/[id]/resolve/route.ts` — WORKING-WIRED — resolves a per-brief integrity flag (replace_url/regenerate/mark_resolved); audit is console.log only by design (documented rationale, no `admin_audit_log` table yet).
- NOTE: audit trail for flag resolution lives only in Vercel function logs, not a DB table.

`src/app/api/admin/integrity-flags/route.ts` — WORKING-WIRED — dual-surface GET (per-brief vs `?platform=1` platform `integrity_flags`) + PATCH (platform only). Paginates past PostgREST's 1000-row cap correctly.

`src/app/api/admin/intersections/route.ts` — WORKING-WIRED — assembles canonical item pairs from `item_cross_references`; pure read, paginated.

`src/app/api/admin/promotion-policy/route.ts` — WORKING-UNWIRED — GET/POST for the promotion policy engine's operator control; fail-closed (no policy = no spend authorized).
- WIRING: grep across the repo (frontend + workflows) finds zero callers of `/api/admin/promotion-policy` outside this route file itself. Nothing invokes it currently — this is dormant/operator-manual (e.g. curl), not driven by any UI component found in-repo.

`src/app/api/admin/recompute-trust/route.ts` — WORKING-WIRED — worker-secret gated; recomputes `trust_score_*` for all active sources.
- WIRING: confirmed caller — `.github/workflows/trust-recompute.yml` (monthly cron), not a frontend route. refs=0 is expected/correct for this reason.

`src/app/api/admin/run-intake/route.ts` — WORKING-UNWIRED — "Run intake now" operator control; plan/apply modes, gated machine-approval (no human-approve step by design).
- WIRING: no frontend or workflow caller found anywhere in the repo. Dormant.

`src/app/api/admin/scan/route.ts` — WORKING-WIRED — admin-triggered regulatory web-search scan via `spendSearch`; 4h cooldown, dedup fail-closed, portal-vs-regulation heuristic reroutes, item_type validated against closed enum (no silent "regulation" fallback).
- WIRING: 3 non-route files reference the path (admin UI).

`src/app/api/admin/sources/[id]/fetch-now/route.ts` — WORKING-WIRED — manual per-source fetch bypassing cooldown but honoring the global pause; routes reachability through `decideFetchOutcome` (inconclusive vs dead vs ok).

`src/app/api/admin/sources/[id]/pause/route.ts` — WORKING-WIRED — toggles `sources.processing_paused`.

`src/app/api/admin/sources/[id]/regenerate-brief/route.ts` — WORKING-WIRED — delegates to `/api/agent/run`; correctly reports async 202/queued state rather than fabricating a synchronous result (documented fix for a prior defect).

`src/app/api/admin/sources/[id]/tier-override/route.ts` — WORKING-WIRED — GET (state+audit) and POST (set/revert) for `sources.tier_override`; requires `override_reason` when setting; audit-insert failure is surfaced as a `warning` in a 200 response rather than hidden.

`src/app/api/admin/sources/[id]/visibility/route.ts` — WORKING-WIRED — toggles `sources.admin_only`.

`src/app/api/admin/sources/bulk-import/route.ts` — WORKING-WIRED — CSV/JSON bulk import with dry-run preview, HEAD reachability classification (dead/inconclusive/reachable), optional `verifyCandidate` pipeline, audit row to `bulk_imports`.
- NOTE: `bulk_imports` (table-usage.txt) has **0 live rows** despite `src=1` (this route). The apply-path insert at line 632 has therefore never executed successfully in production, or all prior imports used dryRun only — the write path is unproven live.

`src/app/api/admin/sources/commit-tier-change/route.ts` — WORKING-WIRED — operator-decided `base_tier` update for seeded sources; explicitly rejects provisional-kind (defers to `/promote`).

`src/app/api/admin/sources/pause-global/route.ts` — WORKING-WIRED — GET/POST for the global scrape cadence + emergency pause; writes exclusively through the `admin_set_pause_state` RPC (guard-trigger enforced single-writer pattern).

`src/app/api/admin/sources/promote/route.ts` — DEFECTIVE — provisional→sources promotion (approve/reject/defer); Q10 dedup guard added to prevent double-promotion.
- DEFECT (line 177): the `notes` field on the newly-inserted source hardcodes the literal date string `"Promoted from provisional 2026-04-28 by reviewer ..."` instead of using the actual `now` timestamp already computed at line 93 (as every sibling route — bulk-approve, decide — correctly does via `now.slice(0,10)`). Every source promoted through this route, regardless of actual promotion date, gets a permanently wrong date baked into its audit notes. Cosmetic (does not affect the tier/domain/jurisdiction data or the real `source_trust_events.created_at`), but the `notes` column becomes actively misleading forever after 2026-04-28.

`src/app/api/admin/sources/recommend-classification/route.ts` — WORKING-WIRED — Haiku classification (tier/domains/bias_tags) for provisional sources; cached on the row.

`src/app/api/admin/sources/recommend-tier/route.ts` — WORKING-WIRED — thin wrapper calling `recommendSourceTier()`; per-source Haiku spend, Phase 1.5 operator tool.

`src/app/api/admin/sources/tier-opinions/route.ts` — WORKING-WIRED (code) / **feature unused live** — GET disagreement rows from `get_tier_opinion_disagreements()`; POST dismisses opinions.
- NOTE: `source_tier_opinions` (table-usage.txt) has **0 live rows** with `src=2`. The disagreement-review surface this route serves has no data to review in production — the analyst-opinion ingestion path that would populate this table has apparently never run, so this admin surface is currently always empty.

`src/app/api/admin/spot-check/recurring/route.ts` — WORKING-WIRED — worker-secret gated recurring calibration spot-check; 4h cooldown, samples 20 tier-H verifications, re-classifies via Haiku, computes false-positive rate, 502s the workflow on >5% FP.
- WIRING: confirmed caller — `.github/workflows/spot-check-monthly.yml`.

`src/app/api/admin/themes/route.ts` — WORKING-WIRED — read-only assembly of `connection_themes` + attached `theme_briefs`, staleness recomputed at read time (never trusted from storage).

`src/app/api/admin/triage/ingest-rejections/route.ts` — WORKING-WIRED — GET untriaged `ingest_rejections`, POST triages one row; CHECK-constraint-consistent triple write.

`src/app/api/admin/triage/pending-jurisdiction-review/route.ts` — WORKING-WIRED — GET unresolved jurisdiction-token flags, POST confirm/manually-classify/dismiss with array mutation on the parent `intelligence_items` row.

`src/app/api/admin/users/route.ts` — WORKING-UNWIRED — POST creates an Auth user + org membership, GET lists org memberships; platform-admin gated.
- WIRING: no frontend or workflow caller found anywhere in the repo for `/api/admin/users`. Dormant — likely an operator/curl-only tool today (user provisioning is otherwise not exposed in the UI found in this lane).

`src/app/api/agent/run/route.ts` — WORKING-WIRED — the sole spend-triggering generation entry point; thin wrapper over the durable `generateBriefWorkflow`; platform-admin gated, per-item cooldown (1h), verified-item short-circuit.
- NOTE: `refresh:true` is documented as not yet honored by the downstream section/ground skip sites (canonical-pipeline.ts) — a flagged, deferred residual gap, not something this route itself can fix.

`src/app/api/ask/route.ts` — WORKING-WIRED — Intelligence Assistant; fail-closed on `ASSISTANT_ENABLED !== "true"` exactly; FTS-first retrieval with priority-pull fallback; prompt-cached static system block; citation post-processing validates `[Item: ...]` markers and raw URLs against the fetched context, so fabricated citations are caught rather than trusted.

`src/app/api/auth/linkedin/callback/route.ts` — WORKING-WIRED — OAuth code exchange, profile+email fetch, `profiles` UPSERT; CSRF state validated against httpOnly cookie; never logs token material.

`src/app/api/auth/linkedin/start/route.ts` — WORKING-WIRED — begins OAuth flow, sets state cookie.
- WIRING: refs=1 per lane ground truth.

`src/app/api/cache/revalidate-item/route.ts` — WORKING-WIRED — worker-secret gated cache-tag flush, called by the generate-brief workflow's terminal step (workflow steps can't call `revalidateTag` directly).

`src/app/api/community/groups/[id]/invitations/route.ts` — WORKING-WIRED — GET pending invitations for a group, admin/moderator only (app-layer pre-check + RLS).

`src/app/api/community/groups/[id]/invite-candidates/route.ts` — WORKING-WIRED — profile search excluding existing members/pending invitees/self; admin-only; ILIKE input escaped.

`src/app/api/community/groups/[id]/invite/route.ts` — WORKING-WIRED — invite insert (admin-only per app check + RLS), 23505→409, 23503→404, notification fan-out (failure non-fatal to the invite).

`src/app/api/community/groups/[id]/join/route.ts` — WORKING-WIRED — public-group self-join via service-role insert after explicit `privacy==='public'` check; idempotent; auto-clears pending invitation.

`src/app/api/community/groups/[id]/members/route.ts` — WORKING-WIRED — GET roster (RLS-scoped), DELETE self-leave with a "last admin can't leave" guard.

`src/app/api/community/groups/[id]/settings/route.ts` — WORKING-WIRED — PATCH name/description/privacy; admin/moderator/owner pre-check ahead of RLS.

`src/app/api/community/groups/[id]/star/route.ts` — WORKING-WIRED — per-user starred toggle on membership row.

`src/app/api/community/groups/route.ts` — WORKING-WIRED — POST creates a member-owned vertical group; validates `vertical` against `ALL_SECTORS`; slug-collision retry (3 attempts); rolls back the orphan group if the admin-membership bootstrap insert fails.

`src/app/api/community/invitations/[id]/accept/route.ts` — WORKING-WIRED — two-step accept (status update then service-role membership insert), rolls the status back to pending if the membership insert fails for a non-duplicate reason.

`src/app/api/community/invitations/[id]/decline/route.ts` — WORKING-WIRED — single status update, invitee-only, pending-only.

`src/app/api/community/invitations/[id]/revoke/route.ts` — WORKING-WIRED — inviter-or-admin revoke via service-role (documented RLS gap: inviter-only path has no RLS policy, so app code re-checks identity before the service-role write).

`src/app/api/community/moderation/reports/[id]/route.ts` — INCOMPLETE (one branch) — GET single report; POST dismiss/remove_post/warn_user/mute_user/ban_user.
- INCOMPLETE (lines 329-344): `mute_user` is an explicit Phase-D stub — `community_group_members` has no `muted_until` column, so the action falls back to a warning notification and reports `phase_d_stub:true` in the response. Documented, not hidden from the caller.

`src/app/api/community/moderation/reports/route.ts` — WORKING-WIRED — GET (RLS-scoped list, hydrates post excerpts, `group_id`/`status` filters), POST (file a report; membership pre-check).

`src/app/api/community/notifications/[id]/route.ts` — WORKING-WIRED — GET/POST(mark_read/mark_unread) single notification, self-only via RLS.

`src/app/api/community/notifications/counts/route.ts` — WORKING-WIRED — per-group unread/mention aggregation for the sidebar, RLS self-scoped.

`src/app/api/community/notifications/route.ts` — WORKING-WIRED — paginated list + mark_all_read bulk action.

`src/app/api/community/posts/[id]/promote/route.ts` — WORKING-WIRED (code) / **audit-table write unproven live** — always-staged promotion of a community post to `staged_updates`; membership pre-check; idempotent (409 on re-promotion) via `community_posts.promoted_at` plus a unique index on `post_promotions(post_id)`.
- NOTE: `post_promotions` (table-usage.txt) has **0 live rows** with `src=1`. The audit-row insert at line 349 (step 9) — and by extension the whole promote flow, since `promoted_at` is only stamped after it — has never successfully completed against production data, OR the promote feature has never been used in production. Either way this code path is unproven live.

`src/app/api/community/posts/[id]/replies/route.ts` — WORKING-WIRED — GET paginated replies, POST create-reply (rejects nested replies beyond one level), notification fan-out to parent author (self-reply skipped).

`src/app/api/community/posts/[id]/route.ts` — WORKING-WIRED — GET/PATCH(author-only)/DELETE(hard delete, RLS-gated to author or admin/mod) single post.

`src/app/api/community/posts/[id]/signoff/route.ts` — WORKING-WIRED (code) / **unused live** — opens a verifier sign-off request; RLS is the sole authorization boundary (no app-layer re-check), partial unique index prevents concurrent open requests.
- NOTE: `community_post_signoff_requests` (table-usage.txt) has **0 live rows** with `src=4` (this route plus decide/withdraw/schema). The entire sign-off subsystem (this file + `signoff/[id]/decide` + `signoff/[id]/withdraw`) has never been exercised in production.

`src/app/api/community/posts/route.ts` — WORKING-WIRED — GET paginated top-level posts by group with author profiles joined, POST create top-level post (title required).

`src/app/api/community/search/route.ts` — WORKING-WIRED — cross-surface ILIKE search (posts/groups/people), RLS-scoped, documented as a deliberate non-FTS choice.

`src/app/api/community/signoff/[id]/decide/route.ts` — WORKING-WIRED (code) / **unused live**, same table as above — verifier records signed_off/declined; RLS is the true gate, app-layer role read only sharpens the error message; on `signed_off` stamps `community_posts.signed_off_at` via service-role, surfacing (not swallowing) a stamp failure as a 200-with-warning.
- NOTE: same 0-row caveat as `posts/[id]/signoff` above — never exercised live.

`src/app/api/community/signoff/[id]/withdraw/route.ts` — WORKING-WIRED (code) / **unused live** — requester withdraws own pending request; route's own header comment notes it depends on migration 154's RLS policy (`signoff_withdraw_own`) — if that migration weren't applied the route would 404 safely (fail-closed-by-construction, per the comment). Same 0-row caveat.

`src/app/api/coverage/entries/route.ts` — WORKING-WIRED — admin-only, read-only Coverage Index entry listing by surface.

`src/app/api/health/spend/route.ts` — WORKING-WIRED — worker-secret gated MTD spend probe; sums `agent_runs.cost_usd_estimated`, paginates past 1000-row PostgREST cap, verdict logic delegated to a pure `computeSpendHealth` module.
- WIRING: confirmed caller — `.github/workflows/uptime-probes.yml`.
- NOTE: extensive inline commentary documents a real historical spend-authorization gap on `/api/ask` (3 untraced paid rows, since closed by the `ASSISTANT_ENABLED` gate) — informational, already remediated per the comment and cross-verified against `/api/ask`'s fail-closed gate in this lane.

`src/app/api/health/surfaces/route.ts` — WORKING-WIRED — worker-secret gated backing-data honesty probe per customer surface + key RPC probes + Gate-A invariant read; 200/503 status mirrors the JSON verdict.
- WIRING: confirmed caller — `.github/workflows/uptime-probes.yml`.

`src/app/api/intelligence-items/[id]/metadata/route.ts` — WORKING-WIRED — read-only intersection-readiness metadata strip; customer read gate (`provenance_status='verified'`) applied both to the primary item and to resolved `related_items`.

`src/app/api/invitations/[token]/accept/route.ts` — WORKING-WIRED — thin wrapper over `accept_invitation()` RPC; maps Postgres error codes (42501/P0002/22023) to HTTP status.

`src/app/api/invitations/[token]/decline/route.ts` — WORKING-WIRED — thin wrapper over `decline_invitation()` RPC, same error-code mapping.

`src/app/api/invitations/[token]/route.ts` — WORKING-WIRED — GET invitation lookup via `lookup_invitation()` SECURITY DEFINER RPC; token itself is the credential, auth only prevents anonymous scraping.

`src/app/api/invitations/mine/route.ts` — WORKING-WIRED — lists pending `org_invitations` for the caller's email via service-role (RLS can't see invitations addressed to an email the caller doesn't administer); fails closed on a lookup error rather than returning a false-empty list.

`src/app/api/listings/rest/route.ts` — WORKING-WIRED — serves pagination remainder for `/regulations` and `/operations` ledgers, reusing the exact SSR data-access functions (`getListingsOnly`/`getResourcesOnly`) so it can never diverge from the page's own org-scoping.
- NOTE: unlike every other route in this lane, this route has **no `requireAuth`/`checkRateLimit` call**. This is not a bypass of workspace-scoped data: `resolveOrgIdFromCookies()` (verified by reading `src/lib/api/org.ts`) calls `supabase.auth.getUser()` on real session cookies and returns `null` for an unauthenticated caller, and the downstream fetchers fall back to public/seed behavior on `orgId=null` — consistent with how the SSR pages themselves behave for signed-out visitors. However the endpoint is unrated-limited, which the rest of the lane treats as a required guard on every other read/write route; an unauthenticated caller can still hit it repeatedly.

## Coverage attestation

Files read in full: 71/71. Lines read: 13,471 (sum of the lane list's reported line counts, cross-checked against `wc -l` for a sample and against the actual file contents read). No file was truncated or partially read.

## Lane summary

**Counts by STATUS:**
- WORKING-WIRED: 62
- WORKING-UNWIRED: 3 (`admin/promotion-policy`, `admin/run-intake`, `admin/users`)
- DEFECTIVE: 1 (`admin/sources/promote` — hardcoded date in audit notes)
- INCOMPLETE: 1 (`community/moderation/reports/[id]` — `mute_user` documented Phase-D stub, falls back to a warning)
- TEST / TEST-ONLY / STUB / DEAD-HISTORICAL / OPERATOR-TOOL: 0 (none of this lane's files are test files, and none are one-off scripts — all are Next.js route handlers)
- Additionally, 4 files are code-complete and correctly wired but have **zero live rows** in their backing table per table-usage.txt, meaning their write (or in one case read-surface) paths have never actually executed against production data: `admin/sources/bulk-import` (`bulk_imports`), `admin/sources/tier-opinions` (`source_tier_opinions`), `community/posts/[id]/promote` (`post_promotions`), and the three-file community sign-off subsystem (`community_post_signoff_requests`).

**Findings ranked by importance:**

1. **DEFECT — `admin/sources/promote/route.ts:177`.** The audit `notes` field on every newly-promoted source is stamped with the literal hardcoded string `"...2026-04-28..."` instead of the actual promotion date (`now`, already computed at line 93 and used correctly elsewhere in the same file at line 201 for `reviewed_at`). Every source promoted via this endpoint carries a permanently wrong date in its notes forever. Concrete failure: promote a provisional source today (2026-08-31); the resulting `sources.notes` reads "Promoted from provisional 2026-04-28..." — four months wrong and never correcting itself, since the string is a compile-time literal, not a date computation. Low severity (cosmetic/audit-trail only, doesn't affect tier/domain data), but a real, easily-fixed bug — the sibling routes (`bulk-approve`, `decide`) already show the correct pattern (`now.slice(0,10)`) to copy.

2. **Unused-in-production feature: community verifier sign-off subsystem.** Three routes (`posts/[id]/signoff`, `signoff/[id]/decide`, `signoff/[id]/withdraw`) implement a complete, RLS-gated verifier workflow, but `community_post_signoff_requests` has 0 live rows. Either the feature has never been discovered/used by any community member, or the frontend surface that would call it doesn't exist/isn't linked yet. Worth an owner check: is this dead-on-arrival UI, or just genuinely unused so far?

3. **Unused-in-production feature: community post promotion audit.** `community/posts/[id]/promote` writes to `staged_updates` (which has other writers, so may have live rows from elsewhere) but its own dedicated audit table `post_promotions` has 0 rows — meaning no community post has ever been promoted through this specific endpoint in production, despite full RLS wiring and rollback-on-failure logic being in place and correct.

4. **Unused-in-production feature: `admin/sources/tier-opinions`.** The tier-disagreement review surface reads from `source_tier_opinions`, which has 0 rows — the analyst-opinion-collection mechanism that would populate this table for the disagreement UI to review appears to never have run, so this admin surface is currently always-empty by data, not by bug.

5. **Unproven write path: `admin/sources/bulk-import` → `bulk_imports`.** The audit-log insert on `apply` (dryRun=false) writes to a table with 0 live rows. Either bulk-import has only ever been dry-run in production, or every apply-mode call's audit insert has silently failed (the insert's own error is not checked/surfaced at line 632-651) — cannot distinguish from the code alone; worth an operator check of whether bulk-import apply has ever actually run.

6. **Three dormant admin operator routes with no discoverable caller.** `admin/promotion-policy`, `admin/run-intake`, and `admin/users` are all fully implemented, platform-admin-gated, and — per repo-wide grep — have zero frontend component or GitHub-workflow callers. Unlike `admin/recompute-trust`/`admin/spot-check/recurring`/`health/spend`/`health/surfaces` (whose refs=0 is explained by confirmed `.github/workflows/*.yml` cron callers), these three appear to be curl/operator-console-only today. Not necessarily wrong (documented as manual by design in `run-intake`'s header comment), but `admin/promotion-policy` and `admin/users` carry no such "manual by design" framing in their own comments — worth confirming with the owner whether a UI is expected to exist and is simply missing, or whether these are intentionally API-only operator tools.

7. **`community/moderation/reports/[id]`'s `mute_user` action is an honest, disclosed stub** (Phase-D placeholder, falls back to a warning notification, reports `phase_d_stub:true`) rather than a silent no-op — flagged here only as a reminder this is not yet real moderation capability, not as a defect; the code is honest about its own limitation.

8. **`listings/rest` is the only route in the lane with no `requireAuth`/rate-limit gate.** Verified this is not an authorization bypass (it reads real Supabase session cookies via `resolveOrgIdFromCookies()`, mirroring the SSR page's own behavior for signed-out visitors), but it is the one asymmetry in an otherwise-uniform lane where every other route enforces `checkRateLimit`. An unauthenticated or authenticated caller can hit this endpoint at unlimited rate.

9. **Positive finding: several previously-buggy async/error-swallow patterns are already fixed and well-documented in this lane.** `admin/integrity-flags/[id]/regenerate`, `admin/sources/[id]/regenerate-brief`, `admin/canonical-sources/decide`, `admin/canonical-sources/bulk-approve`, and `admin/sources/bulk-import` all carry inline comments describing a prior defect (premature flag auto-resolve on an async 202, fabricated synchronous regeneration results, dedup-read-error defeating duplicate detection) and the concrete fix — these are historical defects already closed, not currently live bugs. No further action needed but confirms the codebase has an active defect-remediation discipline visible in the diffs themselves.

10. **`/api/ask`'s spend-authorization gate is real and matches the incident described in `health/spend`'s comments.** Cross-checked: `ASSISTANT_ENABLED === "true"` (exact-string) gate at line 153 of `ask/route.ts` precedes any spend-touching code, consistent with `health/spend/route.ts`'s claim that the prior 3-row spend leak is closed. No discrepancy found between the two files' independent claims.
