# redesign/full-migration — Status

Live status of the editorial migration on `redesign/full-migration`.
Updated as commits land. Source of truth for "what's done, what's next."

**Branch:** `redesign/full-migration` → PR #5 (draft)
**Production deploy target:** `master` (auto-deploy on, per Vercel settings)
**Migration files:** `008_platform_admin_profiles.sql`, `008_seed_platform_admins.sql` — committed, NOT yet run. Apply order documented in commit `50f9346` and `c67dd29`.

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
| _next_ | `src/components/shell/` consolidation (PageMasthead + StatStrip moved here, SectionHeader added) + this STATUS.md file. |

---

## Next surface

**6b — home `<ThisWeek>` two-column + `<Replaced>` 5-up.** Removes [WeeklyBriefing](src/components/home/WeeklyBriefing.tsx), [WhatChanged](src/components/home/WhatChanged.tsx), [TopUrgency](src/components/home/TopUrgency.tsx), [DueThisQuarter](src/components/home/DueThisQuarter.tsx), [Supersessions](src/components/home/Supersessions.tsx) from the home render. Files stay on disk with one-line "unmounted in PR #5" comment. Per [dashboard-v3.html](../../Downloads/Caro_s%20Ledge%20Design%20System/design_handoff_2026-04/preview/dashboard-v3.html).

**Then commits 7+ — per-screen body rebuilds**, one commit per surface:

- 7: Regulations body (4-column kanban grid per `regulations.html`)
- 8: Regulation detail (10-section brief structure per `regulation-detail.html`)
- 9: Market intel + Operations + Research bodies
- 10: Map (light pass)
- 11: Profile (8 tabs) — depends on 40-sector migration (12)
- 12: 40-sector taxonomy migration (transactional dry-run, orphan list to PR for review)
- 13: Settings (5 tabs)
- 14: Admin (6 tabs, gated by `is_platform_admin`)
- 15: Community (visual-only — sidebar swap, ⌘K stub, region tabs client-filter, modal markup, no real wiring)
- 16: Cleanup — archive `colors_and_type.css`, sweep stale orange-era classes + dead components, lift freeze, file follow-up tickets

---

## Rules in force

**Layout, type, color, spacing.** Match preview exactly. No compromise.
**Data.** Use what's available. Placeholder + `// TODO` if not. Layout correctness is the goal of this PR; real data wiring for new shapes is separate follow-up PRs.
**Behavior.** Visual states only on new flows. No new interactions wired in this PR.

**Tokens.** Editorial set lives in [theme.css](src/app/theme.css) — additive. Legacy orange/blue tokens stay until a per-screen rebuild migrates the calling component. `--accent` is navy `#1E3A8A`.

**Stat strips.** Option 2 rule (eyebrow + numeral both colored, one rail+tint per strip on the primary tile). Lifecycle mapping in `DESIGN_SYSTEM.md`. Use [StatStrip](src/components/shell/StatStrip.tsx) for everything except the home dashboard hero (which uses [DashboardHero](src/components/home/DashboardHero.tsx) for its 1.4fr Critical-wide variant).

**Section headers.** Use [SectionHeader](src/components/shell/SectionHeader.tsx). If you find inline `.sh` markup or `<h2>` styled inline with Anton + 2px rule, replace with the component.

**Shadows.** Match preview's `var(--shadow)` for now. The broader no-shadow flatten is a separate pass after this migration.

**Oxblood.** Reserved for editorial moments only — one per screen max. Stat tiles use the standard priority palette, not oxblood. Masthead gradient is navy→red shell chrome, not part of the oxblood budget.

**Migrations.** No automatic ordering — each migration is applied via its own `apply-NNN.mjs`. Append `008_*` and `009_*`; existing 006/007 collisions are aesthetic debt, do not touch. **Migration COMMIT runs after code merge, never before.** Dry-run via `BEGIN`/orphan-count/`ROLLBACK` first, orphan list to PR for review by user, then COMMIT.

---

## Open questions / blockers

- **BLOCKER for merge:** Vercel **Deployment Protection** state on Production. If Vercel Authentication or Password Protection is on for Production, merging PR #5 won't make the redesign visible to public users. User to confirm in Vercel → Settings → Deployment Protection before merge. (Production branch + auto-deploy already confirmed: master, on.)
- **40-sector migration orphan list.** Will surface as a `.sql` artifact in the PR after the dry-run runs. User reviews orphans before any auto-mapping.
- **Decide whether to delete unmounted home components.** Files staying on disk per user direction; review in cleanup commit at end of PR.

---

## Out of scope (real follow-up PRs)

- Bulk-export builder modal
- Timeline view on Regulations
- Bulk-select + sticky action bar
- Disputes / priority override / archive flow on Regulation detail
- Real timeline math for DashboardHero "N inside 14 days" helper (currently hardcoded placeholder)
- Hand-curated copy for ThisWeek section (currently placeholder where data layer can't produce dynamically)
- Community behaviors: ⌘K search wiring, promote-to-public modal logic, onboarding state machine persistence
