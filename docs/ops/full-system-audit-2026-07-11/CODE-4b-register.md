# CODE-4b Register — UI Pages, Types, Styles, Data Seeds, Proxy

Full-system audit 2026-07-11 · baseline master `71bcbd4` · branch `audit/full-system-2026-07-11`
Agent: CODE-4b · READ-ONLY (this register is the only file written)

**Slice (reconciled against `_manifest_files.tsv`): 51 files / 13,796 tsv lines** = all of
`fsi-app/src/app/**` excluding `src/app/api` (29 files), `src/types/**` (4), `src/data/**` (13,
incl. 2 JSON data + favicon.ico), `src/hooks/**` (1), `src/__tests__/**` (2), `src/proxy.ts` (1),
plus both CSS files. The tsv carries no other unclaimed `src/` file (verified by set-difference
against the CODE-1/2/3/4a path prefixes). The manifest's "~17K lines" estimate for this slice
resolves to 13,796 tsv lines; the delta is estimate roundup, not missing files.

DB verification: 4 SELECT-only queries against `kwrsbpiseruzbfwjpvsp` (vocab distincts, column
existence for every column the pages read, provenance split). Zero writes, zero fetches.

---

## 1. Route map and nav model (focus area a)

**23 page routes + 1 route handler exist under `src/app` (non-api):**

| Route | Auth gate | Reached from |
|---|---|---|
| `/` | proxy (session) | Sidebar "Dashboard", logo |
| `/regulations`, `/regulations/[slug]` | proxy | Sidebar; ledger rows |
| `/market`, `/market/[slug]` | proxy | Sidebar "Market Intel"; ledger rows |
| `/research`, `/research/[slug]` | proxy | Sidebar; ledger rows |
| `/operations`, `/operations/[slug]` | proxy | Sidebar; ledger rows |
| `/map` | proxy | Sidebar |
| `/community` | proxy + in-page redirect | Sidebar |
| `/community/browse` | proxy + in-page redirect | CommunityShell/Sidebar/Rooms links |
| `/community/[slug]` | proxy + RLS notFound | browse grid, sidebar memberships |
| `/community/moderation` | proxy + in-page redirect (RLS narrows) | CommunityRooms link |
| `/admin` | proxy + `requirePlatformAdmin("/admin")` | Sidebar footer button, UserMenuDropdown, multiple in-surface links |
| `/profile` | proxy + in-page redirect | UserMenuDropdown, AccountMasthead |
| `/settings` | proxy + in-page redirect | UserMenuDropdown, AccountMasthead, CommunitySidebar |
| `/onboarding` | proxy + in-page redirect + `/workspace/new` bounce | signup email link (`?next=/onboarding`), CommunityShell/Sidebar |
| `/workspace/new` | proxy + in-page redirect | AppShell no-workspace banner, onboarding bounce |
| `/invitations/[token]` | proxy + in-page redirect | external email link (by design) |
| `/privacy` | **proxy (auth-gated — see F2)** | settings HelpSection |
| `/login`, `/signup` | public (proxy PUBLIC_ROUTES) | each other; all redirect targets |
| `/auth/callback` (route.ts) | public | Supabase email links |

Nav model: `Sidebar.tsx` PRIMARY_NAV (Dashboard/Regulations/Market/Research/Operations/Map) +
COMMUNITY_NAV (Community) + role-gated Admin footer button; `UserMenuDropdown` (Profile/Admin/
Settings); Community chrome links (browse/moderation/onboarding/settings); AppShell banner
(workspace/new).

**`/events` 404 class (June audit): CURED at both ends.** No `/events` page exists and zero
`href`/`push` references to `/events` remain anywhere in `src/` (grep verified). **No orphan
pages found**: every route above has at least one live nav path or a designed external entry
(invitations, auth callback). No `not-found.tsx` exists — `notFound()` calls fall to the Next
default 404 (cosmetic gap only, LOW).

---

## 2. Findings

Severity: **HIGH** = customer-visible integrity/security; **MED** = real defect, contained;
**LOW** = hygiene/debt.

