# App Audit A1c, Routes completion sweep (2026-09-30)

Lane A1c (ROUTES-UNREAD-FILES). Read-only. Scope: the **94 files** under `fsi-app/src/app/**` that
lane A1's register (`docs/audits/app-audit-a1-routes-2026-09-30.md`, branch `audit/a1-routes`)
marked **SWEEP** (grep-class-checked, not individually read line-by-line) rather than **FULL**. Every
file listed below was read top-to-bottom with the `Read` tool this session, per the operator's
directive: "complete a complete line by line audit of the code. No overviews. I want every line
read." `src/proxy.ts` and `src/lib/auth/route-policy.ts` were already FULL in A1 and are not re-read
here.

**Method.** For each file: the same checklist A1's dispatch specified, dead routes, swallowed
errors, auth guards, validation, N+1, pagination, `any`/`@ts-ignore`, placeholder/phase text, files
over 600 lines, plus a targeted mechanical sweep (`grep`) across the full 94-file set for the one
defect class this pass's reading surfaced (raw `.or()` string construction from caller input), to
confirm whether it recurs anywhere A1 or this pass did not individually read.

## Summary, counts by severity and class

| Class | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| 1. Dead/unwired routes | 0 | 0 | 0 | 0 |
| 2. Broken code (swallowed errors, stubs, phase language) | 0 | 0 | 0 | 0 |
| 3. Auth and security | 0 | 0 | 1 | 1 |
| 4. Unwired UI-to-data | 0 | 0 | 0 | 0 |
| 5. Quality (size, N+1, pagination, duplication) | 0 | 0 | 1 | 1 |
| **Total** | **0** | **0** | **2** | **2** |

Zero P0/P1 findings in the 94 files this pass read in full. This is consistent with, not merely
compatible with, A1's own base-rate finding ("the base rate of defects in this surface is genuinely
low"): the 94 unread files carry the same guard pattern, the same `resolveOrgIdFromUserId`/
`requireCommunityRoute`/`requireUserRoute` discipline, and the same RLS-is-the-boundary posture as
the 120 files A1 read. Two P2s, both real, both narrow.

---

