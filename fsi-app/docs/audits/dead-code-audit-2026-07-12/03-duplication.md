# Duplicate-Logic Audit — Caro's Ledge (fsi-app)

Date: 2026-07-12 · Scope: read-only · DELETE NOTHING
Method: grep for repeated code shapes (URL/host normalization, tier resolution, supabase-client
construction, date formatting, fetch/retry, error-body detection, slug/id parsing, HTML strip,
response parsing), then read canonical + duplicate sites to judge drift.

Trusted context honored:
- `src/lib/sources/url-canonicalize.ts` (`canonicalizeUrl`) and `src/lib/agent/url-canon.mjs`
  (`canonicalizeCitationUrl`) are the TWO SANCTIONED URL canonicalizers — not reported as duplicates.
  Other ad-hoc URL normalizers are reported as duplicates of these (Cluster 8).
- `src/lib/sources/institution.ts` is the canonical tier/institution resolver (Clusters 3, 4, 10).

**Cluster count: 14** (11 with confirmed drift; 3 exact-or-benign copies).

---

## Top clusters by blast radius

### Cluster 1 — Service-role Supabase client factory  ⚠ DRIFTED — HIGH IMPACT
**What:** a local `getServiceClient()` (or `svc()`) that wraps `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, …)`.
**Canonical home:** `src/lib/supabase-server.ts:41` `getServiceSupabase()` — throws a descriptive error if the
key is missing, sets `{ auth: { persistSession: false } }`.
**Duplicates:** **52** local `function getServiceClient` defs in `src/` (nearly every `src/app/api/**/route.ts`
plus `src/lib/coverage-gaps.ts:167`, `src/lib/sources/verification.ts:756`, `src/lib/sources/discovery.ts:532`,
`src/lib/notifications/{dispatch,seed-fallback-flag}.ts`, `src/app/api/workspace/{overrides,regulations-defaults}/route.ts`),
plus `svc()` in `src/workflows/generate-brief.ts:64`, `src/lib/agent/canonical-pipeline.ts:99`,
`src/lib/llm/spend-client.ts:131`.
**Drift (3 axes — behaviorally different, not cosmetic):**
- Missing-key handling: canonical **throws**; `worker/reconcile:23` and `verification.ts:756` **non-null assert (`!`)**; `coverage-gaps.ts:167` **returns `null` and silently falls back to the ANON key**.
- `persistSession`: canonical + most routes set `false`; `verification.ts:756` and several others pass **no options at all** (default session persistence).
- Anon fallback: only `coverage-gaps.ts` degrades to `NEXT_PUBLIC_SUPABASE_ANON_KEY` — a silent privilege downgrade the others never do.
**Note:** no "single home" doctrine comment exists on these despite `getServiceSupabase()` being the obvious home.