### F1 — HIGH — Related-items rails bypass the verified gate (quarantine leak)
`src/app/research/[slug]/page.tsx:146-188` and `src/app/operations/[slug]/page.tsx:176-244`
select related items with the **service-role key** filtered only by `.eq("is_archived", false)`
(+ theme/jurisdiction/source match) — **no `provenance_status = 'verified'` predicate**. DB
verified: 106 of 285 active items are `quarantined`. Quarantined titles/summaries can render in
the customer-facing "related" rails and link into their detail pages, contradicting the doctrine
"customer reads gate on provenance_status='verified'" and the moat gate work (mig 119/158 lane).
Same class, smaller surface: `src/app/regulations/[slug]/page.tsx:116-174` resourceLookup fetches
title+priority for xref/supersession ids with no provenance predicate. By contrast
`/market/[slug]` relatedPool correctly reuses verified-gated `getMarketIntelItems`.
**Next action:** add `provenance_status='verified'` (or route through the gated RPCs) to the three
related-item/lookup queries; sweep for the class (`service-role SELECT on intelligence_items
without provenance predicate` in page code). X-agent: CODE-3 should confirm whether
`fetchIntelligenceItem` gates the detail render itself.

### F2 — MED — `/privacy` is auth-walled while declaring itself indexable
`src/proxy.ts:5` PUBLIC_ROUTES = login/signup/auth-callback only; `src/app/privacy/page.tsx:7`
sets `robots: { index: true, follow: true }`. Anonymous visitors (and crawlers) are 307'd to
`/login` — a privacy policy unreadable before signup, which GDPR/CCPA notice-at-collection
expects to be public. **Next action:** add `/privacy` to PUBLIC_ROUTES.

### F3 — MED — Open-redirect vectors in the two auth entry points
- `src/app/auth/callback/route.ts:23,51` — `next` from the query string is unvalidated and
  concatenated: `NextResponse.redirect(`${origin}${next}`)`. A crafted `next` beginning with
  `@host` or `\` can escape the origin (`https://app@evil.com` parses host=evil.com).
- `src/app/login/page.tsx:16,35` — `redirect` param passed raw to `router.push(redirect)`;
  `?redirect=https://evil.com` navigates off-site post-login (phishing-grade).
**Next action:** enforce `next`/`redirect` startsWith("/") && !startsWith("//") (single shared
helper), else fall back to "/".

### F4 — MED — `types/intelligence.ts` severity union contradicts live DB vocabulary
`src/types/intelligence.ts:91` declares `severity: "critical"|"high"|"moderate"|"low"`. Live DB
(verified by SELECT): `monitoring` 528, `cost_alert` 48, `action_required` 46,
`competitive_edge` 9, `window_closing` 3, plus legacy `moderate` 4 / `high` 2 / NULL 13. The
migration-102 per-surface vocab replaced the four-level one; `types/resource.ts:137` already says
so. This is the metadata-vocab-fracture class (memory: severity 3-way fracture) surviving in a
type. Also: `ItemType` union (`:20-32`) lacks `"law"`, which `operations/page.tsx:22-29`,
`lib/domains` routing, and the migration-101 CASE all treat as valid (0 live rows today, so
latent). **Next action:** regenerate/align the type unions with `metadata-vocab.ts` (the declared
SoT); X-agent DB-1: 6 rows still carry legacy severity values + 13 NULL — flag for backfill.

### F5 — MED — Hardcoded "workspace verticals: Live events · Fine art" in Regulations masthead
`src/app/regulations/page.tsx:66-67` prints the verticals as string literals in the sub-line.
Not read from `workspace_settings`/sector profile — every workspace sees the same claim. This is
the surface-honesty class (masthead chrome asserting workspace facts with no backing field).
Same file also renders fail-soft counts correctly — only the verticals fragment is fabricated-
static. **Next action:** read verticals from the workspace profile or drop the fragment.