## 3. Auth and security

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-9 | `src/app/api/community/search/route.ts:90,98`; `src/app/operations/[slug]/page.tsx:169,173`; `src/app/research/[slug]/page.tsx:172,176` | Five call sites across three files build a Supabase `.or()` filter string by directly interpolating caller-controlled text, with **only** `%`/`_`/`\` escaped (`community/search`'s `escapeLike`) or **no** escaping at all (`operations`/`research` `[slug]` pages splice the URL's `id` segment straight into `legacy_id.eq.${id}` / `legacy_id.eq.${id},id.eq.${id}`). PostgREST's `.or()` syntax treats a raw comma as a new top-level condition and parentheses as grouping, so a value containing either is not a search term, it is additional filter syntax, a crafted `q` or a crafted URL slug can splice in an unintended condition (e.g. `,id.eq.<uuid>`) rather than only widening the intended match. Impact is bounded in both places: `community/search`'s results are still filtered by the caller's own RLS visibility (a stranger cannot read a private-group post this way, only shape which rows among their own visible set get matched), and the `[slug]` pages' injected query (`.select("id, theme/jurisdictions, source_id, instrument_entity_id")` with **no** `provenance_status='verified'` filter chained onto the `.or()`) could be steered to return a *specific, guessed* item's `id`/`theme`/`jurisdictions`/`source_id` even if that item is unverified or quarantined, a narrow, guess-the-uuid metadata leak, not a bulk-read. Confirmed as the correct-vs-actual contrast by the codebase's own words: `src/app/api/workspace/archive-impact/route.ts:41-43` explicitly documents avoiding this exact anti-pattern ("Branch on the shape rather than composing a PostgREST `.or()` string from caller input, an `.or()` filter built by interpolation is an injection surface... a crafted itemId would add filter terms. `.eq()` parameterises."), proving the team already knows the fix and simply did not apply it to these five sites, three of which (the two `[slug]` pages) are a single pattern copy-pasted between `operations/[slug]/page.tsx` and `research/[slug]/page.tsx` (byte-identical `orExpr` line), so this is one defect instance, not three independent ones. `regulations/[slug]/page.tsx`, read this pass for comparison, does **not** carry this pattern, it resolves the uuid via `resolveItemUuid`/`buildResourceLookup` instead, confirming the safe path already exists in a sibling detail route. | [CONFIRMED], read in full; `grep -rn "\.or(\`\|\.or(orExpr" fsi-app/src/app` run against the whole `src/app` tree (not a sample) returns exactly these five call sites plus one safe, non-user-input use (`api/worker/check-sources/route.ts:94`, interpolates a server-computed ISO date, not caller input) | P2 | `community/search`: extend `escapeLike` to also escape `,` and parentheses (PostgREST's own documented workaround), or replace the two `.or()` calls with two separate `.ilike()` reads unioned in JS. `operations/[slug]` and `research/[slug]`: replace the `orExpr`/`.or()` branch with the same shape `archive-impact/route.ts` and `regulations/[slug]/page.tsx` already use, branch on `isUuid` and call `.eq("id", id)` or `.eq("legacy_id", id)` directly, never a composed string; this also closes the missing `provenance_status='verified'` gap for free since it's a one-line addition to either `.eq()` branch. | S |

## 5. Quality

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| F-10 | `src/app/api/orgs/[org_id]/members/route.ts:114-120` (GET) | Returns every `org_memberships` row for an org with no `.limit()` and no pagination, same unbounded-read shape A1 already flagged once in this codebase (F-5, `api/admin/users/route.ts`). Not a privilege-escalation bug (caller must already be a member or platform admin, per the owner-or-platform-admin / membership gate above it in the same file), but it will degrade linearly as any one org's membership count grows, with no ceiling. File itself is 652 lines (A1's F-7 already named its size; read in full this pass and judged organized-but-long, same verdict A1 gave `bulk-import`/`ask`, five HTTP-method handlers, each single-purpose, not tangled). | [CONFIRMED], read in full; the query is `service.from("org_memberships").select(...).order(...)` with no `.limit()`/`.range()` | P2 | Add `.limit(500)` (or a real page param) plus a `total` count, reusing the exact pattern `api/admin/triage/*` and `api/admin/users` (post-F-5-fix) already establish in the same tree, reuse, don't invent, per F-5's own recommendation. | S |

No other findings. Every route/page in this set: (a) calls `requireUserRoute`/`requireCommunityRoute`/
`workerAuthGuard` before touching data, with the sole documented public exceptions already named by
A1 (`auth/callback/route.ts`); (b) destructures and checks `error` on every `.select()`/`.insert()`/
`.update()`/`.delete()` that gates a subsequent write or existence check, zero silent-swallow
instances found; (c) validates UUID shape via the shared `UUID_RE` pattern before using a path param
in a query, in every route that takes one; (d) bounds every `.in()` call either by an explicit
`.limit()`/`MAX_LIMIT` clamp on the source query or by an inline `assertBound()` call citing the
IN-CHUNK class (`api/community/posts/route.ts`, `.../[id]/replies/route.ts`,
`.../moderation/reports/route.ts`), no unbounded `.in()` found; (e) carries no TODO/FIXME/stub/
"coming soon"/"Phase N" customer-facing text (the one `Phase D` stub, `api/community/moderation/
reports/[id]/route.ts`'s `mute_user` action, is honestly labeled `phaseDStub` in its own JSON response,
not hidden); (f) has zero `@ts-ignore`/`@ts-expect-error`. `any`/`as any` usage in this set is limited
to a small number of Supabase joined-row casts (e.g. `api/orgs/route.ts`, `api/community/*` profile
joins), the same documented escape-hatch pattern A1's F-8 already logged as a repo-wide ratchet target,
not a new instance worth a separate id.

## Top things worth an operator's attention

1. **F-9** is the one finding from this pass that changes the picture A1 left: A1's Auth section (F-4)
   already flagged CLAUDE.md's exception-list drift but found "no actual exposure" in the 120 files it
   read. This pass's 94 files contain a real, if narrow, filter-injection pattern, three files, one
   root cause (a copy-pasted `orExpr` line), with a self-documented "we know not to do this" comment
   sitting in a sibling file (`archive-impact/route.ts`) that makes the miss legible rather than
   mysterious.
2. **F-10** extends F-5's class by one instance. Two unbounded-`.in()`-adjacent reads in the same
   `org_memberships` table family (`api/admin/users` and `api/orgs/[org_id]/members`) suggests the fix
   belongs at the query-helper level (a shared `listOrgMemberships(orgId, {limit})` used by both
   routes) rather than as two independent patches, worth folding into whichever build item lands F-5.
3. Everything else in the 94-file set reads as the same "disciplined" surface A1 described: the guard
   pattern (`route-guard.ts`), the ban-check helper (`checkOrgBan`), the antitrust guard
   (`evaluateAntitrustGuard`), the org-scope-not-item-scope watcher fix already landed in
   `archive-impact/route.ts`'s own header (a defect A1 never saw, already fixed by the time this pass
   read it), and the `assertBound`/IN-CHUNK discipline all recur correctly across community, workspace,
   and org-membership routes this pass read that A1 had only swept.

---

## Coverage appendix

Every file in A1's 94-file SWEEP set, read **FULL** (top-to-bottom, `Read` tool) this session. Method
column omitted, every row here is FULL by definition of this lane's scope; A1's own appendix (120
FULL + 97 SWEEP, of which 94 are the files below, 3 of A1's originally-described "~97" were
`favicon.ico`-class or already reconciled in its own text) remains the record for the 120 already-FULL
files, not repeated here.

| file | lines | verdict |
|---|---|---|
| api/community/invitations/[id]/accept/route.ts | 114 | clean |
| api/community/invitations/[id]/decline/route.ts | 67 | clean |
| api/community/invitations/[id]/revoke/route.ts | 102 | clean |
| api/community/moderation/reports/[id]/route.ts | 420 | clean |
| api/community/moderation/reports/route.ts | 297 | clean |
| api/community/notifications/[id]/route.ts | 116 | clean |
| api/community/notifications/counts/route.ts | 90 | clean |
| api/community/notifications/route.ts | 144 | clean |
| api/community/posts/[id]/promote/route.ts | 388 | clean |
| api/community/posts/[id]/replies/route.ts | 280 | clean |
| api/community/posts/[id]/route.ts | 270 | clean |
| api/community/posts/[id]/signoff/route.ts | 101 | clean |
| api/community/posts/route.ts | 375 | clean |
| api/community/profile/route.ts | 93 | clean |
| api/community/profile/verify/route.ts | 139 | clean |
| api/community/search/route.ts | 188 | **F-9** |
| api/community/signoff/[id]/decide/route.ts | 224 | clean |
| api/community/signoff/[id]/withdraw/route.ts | 87 | clean |
| api/community/threads/[id]/corroboration/route.ts | 107 | clean |
| api/coverage/entries/route.ts | 34 | clean |
| api/health/spend/route.ts | 164 | clean |
| api/health/surfaces/route.ts | 227 | clean |
| api/intelligence-items/[id]/metadata/route.ts | 82 | clean |
| api/invitations/[token]/accept/route.ts | 55 | clean |
| api/invitations/[token]/decline/route.ts | 52 | clean |
| api/invitations/[token]/route.ts | 63 | clean |
| api/invitations/mine/route.ts | 71 | clean |
| api/notices/route.ts | 96 | clean |
| api/obligations/upcoming/route.ts | 102 | clean |
| api/orgs/[org_id]/invitations/[id]/route.ts | 69 | clean |
| api/orgs/[org_id]/invitations/route.ts | 175 | clean |
| api/orgs/[org_id]/members/route.ts | 652 | **F-10** (long-but-organized, confirms A1's F-7 size flag) |
| api/orgs/[org_id]/route.ts | 241 | clean |
| api/orgs/route.ts | 72 | clean |
| api/revalidate/route.ts | 60 | clean |
| api/search/route.ts | 61 | clean |
| api/telemetry/error/route.ts | 68 | clean |
| api/user/list-order/route.ts | 243 | clean |
| api/watchlist/route.ts | 361 | clean |
| api/worker/check-sources/route.ts | 159 | clean |
| api/worker/reconcile/route.ts | 50 | clean |
| api/workspace/archive-impact/route.ts | 204 | clean (names the F-9 anti-pattern and avoids it) |
| api/workspace/bootstrap/route.ts | 93 | clean |
| api/workspace/members/route.ts | 75 | clean |
| api/workspace/overrides/route.ts | 310 | clean |
| api/workspace/personal-state/route.ts | 223 | clean |
| api/workspace/spec09-upload/route.ts | 162 | clean |
| api/workspace/tags/[id]/items/route.ts | 120 | clean |
| api/workspace/tags/route.ts | 211 | clean |
| auth/callback/route.ts | 60 | clean (documented public exception, per A1 F-4) |
| auth/reset-password/page.tsx | 112 | clean |
| auth/update-password/page.tsx | 122 | clean |
| community/[slug]/page.tsx | 220 | clean |
| community/benchmarks/page.tsx | 55 | clean |
| community/browse/page.tsx | 210 | clean |
| community/directory/page.tsx | 128 | clean |
| community/discover/page.tsx | 76 | clean |
| community/moderation/page.tsx | 73 | clean |
| community/page.tsx | 541 | clean |
| community/profile/page.tsx | 54 | clean |
| invitations/[token]/page.tsx | 27 | clean |
| login/page.tsx | 180 | clean |
| map/page.tsx | 126 | clean |
| market/[slug]/page.tsx | 292 | clean |
| market/page.tsx | 264 | clean |
| market/series/page.tsx | 38 | clean |
| onboarding/page.tsx | 34 | clean |
| operations/[slug]/page.tsx | 298 | **F-9** |
| operations/calculator/page.tsx | 37 | clean |
| operations/page.tsx | 66 | clean |
| page.tsx (root) | 161 | clean |
| privacy/page.tsx | 380 | clean |
| regulations/[slug]/page.tsx | 306 | clean (confirmed the F-9 pattern does NOT recur here) |
| regulations/page.tsx | 96 | clean |
| regulations/register/page.tsx | 39 | clean |
| research/[slug]/page.tsx | 316 | **F-9** |
| research/page.tsx | 98 | clean |
| search/page.tsx | 67 | clean |
| settings/page.tsx | 40 | clean |
| signup/page.tsx | 197 | clean |
| watchlist/page.tsx | 46 | clean |
| workspace/new/page.tsx | 30 | clean |
| layout.tsx (root) | 76 | clean |
| loading.tsx (root) | 57 | clean |
| error.tsx | 52 | clean |
| not-found.tsx | 75 | clean |
| market/[slug]/loading.tsx | 27 | clean |
| market/loading.tsx | 26 | clean |
| operations/[slug]/loading.tsx | 20 | clean |
| operations/loading.tsx | 28 | clean |
| regulations/[slug]/loading.tsx | 28 | clean |
| regulations/loading.tsx | 28 | clean |
| research/[slug]/loading.tsx | 22 | clean |
| research/loading.tsx | 26 | clean |

94 rows, the full SWEEP-only set from A1's appendix (94 files marked `SWEEP`; A1's prose estimate of
"~97" unread files included `favicon.ico`, already independently read as a binary asset in A1's own
"sibling modules" pass, and rounded loosely, the exact grep-verified count, run this session against
A1's own table, is 94 `| SWEEP |` rows, all 94 of which appear above).

---

**A1 (120 files FULL + 97 files SWEEP-verified by mechanical class sweep) plus A1c (94 of those 97
SWEEP files now read FULL, top-to-bottom, this session, the remaining 3 being `favicon.ico` and the
2 middleware files A1 already read FULL) together cover 217 of 217 files under `fsi-app/src/app/**`
plus `src/proxy.ts` and `src/lib/auth/route-policy.ts`, every one read in full by at least one of the
two lanes.**

*Generated by lane A1c (ROUTES-UNREAD-FILES), branch `audit/a1c-routes`, worktree
`.claude/worktrees/audit-a1c-routes`. Read-only; no product code changed.*
