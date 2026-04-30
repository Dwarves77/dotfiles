# redesign/full-migration — Status

Live status of the editorial migration on `redesign/full-migration`.
Updated as commits land. Source of truth for "what's done, what's next."

**Branch:** `redesign/full-migration` → PR #5 (draft)
**Production deploy target:** `master` (auto-deploy on, per Vercel settings)
**Migration application policy:** two tracks. **Schema migrations (DDL on runtime tables)** apply via Supabase CLI BEFORE committing the dependent code, so preview deployments don't 500-error on missing columns; document the apply timestamp in the commit body. **Data migrations (seeds, backfills, content migration)** commit the migration file alongside the consumer code and run AFTER merge.

**Migration 008 status (data migration):** `008_platform_admin_profiles.sql` and `008_seed_platform_admins.sql` were both committed under the "data migration runs after merge" rule (commits `50f9346` + `c67dd29`). Their applied-status against the live Supabase DB has not been re-verified in this audit pass. Run `npx supabase migration list --linked` to confirm; if both show `applied`, this status note can be deleted in a follow-up commit. (Cleanup pass 2026-04-30 was run from a sandbox without node access, so the verification step deferred.)

---

## Session-resume recipe

A cold session should:

1. Read this file first.
2. Find the lowest-numbered "pending" row in the migration table below.
3. Open the matching preview HTML at `C:\Users\jason\Downloads\Caro_s Ledge Design System\design_handoff_2026-04\preview\<file>.html` and the corresponding `src/app/<route>/page.tsx`.
4. Apply the working rules in the "Migration rules" section.
5. Commit as `feat(<surface>): migrate to <preview>.html` with a body listing any placeholder TODOs introduced.
6. Advance the table row to "shipped: <commit>" in this file as part of the same commit.
7. Stop and ask if you hit anything in "Open questions / blockers" or any pattern not in the design folder.

---

## Committed surfaces

| Commit | What |
|---|---|
| `84021a8` | Foundation: editorial token block in `theme.css` (additive). 3px navy→red gradient bar mounted above `<main>` in [AppShell.tsx](src/components/AppShell.tsx). [StatStrip.tsx](src/components/shell/StatStrip.tsx) primitive built. |
| `50f9346` | [008_platform_admin_profiles.sql](supabase/migrations/008_platform_admin_profiles.sql) + [apply-008.mjs](supabase/seed/apply-008.mjs). NOT run. |
| `8c08eec` | [PageMasthead.tsx](src/components/shell/PageMasthead.tsx) shared component. Mounted per-tab in `Dashboard.tsx` via `mastheadFor()`. |
| `3866b75` | [Dashboard.tsx](src/components/Dashboard.tsx) — Regulations urgency strip + `MergedSection` (Market intel / Research / Operations) all consume StatStrip. Operations stat strip is new wiring. |
| `c67dd29` | [008_seed_platform_admins.sql](supabase/migrations/008_seed_platform_admins.sql) + [apply-008-seed.mjs](supabase/seed/apply-008-seed.mjs) for `jasonlosh@hotmail.com`. NOT run. |
| `367fab4` | [DashboardHero.tsx](src/components/home/DashboardHero.tsx) — 1.4fr/1fr/1fr/1fr Critical-wide hero. Mounted as `belowSlot` of `PageMasthead` on home tab. |
| `fc6cd1a` | Token retint: `--high-bg #FFFBEB → #FFF7ED`, `--high-bd #FDE68A → #FED7AA`. Fixes amber/yellow visual mush in priority-grouped column layouts. DashboardHero helper copy hardcoded with TODO. |
| `2d2005b` | Shell primitive consolidation: PageMasthead + StatStrip + SectionHeader live under `src/components/shell/`. STATUS.md added. |

---

## Migration order (revised)

Top-to-bottom. No skipping. One commit per surface. After each surface, run the build and confirm zero errors before moving on.