### F6 — MED — Sidebar/UserMenu Admin affordance gated on the WRONG role axis
`src/components/Sidebar.tsx:64-65` (X-agent CODE-4a file, but the gate contradicts my slice's
page): the Admin button shows for `workspace_role in (owner, admin)`, while `/admin/page.tsx:14`
gates on `requirePlatformAdmin` (`profiles.is_platform_admin`, mig 075). A workspace owner who
is not platform admin sees a button that 403s/redirects. Security is intact (server gate holds);
affordance-bound-to-nothing for non-platform-admin owners. **Next action (CODE-4a/X-agent):**
gate the button on the platform-admin flag already carried in bootstrap/profile reads.

### F7 — LOW — theme.css duplicate/conflicting token definitions
`src/app/theme.css`: `--destructive-quiet` defined **twice in :root** (:271 `#9A3412`, :408 same
value — harmless duplicate with 4 stacked comment blocks :264-270) and **twice in dark theme
with different values** (:510 `#F0855A` "AA contrast variant", :531 `#E0774A`) — last wins, so
the deliberate AA-contrast value at :510 is dead. Also the editorial alias set (`--bg`,
`--surface`, `--text`, `--text-2`, `--border-sub`, `--accent`) has **no dark overrides**, so
components consuming editorial tokens render light values under `[data-theme="dark"]` (partially
acknowledged "light-first" for band tokens at :375, but the base aliases are not called out).
**Next action:** delete one dark `--destructive-quiet` (keep the AA one), dedupe :root, decide
dark posture for editorial aliases.

### F8 — LOW — Dead code inventory (types / data / hooks)
All confirmed by zero-consumer grep across `fsi-app/`:
- `src/types/community.ts` (167 lines) — **entire file dead**; only reference is a comment in
  `api/auth/linkedin/callback/route.ts:203`. Describes the RETIRED forum layer (forum_sections/
  forum_threads/case_studies/notifications — the DB-4 empty-table set). The live community code
  uses `components/community/types.ts` instead.
- `src/types/intelligence.ts:143-233` — `resourceToIntelligenceItem` + `mapResourceType` +
  `mapPriorityToSeverity` and `:264-273` `LegacySourceMapping` — migration-era, unconsumed.
- `src/types/resource.ts:263-275` — `TabId` still enumerates the retired 7-domain nav
  (`technology|regional|geopolitical|sources|facilities`); consumers are `navigationStore` and
  `components/TabBar.tsx`, and **TabBar itself is mounted nowhere** (grep: no import/JSX use) —
  X-agent CODE-4a: dead component candidate.
- `src/data/seed-scoring-data.ts` (224) — unimported (already named in the June audit; persists).
- `src/data/seed-clusters.ts` (85) + the `CLUSTERS` barrel re-export (`data/index.ts:81`) — the
  export chain terminates unconsumed.
- `src/data/seed-remap.json` (975 lines) — zero references; its content was pre-merged into
  seed-resources.json per `seed-resources.ts:5-6`.
- `src/data/source-mapping.ts` (189) — zero code consumers (docs-only references), yet
  `fsi-app/.claude/CLAUDE.md` still lists it under "Key Files" — doc drift.
- `src/hooks/useScrollToResource.ts` (23) — **only** referenced by a comment in
  `navigationStore.ts:66`; the hook is imported nowhere. The comment claims behavior
  ("triggers auto-scroll via useScrollToResource") that cannot occur — misleading dead code.
- `public/` still ships Next.js boilerplate svgs (next/vercel/file/globe/window) — trivial.
**Next action:** one dead-code sweep PR; update the CLAUDE.md Key Files list in the same change.

### F9 — LOW — Test infrastructure still absent; one test file is non-executable by design
`src/__tests__/staged-updates-approval.test.ts:10-31` documents that no test runner is installed;
verified against `package.json` (no vitest/jest, no `test` script — only dev/build/lint/
typecheck/analyze/perf:bundles). The file fails at module resolution intentionally.
`leakage-fix-classifier.test.mjs` runs only via manual `node --test`; nothing in CI invokes it
(X-agent CODE-2 to confirm against `.github/`). **Next action:** either land the vitest setup the
header specifies or move both under a runner CI job; a "test" that can't run protects nothing.

