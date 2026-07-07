# GAPS.md — Honest Weaknesses Audit

> Written 2026-07-07 from a full read of the codebase, migrations, CI, and the project's own
> audit documents. Ordered by severity, most important first. Every entry: what it is, where it
> lives, why it matters, and a fix scoped small enough to execute as a single task.
>
> Verify current state before acting on any entry — this repo changes fast, and some June-audit
> findings were already fixed by July (those are listed in §"Recently closed" at the bottom so
> they don't get re-reported).

---

## 1. CRITICAL — Worker secret falls back to a hardcoded, publicly-known default

**What:** every worker/cron-authenticated route does
`const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret"`. If the env var is ever
unset or misspelled in Vercel, the routes silently accept the string `"dev-worker-secret"` —
which is printed in this public-ish repo.

**Where:**
- `fsi-app/src/app/api/worker/check-sources/route.ts:97`
- `fsi-app/src/app/api/worker/reconcile/route.ts:20`
- `fsi-app/src/app/api/worker/drain-first-fetch/route.ts:50`
- `fsi-app/src/app/api/notifications/trigger/route.ts:14`
- `fsi-app/src/app/api/admin/recompute-trust/route.ts:21`
- `fsi-app/src/app/api/admin/spot-check/recurring/route.ts:52`
- `fsi-app/src/app/api/admin/q7-daily-recompute/route.ts:48`

**Why it matters:** these routes trigger source scans, notification dispatch, trust recompute,
and paid Claude/Haiku calls. Fail-open-to-a-known-value is worse than no default — a
misconfigured deploy is indistinguishable from a working one until someone drives your spend.

**Fix (single task):** in each file, replace the fallback with a throw-if-unset
(`const WORKER_SECRET = process.env.WORKER_SECRET; if (!WORKER_SECRET) throw new Error(...)`).
While there, switch the `!==` comparisons to `crypto.timingSafeEqual` with a length guard
(see #16). Grep pattern to find all sites: `dev-worker-secret`.

---

## 2. HIGH — `/api/agent/run` has no rate limit, no cooldown, no admin gate; the doc claims otherwise

**What:** `fsi-app/src/app/api/agent/run/route.ts:24-82` calls `requireAuth` (any logged-in user)
then immediately starts the generation workflow. It never calls `checkRateLimit`, and the
"1h cooldown per source" documented in `fsi-app/.claude/CLAUDE.md`'s API table **does not exist
in the current code path** — it was dropped in the `start(generateBriefWorkflow)` refactor. The
only guard left is the workflow's platform-wide $5/day cap.

**Why it matters:** each run costs ~$0.15 (Sonnet + Browserless). Any authenticated user can loop
the route and burn the entire daily budget, denying generation platform-wide. The documented cost
control being fictional is its own hazard: future agents will trust the doc.

**Fix (single task):** in `agent/run/route.ts`, add (a) `checkRateLimit(auth.userId)`, (b) a
per-item cooldown read (query `agent_runs` for a run on this item in the last hour; 429 if found),
and (c) optionally gate behind `isPlatformAdmin` since this is effectively an ops action. Then
correct the doctrine table to match what's actually enforced.

## 3. HIGH — `/api/ask`'s documented "10/workspace/hour" cap does not exist; unbounded question length

**What:** `fsi-app/src/app/api/ask/route.ts:73-98` enforces only the generic in-memory
60/min/user limiter. There is no workspace-scoped hourly counter anywhere. `question` is checked
only with `typeof === "string"` — no length cap before it is sent to Sonnet.

**Why it matters:** a second fictional cost control (doctrine's API table documents the cap).
Combined with #4, the practical ceiling on LLM spend from this route is very high.

**Fix (single task):** add a DB-backed per-org hourly counter (count rows in a small
`llm_call_ledger` table, or reuse `agent_runs` with a `kind='ask'` row) and reject over 10/hour;
cap `question.length` (e.g. 2,000 chars). Update the doctrine table if the numbers change.

## 4. HIGH — RLS: core intelligence tables are readable by anonymous users; the verified-gate is app-code only

**What:** `fsi-app/supabase/migrations/005_rls_trust_framework.sql:20-40` creates
`FOR SELECT USING (true)` policies on `intelligence_items`, `sources`, `staged_updates`, and
`provisional_sources` — for anon as well as authenticated. The customer read gate
(`provenance_status='verified' AND is_archived=false`) exists only in app code; detail pages
even use the service-role client, so RLS is not the enforcement boundary anywhere.

**Why it matters:** the anon key ships in the client bundle. Anyone can hit
`https://<project>.supabase.co/rest/v1/intelligence_items?select=*` and read every row —
unverified drafts, quarantined briefs, archived items, unreviewed AI-staged updates, and
provisional sources that doctrine says must never be exposed. This undercuts both the
verification model (customers can see unverified content) and the product moat (the whole corpus
is scrapeable).

**Fix (single task):** one migration replacing the four read policies:
`intelligence_items` → `USING (provenance_status = 'verified' AND is_archived = false)`;
drop anon SELECT on `staged_updates` and `provisional_sources` entirely; decide `sources`
deliberately (public registry may be intended). Service-role paths are unaffected. Then smoke-test
the app's anon-client read paths (home/seed fallback) for regressions.

## 5. HIGH — In-memory rate limiter is per-lambda; largely ineffective on Vercel

**What:** `fsi-app/src/lib/api/rate-limit.ts:21` keeps counters in a module-level `Map`. On
serverless, every warm instance has its own map (effective limit ≈ N×60/min) and cold starts
reset it. The file's own header says "replace with Redis in production"; nothing has.

**Why it matters:** this is the *only* throttle on `/api/ask` and the backstop everywhere else.
All rate-limit guarantees in the doctrine inherit this weakness. Same class of problem: the
in-memory span-check ledger in the pipeline is per-process too (acceptable while runs are
sequential, wrong the day they aren't).

**Fix (single task):** replace with a fixed-window counter in Supabase (one `rate_limit_counters`
table + an atomic upsert-increment RPC) or Upstash Redis. Keep the same `checkRateLimit(key)`
signature so call sites don't change.

## 6. HIGH — The core product loop is unproven end-to-end; zero new items minted in over a month

**What:** the platform's stated purpose — autonomously discover → stage → approve → generate →
surface new intelligence — has never executed as one flow. `fsi-app/docs/PRODUCT-STATE-2026-06-20.md`
§B: newest `intelligence_items.created_at` was 2026-05-19; generation is proven at function level
but the `/api/agent/run` → `agent_runs` telemetry path was bypassed in the proofs. The freshness
loop is dormant (`change_detected` hardcoded `false`; phase-3 will revive it).

**Why it matters:** everything else is scaffolding around this loop. If it doesn't run, the
product is a hand-curated corpus with excellent provenance — not the autonomous system doctrine
describes.

**Fix (single task, gated on the active phase):** finish the `mintIntelligenceItem()` chokepoint
(phase-intake-gate, design at `fsi-app/docs/design/intake-gate-plan.md`), then run ONE end-to-end
proof: hourly check-sources → staged update → admin approve → drain-first-fetch → generate →
verify the item renders on its surface — and record the proof artifact in `fsi-app/docs/`.

---

## 7. MEDIUM-HIGH — Zero request-body schema validation across all 76 API routes

**What:** no zod (or any validator) anywhere; ~45 routes do raw `await request.json()`
destructuring with ad-hoc truthiness checks. Example: `fsi-app/src/app/api/admin/users/route.ts:24`
destructures `{ email, password, role, org_id }` and passes `role || "member"` straight to
`org_memberships.insert` — no allow-list on `role`.

**Why it matters:** malformed or hostile bodies reach business logic and the DB unchecked; no
length bounds anywhere; enum fields (role, item_type, tier) accept arbitrary strings until a DB
CHECK rejects them (or doesn't).

**Fix (single task, incremental):** add zod + a tiny `parseBody(schema, req)` helper in
`src/lib/api/`, then convert the mutating routes first (`admin/users`, `orgs/*`, `community/posts`,
`agent/run`, `staged-updates`). One route per commit is fine.

## 8. MEDIUM-HIGH — No idempotency/concurrency lock on generation; the daily spend cap is racy

**What:** nothing prevents two concurrent `generate-brief` runs on the same `itemId`
(two admins clicking regenerate, or a retrying client). `preflightStep`
(`fsi-app/src/workflows/generate-brief.ts:100-125`) checks global gates only, and the $5/day cap
is read-then-act: two runs can both read `spent < cap` before either writes its ledger row.

**Why it matters:** double Sonnet spend and interleaved writes to the same row's 19-field
contract; the Workflow DevKit gives per-step retry durability, not mutual exclusion.

**Fix (single task):** conditional-update lock before generation
(`UPDATE intelligence_items SET generation_status='running' WHERE id=$1 AND generation_status IS DISTINCT FROM 'running'`,
bail if 0 rows; clear in a finally/erase path), and make the cap check an atomic
increment-then-verify via a small RPC.

## 9. MEDIUM — 108 error-dropping `const { data }` Supabase destructures; the named bug-class has no guard

**What:** the doctrine contains a whole post-mortem about a dropped `error` destructure silently
disabling four cost gates — yet `src/` still has ~108 `const { data } = await …` destructures
that drop `error` (e.g. `src/app/api/ask/route.ts:111` — the main content fetch;
`src/stores/settingsStore.ts:162`; the `[slug]` detail pages), and **no lint rule or CI job
guards the class**. `.github/workflows/bug-class-guard.yml` guards a different class
(inconclusive answers); `eslint.config.mjs` is stock Next config.

**Why it matters:** every one of the 108 is a potential silent failure identical to the one that
already burned the project. The post-mortem's "future-agent rule" is enforced only by memory.

**Fix (single task):** write `scripts/verify/error-drop-audit.mjs` (regex/AST scan for
`const { data` without `error` on supabase call chains, with an inline
`// error-intentionally-ignored:` escape hatch), wire it into the bug-class-guard workflow's soft
job first, promote to hard once the count is burned down.

## 10. MEDIUM — Nothing structural forces new API routes to authenticate

**What:** there is no `src/middleware.ts` and no CI check that every `src/app/api/**/route.ts`
calls `requireAuth`/an auth gate. Today 74/76 routes are correctly gated (the 2 public ones are
legitimate OAuth handshakes); the risk is the next route.

**Fix (single task):** add a fitness function (the `.discipline/fitness/` pattern already exists —
F2 does exactly this for admin routes) asserting every API route file references `requireAuth`,
`requireCommunityAuth`, a worker-secret check, or a `// PUBLIC:` justification comment.

## 11. MEDIUM — 9 committed migrations not applied; migration numbering is corrupted

**What:** `docs/inventories/migrations.md` marks 101, 146, 147, 148, 149, 150, 151, 152, 153 as
NOT YET APPLIED (146+ blocked on "no DDL-capable connection" — the Supabase MCP is scoped to a
different project and `scripts/lib/db.mjs` is PostgREST-only). Meanwhile the numbering has
collisions (006 ×2, 007 ×3) and gaps (008, 012, 014, 078, 095, 096, 127). UI features
(severity tiles, facet counts, T07/T11 surfaces) ship in honest-pending fallback mode because
their columns don't exist — logged as deviations D02-1/D02-2 in
`fsi-app/docs/design/redesign/DESIGN-DEVIATIONS.md`.

**Why it matters:** the longer the applied-vs-committed drift lives, the more code paths carry
dual fallback logic, and the higher the risk someone assumes a column exists. The collisions are
accepted aesthetic debt (do NOT renumber), but the unapplied backlog is real functional debt.

**Fix (single task):** from a machine with a DDL-capable connection, `npx supabase migration list
--linked`, apply 146–153 in order per the two-track policy, update the inventory, then remove the
honest-pending fallbacks (D02-1/D02-2) in a follow-up commit.

## 12. MEDIUM — Test coverage is real but lopsided, and part of it is unwired from CI

**What:** ~90 `node:test` files exist, but:
- `.discipline/run-test-suite.sh` runs a **curated subset**; several selftests
  (`decision-anchors`, `deferral`, `exclusion-audit`, `trust.selftest`, `institution.selftest`)
  run only if invoked by hand.
- `src/__tests__/staged-updates-approval.test.ts` is a **.ts test with no TS test loader
  anywhere** — it cannot currently run at all.
- There is **no `npm test` script**, no UI-component tests, no API-route integration tests, and
  no browser/E2E harness. Untested critical paths: the approval flow end-to-end, all 76 route
  handlers' auth/validation behavior, the Zustand override merge logic, the workflow's failure
  ladder (re-ground → re-research → erase) as a sequence.

**Why it matters:** the best-tested code (the `.mjs` primitives) is not where regressions arrive;
regressions arrive in routes and orchestration, which have nothing.

**Fix (single task, first increment):** add `"test": "bash .discipline/run-test-suite.sh"` to
`fsi-app/package.json`; add the orphaned selftests to the suite list; convert
`staged-updates-approval.test.ts` to `.mjs` (or add `tsx --test`) so it actually runs.

## 13. MEDIUM — Duplicated trust-scoring logic in two files that must stay in sync by hand

**What:** `fsi-app/scripts/cron/q7-daily-recompute.mjs` mirrors `fsi-app/src/lib/trust.ts`
verbatim because Node can't import TS; its header says "ANY logic change MUST land in both
places."

**Why it matters:** classic two-homes drift. The monthly recompute (trust-recompute.yml) and the
app will silently disagree the first time someone edits one file.

**Fix (single task):** extract the pure scoring math to `src/lib/trust-core.mjs` (the repo's
established `.mjs`-primitive pattern), import it from both `trust.ts` and the cron script, add a
parity `.test.mjs`.

## 14. MEDIUM — Dead code left on disk after the redesign

**What:** `fsi-app/src/components/regulations/RegulationsSurface.tsx` (1,963 lines — the largest
component in the repo) is orphaned; the page renders `RegulationsLedger`. The old kanban files are
likewise unreferenced (already flagged as deviation D02-5, "proposed for removal"). The June
audit's dead list (~19 components, dead modules like `source-pool`, dead route
`api/worker/reconcile`, ~20 orphaned selftests) is partially actioned; `useScrollToResource` has
an unresolved dead-or-wired verdict.

**Why it matters:** violates the project's own rule 9 ("deprecation means deletion, not
annotation"); 2,000-line dead files are where future agents waste context and make edits that do
nothing.

**Fix (single task):** delete `RegulationsSurface.tsx` + kanban leftovers (verify zero imports
first: `grep -r "RegulationsSurface" src/`), resolve the `useScrollToResource` verdict, commit as
the D02-5 cleanup. Do the June-audit dead list as a second pass.

## 15. MEDIUM — No database backup story

**What:** `fsi-app/docs/FOLLOW-ONS-2026-06-20.md` states it plainly: no scheduled `pg_dump`, no
confirmed PITR; protection is soft-delete + row versioning + `scripts/_snapshots/` (which only
covers guarded script writes, not app writes or DB triggers).

**Why it matters:** the data layer IS the product (code-vs-data separation doctrine: data changes
are durable and not recoverable from git). One bad service-role script without a snapshot, or one
Supabase incident, is unrecoverable.

**Fix (single task):** confirm/enable PITR on the Supabase project (dashboard setting), and add a
weekly GitHub Actions job that runs `pg_dump` (schema + data) to an artifact/private storage
using the existing `SUPABASE_DB_PASSWORD` secret.

## 16. MEDIUM — Doc-vs-reality drift in the places agents trust most

**What (four instances):**
- `fsi-app/.claude/CLAUDE.md` API table documents two controls that don't exist (see #2, #3).
- `docs/inventories/discipline.md` describes the slimmed 8-mechanism engine of 2026-05-21;
  the live `.discipline/` has 12 fitness functions, 3 consistency checks, and a 66 KB invariant
  registry — including C5, which the inventory says was deleted.
- `fsi-app/STATUS.md` documents a superseded branch (`redesign/full-migration`) and a Windows
  preview path that isn't in the tree.
- `design_handoff_2026-05/README.md` says "six customer-facing surfaces" (pre-dates the ratified
  five-surface model).

**Why it matters:** this project runs on agents reading docs. Stale doctrine-adjacent docs are
actively harmful here in a way they wouldn't be elsewhere.

**Fix (single task each):** correct the CLAUDE.md API table to enforced-reality; rewrite
`inventories/discipline.md` from the live manifest; either delete `fsi-app/STATUS.md` or replace
its body with a pointer to `docs/program/GOVERNING-PROGRAM.md`; add a "historical" banner to
`design_handoff_2026-05/README.md`.

## 17. MEDIUM — Corpus quality soft spots (data, not code)

**What (from `PRODUCT-STATE-2026-06-20.md` / `FOLLOW-ONS-2026-06-20.md`):** regulation — the
flagship surface — is the weakest corpus at ~51% customer-ready (47/96 quarantined); the 30
flagship regulations were only ~20% customer-ready; 3 flagship briefs have known content errors
(2 max_tokens truncations, 1 out-of-vocab tag); ~11 residual quarantined items; 3 institutional
rows still possibly mis-typed as `item_type='tool'` (the reclassify mechanism exists — check
/admin and run `reclassifyToSource` if still mis-typed); 2,325 stale `intelligence_summaries`
rows shelved.

**Why it matters:** a customer landing on Regulations sees the thinnest verified coverage on the
surface that defines the product.

**Fix (single task each):** re-run generation on the 3 known-error flagships; work the
counsel-held queue; verify/reclassify the 3 `tool` rows via the guarded path.

---

## 18. LOW — Worker-secret comparison is not timing-safe

**What:** all sites in #1 compare with `!==`. Length/prefix leaks under a timing oracle are
theoretical here (network jitter dominates), but the fix is one helper.
**Fix:** fold into the #1 task (`crypto.timingSafeEqual` + length guard).

## 19. LOW — "Technology" renders as an unsanctioned sixth customer surface

**What:** technology/innovation/tool items render via technology_profile briefs and a
TechnologyTracker view, but the ratified model (invariant PI-1) has five customer surfaces.
The June audit called for a "sanction-or-fold" decision; none is recorded.
**Why it matters:** an invariant with a live, visible exception teaches agents that invariants
are negotiable.
**Fix:** operator decision recorded as an ADR (sanction as a sixth surface, or fold Technology
into Market Intel); then a small routing commit either way.

## 20. LOW — Raw SQL string interpolation in operator scripts

**What:** `scripts/_diag/*.mjs`, `scripts/phase-5-backfill.mjs:366,369` build SQL with
`${table}`/`${col}` template literals. Identifiers come from pg_catalog/hardcoded lists, so real
injection risk is low — but it's the pattern most likely to be copy-pasted into something
user-reachable.
**Fix:** parameterize values; validate identifiers against an explicit allow-list.

## 21. LOW — Monster files

**What:** `src/lib/supabase-server.ts` (2,621 lines — the entire server read layer),
`RegulationDetailSurface.tsx` (1,299), `CommunityRooms.tsx` (1,297), `canonical-pipeline.ts`
(1,272), `MapPageView.tsx` (1,218), plus five near-duplicate ~1,000-line Ledger/DetailSurface
pairs per surface.
**Why it matters:** merge-conflict and context-window hotspots; the Ledger pattern is duplicated
five times so fixes must be applied five times.
**Fix (incremental):** split `supabase-server.ts` by domain (items/sources/community/aggregates)
behind an unchanged barrel export. Don't refactor the surface components until the redesign waves
finish.

## 22. LOW — Out-of-repo operational surface is unauditable (and once held plaintext credentials)

**What:** load-bearing config lives outside the repo where governance can't see it: the operator's
`~/.claude/settings.json` (which the June audit found containing a plaintext GitHub PAT and the
Supabase service-role JWT in its allow-list), the destructive-op PreToolUse hook, Vercel env
vars, and the Gist-hosted global CLAUDE.md that `install.sh` pulls unpinned.
**Why it matters:** the repo's elaborate in-repo governance has a blind side;
`.discipline/governance/OUT-OF-REPO-BOUNDARY.md` documents it but can't enforce it. The
credential finding should be treated as exposure: rotate.
**Fix (single task):** rotate the GitHub PAT and Supabase service-role key; move secrets out of
`~/.claude/settings.json` allow-lists; pin the Gist fetch in `install.sh` to a revision hash.

## 23. LOW — Product blanks a new hire should know are blanks, not bugs

Community is wired but empty (0 groups/0 posts); billing/Stripe does not exist; onboarding is
shelved ("Coming soon" LinkedIn import, sector activation deliberately deferred); there is no
full-text search (search = LLM `/api/ask` + client-side filters). All deliberate, all documented
in `PRODUCT-STATE-2026-06-20.md` — listed here so nobody "discovers" them as defects.

---

## Recently closed (verify, don't re-report)

- **`/events` hard-404** (June audit, HIGHEST customer-facing): `next.config.ts` now carries a
  permanent redirect `/events → /community`. Appears fixed — confirm in prod.
- **"Research-or-erase" half-wired** (June audit said no erase path existed): the current
  `generate-brief.ts` workflow has the full tiered ladder (re-ground → re-research → erase).
  Appears fixed.
- **Secrets in the repo:** none found. No hardcoded API keys/JWTs/webhooks in `src/`, `scripts/`,
  or `docs/`; `.env*` properly ignored; `NEXT_PUBLIC_*` limited to safe values; service-role key
  never reaches client components. (The out-of-repo exposure in #22 is the exception.)
- **Admin routes:** every `/api/admin/*` route verified to check `isPlatformAdmin` inline.