| # | Surface | Route | Preview | Status |
|---|---|---|---|---|
| 1 | **Operations** | `/operations` | `operations.html` | next up |
| 2 | Settings | `/settings` | `settings.html` | pending |
| 3 | Profile | `/profile` | `profile.html` | pending — **see dependency below** |
| 4 | Market Intel | `/market` | `market-intel.html` | pending |
| 5 | Research | `/research` | `research.html` | pending |
| 6 | Admin | `/admin` | `admin.html` | pending |
| 7 | Regulation detail | `/regulations/[slug]` | `regulation-detail.html` | pending |

---

## Per-surface scope

### 1 — Operations
Full migration to `operations.html`. Two tabs: **By Jurisdiction** and **Facility Data**. Watch/High/Moderate/Low stat strip with Option-2 colored eyebrow + numeral; Critical tile gets the rail+tint. Right-rail side cards (Coverage / Owners / Methodology / Update cadence). No deferrals.

### 2 — Settings
Full migration to `settings.html`. Five sub-tabs in this exact order and labelling: **General · Dashboard · Exports · Data & supersessions · Archive**. Note "Data & supersessions" — not "Data". Existing toggle, segmented-control, dash-cards-with-grab-handle, supersession-row, and archive-row patterns are all in the preview. No deferrals.

### 3 — Profile
Full migration to `profile.html`. Eight tabs (preview labels): **Personal · Organization · Members & roles · Billing & plan · Sector profile · Jurisdictions · Verifier badge · Activity**. Maps to user-spec labels (Personal · Organization · Members · Billing · Sectors · Jurisdictions · Verifier credentials · Activity).

Net-new flow on top of preview: **"Add member" side panel form** on Members & roles tab — slides from right, full-width on mobile per the responsive contract. Org-admin scope. Wires to nothing in this PR (visual-only). Preview has only an `+ Invite member` button; the side panel is the new component.

**Dependency to resolve before migration starts:** the Sector profile tab uses a 40-sector multi-select. The 40-sector taxonomy migration (item 12 in the prior plan) is a backend data shape change that the multi-select reads from. Three options on the table:
- (a) run the 40-sector taxonomy migration during this PR before Profile;
- (b) ship Profile with a placeholder selector and defer the wiring;
- (c) sequence the taxonomy migration immediately after this PR.

The migration agent must confirm with user before starting Profile. The preview hardcodes the 40 sectors in a JS array — the production component reads from the workspace config.

### 4 — Market Intel
Full migration to `market-intel.html`. Two tabs: **Technology Readiness** (the existing `TechnologyTracker` component, no new component needed) and **Price Signals & Trade**. Watch/Elevated/Stable/Informational stat strip; Watch tile is the in-flight primary tile (rail+tint). Right-rail "Watch this week" alert card uses high-bg + high-bd.

### 5 — Research
Full migration to `research.html`. Two tabs: **Pipeline** and **Source coverage**. Draft/Active review/Published/Archived stat strip; Active review is the in-flight primary tile (rail+tint, high palette).

Source coverage uses the **same expand-card pattern as Pipeline** (`.src` accordion in the preview). It is populated from two pools, both rendered with the same component:
- regulator feeds (EUR-Lex, IMO MEPC, UK Legislation, US Federal Register + CARB, partner intake Slack);
- academic partner organizations (MIT, Tyndall, Chalmers, ICCT, Smart Freight Centre, others as the design folder defines).

Featured-row variant exists at the top of the partner section. The preview ships only the regulator-feed half — academic partners are net-new to this surface. Coverage matrix table at top of Source coverage tab is in scope.

### 6 — Admin
Full migration to `admin.html`. Six tabs: **Organizations · API & integrations · Source registry · Staged updates · Regulatory scan · Audit log**. The preview opens with a navy info banner stating "Caro's Ledge admin view — per-org settings (members, billing) live on each org owner's Profile" — that line is architectural, ship as-is.