### F10 — LOW — Stale/misc page-level notes
- `src/app/operations/page.tsx:88` — masthead jurisdiction count falls back `|| 5` (hardcoded
  literal) when both the RPC and coverage rows are empty: prints "5 jurisdictions in scope" with
  zero backing data. Same class as F5, one token wide.
- `src/app/market/[slug]/page.tsx:10-16` — header comment says band/severity helpers are
  "re-implemented here … when migration 102 populates signal_band the regex fallback retires";
  migration 102 landed 2026-05-24, so the retirement note is stale and the duplicated helpers
  persist (reuse-before-construction debt).
- `src/app/research/page.tsx:95-96` — `owner: null, partnerFlagged: false` placeholders shipped
  to the UI shape "pending the owner-attribution work" (honest empties, but tracked debt).
- `src/app/signup/page.tsx:12-14` — comment claims LinkedIn import is a "Coming soon stub", but
  `/api/auth/linkedin/{start,callback}` routes exist and `onboarding/page.tsx:30` live-gates on
  `LINKEDIN_CLIENT_ID`. Comment drift; flow state = deploy-config-gated, not stub (focus area d:
  onboarding wizard, workspace bounce, invitation landing all wired; e-mail invitation
  send-side is API territory — X-agent CODE-3).
- `src/data/source-mapping.ts:92` — `NREL … nrel.gov` retained; NREL→NLR rename (nlr.gov) makes
  this legacy-correct only as a historical mapping (file is dead per F8 anyway).
- `robots.txt` blocks `/dashboard/` — a route that does not exist (phantom path; harmless).
  Policy consistency otherwise holds: `/api/`, `/settings/`, `/admin/` blocked, AI crawlers
  fully disallowed, and the proxy auth-wall covers everything else (only /login, /signup,
  /privacy-after-F2 would be crawlable).
- `src/app/error.tsx:32` — error classification by `error.message.includes("fetch")` is a
  string-sniff; digest ignored. Cosmetic only.
- Seed data (`seed-resources.json`, 119 rows; AUDIT_DATE 2026-03-01) is the acknowledged anon/
  failure fallback via `supabase-server.ts` — content freshness is a known non-goal, no per-fact
  audit performed (deviation D3). UTF-8 integrity verified (0 mojibake sequences).

### Clean bills (checked, no finding)
- `src/proxy.ts` — matcher correctly excludes `.well-known/workflow/`; API self-auth pass-through
  matches documented policy; session refresh pattern is the canonical @supabase/ssr shape.
- All five surface index pages: counts read the migration-148 single-SoT RPCs with fail-soft,
  never mock literals (verified in code); market/operations item lists fail CLOSED to
  category-routed RPC results; error destructures follow the post-mortem rule (every page-level
  `.select()` I read either destructures `error` or is inside a documented soft-fail try —
  the swallowed catches at regulations/market/operations/research `[slug]` are all
  intentional degrade paths with honest empty states, not silent data loss).
- `/admin/page.tsx` — platform-admin gate first line of effect; MTD spend soft-fail documented;
  slim selects justified inline.
- Community pages — every column read verified to exist in live schema (community_groups incl.
  `vertical`/`owner_user_id`, community_posts incl. `promoted_at`/`signed_off_at`,
  community_post_signoff_requests, published_price_statistics, state_cost_facts,
  workspace_item_overrides incl. `notes`, profiles incl. `verifier_status`/`is_platform_admin`).
  RLS-reliant privacy posture on `/community/[slug]` has a belt-and-braces member check (:180).
- `globals.css` — responsive utility system coherent; reduced-motion honored; no orphan classes
  spot-checked against component usage (cl-ops-*, cl-stat-grid, cl-two-col all consumed).
- `layout.tsx` — theme pre-hydration script matches ThemeInitializer contract; font weights
  documented against the audit that chose them.