### Cluster 2 — Script-side service-client construction  (exact copies, script tier)
**What:** inline `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })` at the top of one-shot scripts.
**Canonical home:** none for scripts (`scripts/lib/db.mjs` exists but most scripts don't use it).
**Duplicates:** **182** files under `scripts/` + `supabase/seed/`. Largely exact copies; low drift risk but the
single largest raw copy-paste count in the repo. Discipline rule `.discipline/rules/017-generation-config-no-raw-env`
already governs the app path; scripts are unbound.

### Cluster 3 — `hostOf` host extraction (`new URL(x).host.replace(/^www\./,"").toLowerCase()`)  ⚠ DRIFTED
**What:** parse a URL, take host/hostname, strip `www.`, lowercase.
**Canonical home:** `src/lib/sources/institution.ts:32` exports `hostOf()`. **This is exported and importable.**
**Duplicates (production `src/`, ~13 re-inlines instead of importing the export):**
- `src/lib/sources/fetch-hold.mjs:87` — identical logic, re-inlined.
- `src/lib/sources/portal-links.mjs:35,48`, `officialness.mjs:152`, `primary-fallback.mjs:113`,
  `src/lib/agent/canonical-pipeline.ts:148` — `host.replace(/^www\./,"").toLowerCase()` on an already-parsed URL.
- `src/lib/sources/host-authority.ts:30` — adds a trailing-dot strip (`.replace(/\.$/,"")`) the canonical lacks.
- `src/lib/sources/classify-source-role.ts:30`, `vertical-fit-gate.ts:29` — use `.hostname` (not `.host`) + strip www.
- `src/lib/sources/rss-fetch.ts:61`, `verification.ts:372` — `.hostname.toLowerCase()` **without** www-strip (drift).
- `src/lib/sources/transport-escalation.mjs:113,132`, `source-growth.ts:94`,
  `src/app/api/admin/canonical-sources/decide/route.ts:211`, `.../sources/promote/route.ts:121` — `.host` **without** www-strip/lowercase (drift).
**Duplicates (scripts):** ~80 copies (e.g. `scripts/lib/db.mjs:218`, and the whole `scripts/_diag/*`, `scripts/tmp/*`,
`scripts/verify/*` families each redefine `hostOf`/`host`).
**Drift:** `host` vs `hostname`, www-stripped vs not, lowercased vs not — three sub-variants that produce
different keys for the same URL. **F18-one-url-canonicalizer.mjs DELIBERATELY exempts this class** (its comment
calls host-extraction "a different" concern from URL-identity canonicalization), so the fitness function will
never flag it — the exemption is doctrine, but the pattern remains an un-DRY, drifting cluster with an exported home going unused.

### Cluster 4 — `hostInstitution` / eTLD+1 + `TWO_LEVEL` set  ⚠ DRIFTED (correctness)
**What:** collapse a host to its registrable domain (eTLD+1) with a hardcoded multi-level-TLD exception set.
**Canonical home:** `src/lib/sources/institution.ts:23` (`TWO_LEVEL` Set) + `:37` `hostInstitution()`.
**Duplicates:**
- Full copies of the `TWO_LEVEL` Set + `institution()` fn: `scripts/phase0prime-apply.mjs:28`,
  `scripts/_diag/classify-institutions.mjs:18`, `scripts/_diag/enumerate-institutions.mjs:20`,
  `scripts/_diag/probe-f1-canonical.mjs:14`.
- `scripts/source-institution-backfill.mjs:23-28` — its own **`SLD`** set (different name, different membership) doing the same job.
- `src/lib/agent/audit-gate.test.mjs:12` and `scripts/_diag/_source-count-breakdown.mjs:24` — a **naive `slice(-2).join(".")` with NO TWO_LEVEL set** → wrong eTLD+1 for `co.uk`/`gov.uk`/etc. Confirmed behavioral drift.
- `supabase/seed/{audit-source-attribution,tier1-population-runner}.mjs` — `parts.slice(-2).join(".")` naive variant.
**Drift:** the naive variants and the differing `SLD`/`TWO_LEVEL` membership lists mean the same host resolves to
different institutions in different tools — a tier-grouping correctness hazard.

### Cluster 5 — Supabase project-ref extraction (`new URL(SUPABASE_URL).host.split(".")[0]`)  (exact copies)
**Duplicates:** **11** — `scripts/apply-migrations.mjs:11`, `backfill-claim-tiers-pg.mjs:49`,
`phase2-analysis-relabel.mjs:150`, `vocab-sync-audit.mjs:23`, `supabase/seed/{perf-capture,verify-end-to-end}.mjs`,
`scripts/_diag/{forced-rpc-error-test,revalidate-141,_test-aster,_verify-142,_verify-143}.mjs`. Exact copies, script tier.

### Cluster 6 — `formatDate`  ⚠ DRIFTED (two ways)
**Canonical home:** `src/lib/format.ts:2` `formatDate()` — custom month-array formatter, output `"5 Jun 2026"`; handles `YYYY-MM`.
**Duplicates:** **7** local `function formatDate`:
- `src/app/market/[slug]/page.tsx:239` and `src/app/regulations/[slug]/page.tsx:238` are **byte-identical copies of each other** — a `toLocaleDateString("en-US", …)` variant that outputs `"Jun 5, 2026"` (different order from canonical).
- `src/components/{admin/OrganizationsTable.tsx:336, regulations/OwnerTeamCard.tsx:151, operations/OperationsDetailSurface.tsx:440, research/ResearchFindingDetailSurface.tsx:286, settings/SavedSearchesSection.tsx:331}` — each its own `toLocaleDateString`-family variant.
**Drift:** canonical produces `"5 Jun 2026"`; all 7 copies produce locale-formatted `"Jun 5, 2026"` — inconsistent date display across surfaces, and none reuse the shared function.

### Cluster 7 — `formatRelative` / `timeAgo`  ⚠ DRIFTED — violates its OWN single-home doctrine
**Canonical home:** `src/lib/relative-time.ts:13` `formatRelative(ts: Date)` + `toDate()`. Header comment explicitly
says *"Add new consumers here, don't reinline"* and names RecencyChip as an intended consumer.
**Duplicates (4 inline copies):**
- `src/components/credibility/RecencyChip.tsx:33` — re-inlines its own `formatRelative(ts: Date)` **despite the lib comment naming it as the consumer that should import** (self-drift against a stated doctrine).
- `src/components/community/Post.tsx:550` — compact `"m ago / h ago / d ago"` form; no weeks/months/years/future.
- `src/components/community/ModerationQueue.tsx:622` — another inline `formatRelative(iso)`.
- `src/components/community/CommunityRooms.tsx:131` — `timeAgo(iso)`, same concept, different name.
**Drift:** canonical emits `"min ago / hr ago / days ago"` and handles future + week/month/year buckets; the copies
emit terse `"m/h/d ago"` and drop the longer buckets. Same-app timestamps read differently per surface.

### Cluster 8 — Ad-hoc URL canonicalizers (duplicates of the two SANCTIONED canonicalizers)  ⚠ DRIFTED
**Sanctioned homes:** `url-canonicalize.ts` (`canonicalizeUrl`), `url-canon.mjs` (`canonicalizeCitationUrl`).
**Duplicates (ad-hoc `normUrl`/`canon` that lowercase + strip scheme/www/trailing-slash, sometimes sort query):**
- `scripts/lib/funded-release-plan.mjs:22`, `scripts/_diag/_wave-dedup.mjs:17`, `_wave-dedup2.mjs:15`, `_wave-dedup3.mjs:19` — `normUrl` (strip `https?://` + `www.` + trailing slash).
- `scripts/_diag/_backlog-dispose.mjs:33` — `canon` that **also sorts query params** (behavior neither sanctioned one may match).
- `scripts/_diag/_e2-triage.mjs:28`, `_phase2-reground.mjs:14` — `canon` = host+pathname, trailing-slash strip variants.
**Drift:** each rolls its own normalization rule (query-sort vs not; trailing-slash `/+$` vs `/$`), so dedup keys
disagree across tools. These are exactly the class the sanctioned canonicalizers exist to own. Script tier, but they
make dedup decisions.

### Cluster 9 — HTML-strip-to-text (`.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()`)  (mostly exact, no home)
**Duplicates:** **8** — `src/lib/agent/canonical-pipeline.ts:113`, `src/lib/sources/canonical-fetch.mjs:62`,
`src/lib/sources/api-fetch.ts:84,145`, `src/lib/sources/officialness.mjs:55` (`stripTags`), `rss-fetch.ts:75`,
`src/lib/llm/haiku-classify.ts:194`.
**Drift:** minor — `officialness.mjs` and `canonical-fetch.mjs` additionally strip HTML entities
(`&…;`); the rest strip tags + whitespace only. No shared helper; a `stripHtmlToText()` home is the obvious extraction.

### Cluster 10 — `effective_tier ?? base_tier` display-tier read  (doctrine-acknowledged, no helper)
**What:** the display/analytical tier read (reputation-aware), distinct from the grounding resolver's `base_tier`-only rule.
**Sites:** ~12 inline — `src/stores/sourceStore.ts:111`, `src/lib/trust.ts:851,941`, `src/lib/supabase-server.ts:1177,2300`,
`src/lib/sources/source-growth.ts:179`, `src/components/sources/SourceProvenanceBadge.tsx:34`,
`SourceAdminControls.tsx:559` (adds `tier_override` in the middle — drift), `src/app/api/ask/route.ts:224,255,361`,
`src/app/api/admin/sources/tier-opinions/route.ts:121`.
**Status:** `institution.ts:56` **explicitly sanctions** display readers doing their own inline `effective_tier ?? base_tier`
read (the moat keeps this OUT of the grounding resolver). So this is *intended* separation, NOT an accidental dup — but
it is an **uncentralized repeated read with one variant drift** (`SourceAdminControls` inserts `tier_override`). If the
display fallback rule ever changes, 12 sites move by hand. Flagged as doctrine-acknowledged duplication, candidate for a
tiny `displayTier(source)` helper (would not violate the moat).

### Cluster 11 — `safeJson(res)` response parser  ⚠ DRIFTED (signatures)
**Duplicates:** **9** in `src/components/community/` — `Post.tsx:565`, `PostList.tsx:280` (generic `<T>`),
`GroupCard.tsx:414`, `GroupHeader.tsx:424` (`any`), `ModerationActions.tsx:404`, `ModerationQueue.tsx:633`,
`PostComposer.tsx:228`, `ReplyComposer.tsx:186`, `ReportPostMenu.tsx:357` (bespoke `{error?}` / `{post?}` / `{reply?}` shapes).
**Drift:** same try/catch-`res.json()`-return-null body, but return types diverge (`any` vs generic vs narrow object),
so there is no single importable version. Clean extraction candidate into a community util.

### Cluster 12 — `legacy_id || id` UI-id derivation  (partial — home exists, re-inlined)
**Canonical home:** `src/lib/supabase-server.ts:65` `uiId()` (handles array-or-object embed shape).
**Duplicates:** ~13 inline `row.legacy_id || row.id` — `src/app/{operations,research}/[slug]/page.tsx:57/51`,
`src/app/regulations/[slug]/page.tsx:168`, `src/components/admin/ResearchPipelineQueueView.tsx:196`, and even
inside `supabase-server.ts` itself (`:511,535,886,1082,2212,2485`). Benign logic-wise, but the `uiId()` helper is bypassed.

### Cluster 13 — Error-body / failed-fetch detection  (MOSTLY CONSOLIDATED — one stray + a vocab split)
**Canonical home:** `src/lib/sources/entity-gate.mjs:87` `isErrorBody()` — correctly reused by `first-fetch-classify.ts`,
`fetch-now-decision.mjs`, `primary-fallback.mjs`, `transport-escalation.mjs` (RD-13/RD-14 explicitly fold to one home).
**Residual duplication:**
- `src/lib/sources/fetch-quality.ts:30` `BRIEF_FAILURE_PATTERNS` — a **second, separate** marker list (`403 forbidden`,
  `404 not found`, `access denied`, `content unavailable`…) overlapping `isErrorBody`'s vocabulary, kept apart because it
  scans agent-produced brief bodies vs raw fetches. Justified split, but the marker vocab is duplicated by hand.
- Per the file's own note (`fetch-quality.ts:5-7`), the removed pre-classify gate's `BLOCK/NOT_FOUND/MAINTENANCE`
  pattern sets **still live in `scripts/lib/fetch-quality.mjs`** as a divergent script-side copy.
**Verdict:** production path is the good example; the marker-vocabulary is the only duplicated substance.

### Cluster 14 — Retry / backoff loops + local `sleep()`  ⚠ mild drift (independent impls)
**What:** hand-rolled `for (attempt…)` + exponential/array backoff + a local `sleep`/`setTimeout` promise.
**Sites:** `src/lib/sources/reachability.mjs:56` (`backoff = [200,800,3200]`), `src/lib/sources/verification.ts:309`
(`HEAD_BACKOFF_MS` + its own `sleep()` at :322), `src/app/api/community/groups/route.ts:107` (`for attempt<3`),
`src/workflows/generate-brief.ts` (WDK `maxRetries=3`, `attempt^2` backoff — the sanctioned owner for the agent path).
**Drift:** three independent backoff schedules + duplicated `sleep()` helpers; no shared retry primitive. Low severity
(each is small), but a `withRetry(fn, {backoff})` util would consolidate.

---

## Summary table

| # | Cluster | Canonical home | # copies | Drift? |
|---|---|---|---|---|
| 1 | Service-role client factory | `getServiceSupabase()` supabase-server.ts:41 | 52 (+3 `svc`) | YES — throw/null/assert, anon fallback, persistSession |
| 2 | Script service-client construct | (none) | 182 | exact copies |
| 3 | `hostOf` host extraction | `institution.ts:32` (exported) | ~13 src + ~80 scripts | YES — host/hostname, www, case; F18-exempt |
| 4 | `hostInstitution`/TWO_LEVEL | `institution.ts:23,37` | ~7 | YES — naive slice(-2) wrong for co.uk; SLD set differs |
| 5 | project-ref split | (none) | 11 | exact copies |
| 6 | `formatDate` | `format.ts:2` | 7 | YES — locale vs custom; 2 byte-identical siblings |
| 7 | `formatRelative`/`timeAgo` | `relative-time.ts:13` | 4 | YES — violates own "don't reinline" doctrine |
| 8 | ad-hoc URL canonicalizers | url-canonicalize.ts / url-canon.mjs | ~7 | YES — query-sort/trailing-slash variants |
| 9 | HTML-strip-to-text | (none) | 8 | minor — entity-strip variant |
| 10 | `effective_tier ?? base_tier` | (intentionally inline) | ~12 | doctrine-acknowledged; 1 tier_override drift |
| 11 | `safeJson(res)` | (none) | 9 | YES — signature drift |
| 12 | `legacy_id || id` | `uiId()` supabase-server.ts:65 | ~13 | benign — home bypassed |
| 13 | error-body detection | `isErrorBody()` entity-gate.mjs:87 | consolidated + 1 stray | mostly good; vocab split + script copy |
| 14 | retry/backoff + `sleep()` | generate-brief (agent only) | ~4 | mild — independent impls |

## Highest-value consolidation targets (production, drift-bearing)
1. **Cluster 1** (service client) — 52 sites, 3-axis behavioral drift incl. a silent anon-key downgrade. Highest risk.
2. **Cluster 4** (eTLD+1) — correctness drift: naive `slice(-2)` copies mis-group `co.uk`/`gov.uk` institutions → wrong tier grouping.
3. **Cluster 3** (`hostOf`) — exported home unused by ~13 production sites with www/case drift; F18 will never catch it.
4. **Clusters 6 & 7** (date/relative-time) — user-visible inconsistency; Cluster 7 self-drifts against a written doctrine.