Architectural rule: per-org settings (members, billing) live on Profile, not Admin. The "View all members" drill-down from an org row in the Organizations table is a navigation, not a form. The platform-admin equivalent of "add user" (creating new orgs or super-admin users) is **deferred to a follow-up PR**.

### 7 — Regulation detail
**Layout-and-tokens-only** migration to `regulation-detail.html`. Ship the brief structure as currently designed in the preview.

Preview as-currently-designed has 7 panels (Summary, Exposure, Penalty calculator, Timeline, Full text, Sources, Team notes). User scope says "5 sections of the brief structure as currently designed" with "the additional 5 brief sections to bring the structure to 10" deferred. **Confirm count before migration starts** — either ship all 7 visible panels per the preview, or ship only the 5 user means and treat Sources + Team notes as deferred.

Explicitly deferred to follow-up PRs:
- sticky right-rail TOC
- Verification badge component
- Cross-sector headline strip
- Disputes panel
- Priority Override control
- Archive flow
- Share/Export split-button menus
- the additional 5 brief sections to bring the structure to 10

**Do not invent these patterns during this PR.**

---

## Architectural decisions in force

1. **Token-source rule.** `shell.css` tokens for chrome (sidebar, masthead, AI bar, tabs, accent strip, navy gradient hairline). `colors_and_type.css` tokens for content (cards, badges, gradient bars, type). Do not mix.
2. **Operating accent is navy `#1E3A8A`** — defined as `--accent` in `shell.css`. The orange tokens in `colors_and_type.css` (`--color-primary #E8610A`, `--color-text-accent`, `--color-bg-ai-strip #FFF7F0`, `--color-border-ai #FBD5B5`) are **legacy** and will be swept in the cleanup commit at the end of the PR. **Do not introduce new uses of these orange tokens during the migration.**
3. **Ask AI bar canonical state.** Lavender-blue accent strip (`--accent-strip #EEF1F9`) with navy "Ask" button (`--accent`). If you encounter the orange variant during migration, replace it with the canonical navy variant.
4. **Anton uppercase usage** is reserved for the masthead title only. In-body section headers are dark sans, sentence-case. **Do not use Anton uppercase outside the masthead.** *(See "Open questions" — preview shells use Anton for `.card-head h3` and `.brief-section h3` with `text-transform: uppercase`. Confirm resolution before settings/profile/admin/regulation-detail migrations.)*
5. **Priority and topic colors are independent axes.** Priority (critical/high/moderate/low) for urgency only. Topic (emissions/fuels/transport/reporting/packaging/corridors/research) for subject matter only. Topic colors do not appear on any of the seven surface chromes — they live deeper in card content where applicable.
6. **Add-user architecture.** Org-admin add-member lives on Profile → Members. Platform-admin add-user (super-admin or org-creation) is deferred to follow-up PR.
7. **Source coverage academic partners.** Rows on Research → Source coverage, populated from the source registry data model, use the existing expand-card pattern from the Pipeline tab.

---

## Responsive contract (frozen)

System-level CSS in `shell.css`. Decisions below are mechanical and shipped on the basis that per-surface migration will surface any rendering issues at 390px and 768px. **Do not reopen these. If a rendering issue surfaces, patch in `shell.css`, not per-page.**

1. Stat strips collapse to 2×2 grid at ≤640px.
2. Two-column layout with right rail stacks vertically at ≤960px; rail goes static and full-width.
3. Tab strips become horizontal-scroll with hidden scrollbar at ≤767px.
4. Masthead title drops to 26px with line-height 1.05 on mobile.
5. AI prompt-bar chips wrap by default; input row stacks at ≤767px.
6. Side panels go full-width at ≤767px via width override.
7. Tables tagged `.table-collapse` reflow to stacked cards on mobile with field labels auto-injected from `<thead>` by `shell.js` (admin × 5, profile × 2).
8. Expand-card pills wrap below the title block when `.src` summary collapses to single-column at ≤767px.
9. Sidebar exposes hamburger trigger with scrim on mobile (wired in `shell.js`, present in all 11 pages). Mid-range sidebar collapse at 768–1100px (auto-collapses to 56px icons; body-wrap and masthead padding tighten).