- `types/source.ts` — the promotion-ladder/trust framework here is the **frontend type mirror**
  of migration 004; `SOURCE_TIER_DEFINITIONS`/`PROMOTION_CRITERIA`/`DEMOTION_TRIGGERS` are
  consumed (trust.ts, SourceHealthDashboard) so not dead. Doctrine check: tier semantics are
  content-authority-structural ("tiers describe what kind of entity maintains the source"),
  consistent with the locked Decision-1 yardstick. `Source.base_tier`/`effective_tier` split
  (:536-541) matches the sealed-corroboration memory (effective_tier customer-facing via
  COALESCE, base_tier for grounding eligibility). One nit: `SourceStatus` includes
  `stale|inaccessible` which have zero live rows (active 750 / provisional 433 / suspended 14) —
  latent vocab, not drift. `TrustMetrics.accessibility_rate` comment (:94) is self-correcting
  prose worth a cleanup. `DOMAIN_DEFINITIONS` (7 domains) remains live as the item→surface
  ROUTING key (community/page.tsx itemHref, domains.ts, migration 101) — this is the retained
  internal axis, not a resurrected 7-domain customer nav; no PI-1 violation on any page read.

---

## 3. X-agent handoffs
- **CODE-3**: does `fetchIntelligenceItem`/`fetchIntelligenceItemSections` enforce
  `provenance_status='verified'`? (F1 blast radius); email-invitation send path state.
- **CODE-4a**: Sidebar/UserMenu admin-gate axis (F6); TabBar.tsx dead-component confirmation;
  OnboardingWizard LinkedIn card state vs `linkedinEnabled` prop.
- **CODE-2**: confirm no CI job runs `src/__tests__` (F9).
- **DB-1**: 6 legacy-severity rows + 13 NULL-severity rows (F4); 106 active-quarantined items
  (context for F1).

## 4. Manifest check-off
**Manifest check-off: 51/51 files read (list reconciled against `_manifest_files.tsv` slice).**
48 code files read line-by-line in full. 3 data-kind files handled per manifest deviation 2:
`seed-resources.json` (structure + row-count 119 + encoding verified), `seed-remap.json`
(structure verified, consumer sweep → dead, F8), `favicon.ico` (binary, inventoried).

## 5. Tool-call count
**85 tool calls** (Read 47 · Grep 18 · PowerShell 13 · Supabase execute_sql 3 (SELECT-only) ·
ToolSearch 1 · plus this register Write = 86 total including output).

## 6. Deviation log
- **D1**: Slice arithmetic — prompt said "~51 files / ~17K lines"; exact reconciliation = 51
  files / 13,796 tsv lines (JSON data files included). No files added or dropped; no unclaimed
  src files found beyond the enumerated set (proxy.ts, data/, hooks/, __tests__ were treated as
  in-slice per the "not claimed by CODE-1/2/3/4a" clause).
- **D2**: Read 5 out-of-slice CODE-4a files in excerpt (`AppShell.tsx`, `Sidebar.tsx`,
  `UserMenuDropdown.tsx` partial, grep-level touches of community chrome) — required to
  enumerate the nav model per the dispatch's focus area (a). Findings on those files are
  routed as X-agent handoffs, not claimed as slice coverage.
- **D3**: Seed-data CONTENT (119 regulatory summaries in seed-resources.json) was not
  fact-audited line-by-line — it is the acknowledged legacy fallback dataset (AUDIT_DATE
  2026-03-01); auditing its regulatory accuracy is corpus work, not code audit. Structure,
  encoding, consumers, and enrichment merge logic were audited.
- **D4**: Skill-inventory pass (fsi-app standing rule): read-only audit dispatch; no governed
  writes performed, no platform skills loaded. Considered: caros-ledge-platform-intent
  (five-surface/nav judgments — covered by dispatch brief + doctrine file),
  source-credibility-model (types/source.ts tier reading — covered by locked memory decisions).
  Loading was skipped to keep the audit's read budget on the slice itself.