Verifier could not run during the responsive pass due to upstream error — the contract was shipped on the basis listed above.

---

## Migration rules (working rules)

1. **One commit per surface.**
2. **Top-to-bottom through the seven in the revised order.** No skipping.
3. **Before each surface, restate which preview HTML, tokens, and components will be used.** Be specific.
4. **After each surface, run the build and confirm no errors before moving on.**
5. **If you encounter a pattern that needs a new component or token not in the design folder, stop and ask. Do not invent.**
6. **Use `shell.css` tokens only for chrome. Use `colors_and_type.css` tokens for content. Do not mix.**
7. **Do not introduce new uses of legacy orange tokens.** Where you find them in code, leave them — the cleanup commit at the end of the PR will sweep them.
8. **Do not reopen responsive decisions.** Patch issues in `shell.css`, not per-page.
9. **Deprecation means deletion, not annotation.** When work supersedes an artifact (a table, a file, a code path, a script, a config entry), the artifact is deleted in the same PR or in an explicit cleanup commit before the next phase begins. Comments saying "deprecated, scheduled for removal" are temporary scaffolding only, never the final state. Pre-flight check between phases: sweep for anything deprecated by that phase's work and delete it.
10. **API-first source retrieval.** When a source has a free public API, the registry record uses `access_method='api'` and points at the canonical API endpoint, not a docs page or the human-facing portal. Browserless is the fallback for sources without APIs, not the default. New sources are evaluated for an API equivalent at intake. Phase B.0 completed this audit and migration; future seed work follows the same convention.
11. **Manual operator actions bypass pause and cooldown.** The pause flags (`sources.processing_paused`, `system_state.global_processing_paused`) gate automated processing only. Admin paths (`fetch-now`, `regenerate-brief`, direct admin scans) bypass intentionally — they're explicit operator decisions. Don't add pause-checks to manual paths.
12. **Migration application — two tracks.** **Schema migrations (DDL on runtime tables)** apply via Supabase CLI BEFORE committing the dependent code, so preview deployments don't 500-error on missing columns. Document the apply timestamp in the commit body (e.g. `Applied: 2026-04-29T18:42Z via supabase db query --linked`). **Data migrations (seeds, backfills, content migration)** commit the migration file alongside the consumer code; run AFTER merge. The earlier rule "migration commit runs after code merge, never before" applies to data migrations only — schema migrations apply first under the runtime constraint that columns must exist before code references them.

Plus from the prior plan, all still in force:

- **Layout, type, color, spacing.** Match preview exactly. No compromise.
- **Data.** Use what's available. Placeholder + `// TODO` if not. Layout correctness is the goal of this PR; real data wiring for new shapes is separate follow-up PRs.
- **Behavior.** Visual states only on new flows. No new interactions wired in this PR.
- **Stat strips.** Option 2 rule (eyebrow + numeral both colored, one rail+tint per strip on the primary in-flight tile). Lifecycle mapping: Operations/Regulations/Dashboard → Critical / High / Moderate / Low; Market Intel → Watch / Elevated / Stable / Informational; Research → Draft / Active review / Published / Archived; Regulation detail → Effective · Penalty rate · Exposure · Lanes affected. Use [StatStrip](src/components/shell/StatStrip.tsx) for everything except the home dashboard hero (which uses [DashboardHero](src/components/home/DashboardHero.tsx) for its 1.4fr Critical-wide variant).
- **Section headers.** Use [SectionHeader](src/components/shell/SectionHeader.tsx). If you find inline `.sh` markup or `<h2>` styled inline with Anton + 2px rule, replace with the component.
- **Shadows.** Match preview's `var(--shadow)` for now. The broader no-shadow flatten is a separate pass after this migration.
- **Oxblood.** Reserved for editorial moments only — one per screen max. Stat tiles use the standard priority palette, not oxblood. Masthead gradient is navy→red shell chrome, not part of the oxblood budget.
- **Migrations.** Two-track policy per rule 12 above. Schema migrations apply first via Supabase CLI; data migrations commit alongside consumer code and run after merge. Apply scripts (`apply-NNN.mjs`) are optional — early data migrations (008, 009) use them; later schema migrations (013, 015–022) use direct `npx supabase db query --linked -f` followed by `migration repair --status applied N`. Existing 006/007 numbering collisions are aesthetic debt — do not touch. Dry-run via `BEGIN`/orphan-count/`ROLLBACK` first for any data migration; orphan list to PR for review by user; then commit.

---

## Open questions / blockers

1. **Vercel Deployment Protection — RESOLVED.** Verified 2026-04-29: all protections disabled. Production deployments are publicly accessible. Worker secrets and scheduled jobs operate without bypass tokens. No merge blocker. (Vercel Authentication off, Password Protection off, OPTIONS Allowlist disabled, Trusted IPs disabled. Production branch + auto-deploy: master, on.)
2. **Profile dependency on 40-sector taxonomy migration.** Confirm before Profile migration starts: (a) run 40-sector during this PR before Profile, (b) placeholder selector + defer wiring, or (c) run 40-sector immediately after this PR. See "Per-surface scope · Profile."
3. **Anton-uppercase rule conflicts with preview shells.** The user-stated rule (architectural decision #4) prohibits Anton uppercase outside masthead. The shipped previews use Anton uppercase on `.card-head h3` (settings, profile, admin) and `.brief-section h3` (regulation-detail). Confirm before settings/profile/admin/regulation-detail migrations whether to (a) follow the preview verbatim and amend the rule, or (b) follow the rule and substitute dark-sans sentence-case during migration.
4. **Regulation detail count discrepancy.** RESOLVED. Superseded by the 14-section regulatory_fact_document format codified in commit `2fecb79`. Original 5-section design and 10-section interim are both archived. Current contract: 14 sections per regulatory_fact_document, 8 each for technology/operations/market_signal_brief, 6 for research_summary. The regulation-detail surface migration will render against the current contract, not the preview's 7-panel layout.
5. **40-sector migration orphan list.** Will surface as a `.sql` artifact in the PR after the dry-run runs. User reviews orphans before any auto-mapping.

---

## Deferred / out of scope for this PR

Carried forward from the older plan and the per-surface scope decisions above. Each item below is a real follow-up PR after this branch merges.

**Older-plan items deliberately skipped:**
- `6b` — Home `<ThisWeek>` two-column + `<Replaced>` 5-up. Skipped per user direction.
- `7` — Regulations 4-column kanban body. Skipped per user direction.
- `10` — Map light pass. Post-migration follow-up.
- `12` — 40-sector taxonomy migration. Sequencing decision pending (see open question #2).
- `15` — Community visual-only pass. Post-migration follow-up.
- `16` — Cleanup. Archive `colors_and_type.css` legacy orange tokens, sweep stale orange-era classes, lift freeze, file follow-up tickets. **This is the commit that removes legacy orange tokens.** Post-migration follow-up.

**Surface-level deferrals:**
- Bulk-export builder modal. Real follow-up PR.
- Timeline view on Regulations. Real follow-up PR.
- Bulk-select + sticky action bar on Regulations. Real follow-up PR.
- Regulation detail: sticky right-rail TOC, Verification badge, Cross-sector headline strip, Disputes panel, Priority Override, Archive flow, Share/Export split-button menus, additional 5 brief sections (to bring structure to 10).
- Admin: platform-admin "add user" / org-creation flow.

**Data / copy:**
- Real timeline math for `DashboardHero` "N inside 14 days" helper (currently hardcoded placeholder).
- Hand-curated copy for `ThisWeek` section (placeholder where data layer can't produce dynamically).

**Community behaviors:**
- ⌘K search wiring.
- Promote-to-public modal logic.
- Onboarding state machine persistence.
