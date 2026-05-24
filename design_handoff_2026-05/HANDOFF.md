# Caro's Ledge — Claude Code Handoff

**Date:** May 24, 2026
**Prepared by:** Operator + Claude (chat session) for Claude Code session continuation

---

## 1. Catch-up since your last session

Your most recent memory is the May 22-23 commit set. This document corrects what's changed and gives you the next move.

### What's now true that your notes don't reflect

- **Migration 101 is APPLIED to production.** V1 reconciliation completed cleanly: d=1: 588→395, d=2: 10→24, d=3: 10→78, d=4: 16→83, d=5: 8→0, d=6: 4→0, d=7: 10→66. PostgREST cache reloaded. The "Migration 101 unapplied" item in your status is stale.
- **`feat/leakage-fix-b4` is merged on master** (4ca7fbd). Classifier emits `domain` alongside `item_type`; 3 hardcoded insert sites unhardcoded; defense-in-depth guard at applyUpdate.new_item. Synthetic test 19/19 pass.
- **8-surface spec audit synthesis lives at 8b9716d** as docs-only audit reports. Operator has reviewed.

### What happened today (in chat session with operator)

- **Design rebuild mockups produced** for all 8 surfaces. Pixel-fidelity HTML/CSS at `/mnt/user-data/uploads/` on the operator's environment:
  - regulations.html, regulations-detail.html, research.html, market-intel.html, operations.html, community.html, map.html, admin.html
  - tokens.css (mirrors fsi-app/src/app/theme.css + globals.css)
  - README.md (per-surface change spec)
- **Cross-surface consistency audit done.** 21 issues found; operator decisions captured below.

### Operator decisions made today (binding on rebuild)

1. **Dashboard stays as-is.** Not in rebuild scope. The current "what's new + what's important + flagged items" framing is good. Dashboard needs to be added to caros-ledge-platform-intent skill as a canonical surface (operator-stated correction required, see section 5 of this doc).
2. **Research repositioning RESOLVED.** `/research` is the customer-facing horizon-scan destination. Editorial draft-staging moves to `/admin/research-pipeline`.
3. **NO vendor directory.** Remove from Community spec entirely. The platform-intent skill needs operator-stated correction to drop vendor directory mentions.
4. **LinkedIn import is in-flight feature**, not stub. Treat as real feature being built. Update platform-intent skill accordingly.
5. **Editorial pickup pipeline status** in platform-intent skill claims "shipped per Workstream B" but audit confirms absent/stubbed. Skill needs correction to reflect reality.

### What's still open from your earlier notes

- **Skills audit cleanup.** Only `sprint-followups-discipline` is stale. Four named rules (Dispatch-artifact commit-summary, Inventory-artifact emission, ADR cross-reference, Inventory consistency) reference deleted engine machinery and need pruning. Other skills are CLEAN.
- **Dead-code triage.** ~80 items across Sections A-G of your earlier audit. Operator hasn't dispositioned yet. Not in critical path for design rebuild.
- **Ingest restart sequencing** queued. Leakage fix B4 was the prerequisite; now merged. Restart plan at `docs/plans/ingest-restart-sequencing-2026-05-22.md` is ready to execute after the design rebuild stabilizes.

---

## 2. Design rebuild plan

**Reference files** at `design_handoff_2026-05/` (this directory):
- 8 HTML mockups (one per surface)
- shared/tokens.css (token mirror)
- README.md (high-level intent + per-surface change spec)

These establish the visual target. Recreate inside fsi-app using existing Next.js + Tailwind + shadcn/ui patterns.

**Before recreating, apply the cross-surface consistency corrections in Section 3 below.** The mockups have internal inconsistencies that must be resolved BEFORE landing in code; retrofitting after means touching every surface twice.

**REC-OBS-G category routing wiring is the foundation** per platform-intent skill Section 5 item 1. Run REC-OBS-G as a standalone dispatch BEFORE any Sequence C surface rebuild. Without it, `/market` and `/operations` continue sharing the same unfiltered payload.

---

## 3. Cross-surface consistency corrections

21 fixes, operator-decided. Apply in order of severity.

### CRITICAL (spec violations / broken UX)

#### FIX 1. Severity vocabulary, per-surface (operator binding)

Different surfaces show different information types. Do NOT force one severity vocabulary everywhere. Operator's words: "some of these are different because they require different types of attentions."

| Surface | Mechanism | Labels |
|---|---|---|
| Regulations INDEX | 4 Kanban columns, timeframe-based | Immediate action / Action 6mo / Monitor 6-12mo / Awareness only |
| Regulations DETAIL | Single hero urgency pill | Immediate / Watch / Reference |
| Market Intel | 4 stat tiles + spec 5-label vocab in legend | Action required / Cost alert / Window closing / Competitive edge / Monitoring |
| Research | 4 stat tiles + research-relevance labels | Action required / Cost alert / Monitor / Background |
| Operations | 4 stat tiles + operational state labels | Critical / High / Moderate / Low |
| Map | 3-color jurisdiction aggregate | Critical jurisdictions / High / Moderate (rolled up from worst-item urgency in jurisdiction) |
| Community | No severity tiles; thread-level "urgent" flag only | n/a |

What MUST be consistent is the visual pattern (Fix 2), not the labels. Each label set is justified by its content type.

#### FIX 2. Stat tile + priority legend, Research is the master pattern

Apply Research's stat tile + priority legend visual pattern uniformly to Market Intel, Research, and Operations:

- **Priority legend ABOVE stat row:** 4 items, each with `.dot` color swatch + bold label + sub-text. Single-row layout.
- **Stat row:** 4 tiles, equal columns. Each tile:
  - Corner icon top-right (▲ ◎ ○ symbols)
  - 56px Anton display number
  - 11px uppercase label below number
  - 12px muted sub-text below label
  - Color class: `.active` (red/critical), `.high` (amber), `.mod` (yellow), `.low` (grey)

Regulations index has stat tiles but no priority legend, ADD the legend using the column-timeframe labels.

Map, Community, Admin do not use this pattern, different content shapes.

#### FIX 3. Map item count is wrong

Map masthead currently says "645 active items." Map is a view of Regulations only. Change to current regulations count (394 per Regulations index). New masthead meta: "May 24, 2026 · 394 active items · 82 jurisdictions · 13 with critical items · your verticals: Live events · Fine art".

#### FIX 4. Community is missing the AI bar

Per platform-intent skill, Intelligence Assistant is cross-cutting and appears on every customer-facing surface. Add the orange-tinted AI prompt bar to Community, between the tabs row and the "Activity by region" section heading. Same pattern as other surfaces:
- Orange tint (`--color-bg-ai-strip` background)
- Sparkle icon, input placeholder, orange Ask button
- 3-4 chips below with peer-info themes, e.g.: "Who's filing CBAM Article 30 Q1?" / "Q3 SAF surcharge pre-calls" / "PPWR RFID verification systems"

#### FIX 5. Admin link unreachable from any other page

Admin currently only appears in admin.html's own sidebar. Add Admin entry to the sidebar nav on all role-eligible pages, gated on `workspace_role IN ('platform_admin', 'org_owner')`. Place AFTER Community, separated by an additional divider. Hide entirely for users without the role.

---

### HIGH (visible UX inconsistency)

#### FIX 6. Section heading typography, pick one style

Current state: 5 different styles across surfaces. Standardize to ONE pattern matching the Market Intel / Research band-head:

- **Badge:** orange `--color-primary` background, white text, 13px font-display, 4px radius, padded 4px/10px
- **Name:** 13.5px font-sans, weight 700, letter-spacing 0.14em, uppercase, primary text
- **Optional count:** muted text, right-aligned

Apply this across ALL section/band/category headers on all surfaces. Convert:
- Regulations index "394 Regulations" h2 (currently Anton 30px secondary-blue, no border) → badge pattern
- Community section-h h2 (currently Anton 22px ink with bottom border) → badge pattern

#### FIX 7. Date/time formatting, Market Intel full-date is master

Apply uniformly across the platform:

| Position | Format | Example |
|---|---|---|
| Masthead meta | Full date | "May 24, 2026" |
| Card kickers, content timestamps | Short date | "29 Apr" |
| Activity feed rows | Relative | "2h ago" / "4d ago" |
| Detail page hero meta | Full with context | "Published 14 Oct 2026 · Reviewed 21 May 2026" |
| Code / data layer | ISO 8601 | "2026-05-24" |

Specific changes:
- Regulations masthead: replace "last sync 2 weeks ago" with "May 24, 2026 · last sync 14 May 2026"
- Research masthead: add "May 24, 2026 · " prefix
- Community masthead: add "May 24, 2026 · " prefix
- Admin masthead: keep "Platform admin · [date]" (operator chrome, not editorial)

#### FIX 8. Number framing, use "active" not "in scope"

Apply uniformly:
- Regulations: "394 active regulations · 82 jurisdictions"
- Market Intel: "107 active signals" (already correct)
- Operations: "78 active items · 54 jurisdictions" (was "in scope")
- Research: "34 active findings this week · 7 themes" (keep "this week", it's research's weekly rhythm)
- Community: "147 active threads · 23 organizations" (already correct)
- Map: "394 active items · 82 jurisdictions · 13 with critical items"

#### FIX 9. Workspace verticals declaration, per workspace-scoped surface

Surfaces filtering content by workspace verticals MUST declare them in masthead meta:
- Already correct: Research, Market Intel, Operations
- ADD verticals: Regulations ("workspace verticals: Live events · Fine art"), Map (same)
- Community: implicitly filtered by user's groups, no addition needed
- Admin: no verticals (cross-cutting operator chrome)

#### FIX 10. Filter mechanism, codify and apply this rule

The mechanism varies because page needs vary, which is correct. Document the rule so it stays correct:

- **TABS** = mutually-exclusive views; each tab shows entirely different content
- **CHIPS** = composable multi-filter on the same content (severity + region + vertical filtered together)
- **TOOLBAR** = high-volume content (>100 items) needing search + sort + view-toggle + filter dropdown combined

Current state evaluated against rule, all CORRECT:
- Regulations index: toolbar ✓ (394 items)
- Regulations detail: tabs ✓ (different views of one item)
- Market Intel: chips + band navigation ✓
- Research: chips + theme rail ✓
- Operations: tabs ✓ (data-type switch)
- Community: tabs ✓ (view-mode switch)
- Map: chips ✓ (composable filter)

Codify the rule in design system docs so future builds don't drift.

---

### MEDIUM (terminology)

#### FIX 11. Breakdown rail naming, use `coverage-rail` everywhere

Currently: `theme-rail` (Research), `cat-rail` (Operations), `band` (Market Intel). Standardize to `.coverage-rail` with surface-specific item identifier prefixes:
- Research: coverage-rail with theme items (T1-T7 badges)
- Operations: coverage-rail with dimension items (D1-D6 badges)
- Market Intel: coverage-rail with band items (B1-B3 badges)

Matches the headline copy "what we cover by theme/dimension/signal type" used in mockups.

#### FIX 12. Pill / chip / badge / tag, consolidate to 5 components

Current: 9+ overlapping class names. Consolidate:

| Component | Purpose | Replaces |
|---|---|---|
| `.cl-pill-severity` | 5-label severity (Action / Cost / Window / Edge / Monitor), color-coded | s-pill, sev-chip |
| `.cl-pill-tier` | T1-T7 source tier, color-coded | t-pill |
| `.cl-pill-urgency` | Immediate / Watch / Reference (regulations detail hero only) | hero-pill |
| `.cl-chip-filter` | Selectable filter chips with on/off state | chip, sev-chip filter use |
| `.cl-tag` | General label, no state (topic tags, jurisdiction codes, byline meta) | hero-tag, topic-chip, b-tag, xref tag |

Eliminate all the deprecated class names. Map existing uses to the 5 canonical components.

#### FIX 13. Right rail width, standardize to 320px

Currently: 300px / 320px / 360px. Use 320px across customer-facing surfaces (Market Intel, Research, Community, Map). Admin's Issues Queue rail may stay 360px because it's the operator workhorse.

#### FIX 14. Source tier, clarify T1-T7 vs customer-visible T1-T5

Canonical model is T1-T7 per `source-credibility-model` skill. Customer-facing surfaces typically only encounter T1-T5; T6 (aggregator) and T7 (unverified) are rare and admin-reviewed. Update Regulations detail's tier legend:

- Replace "T1 primary law, T2 regulator guidance, T3 intergovernmental, T4 industry body, T5 trade press" with:
- "T1 Primary law · T2 Regulator guidance · T3 Intergovernmental · T4 Industry body · T5 Trade press · T6/T7 reserved for aggregators and unverified sources (rarely surfaced)"

#### FIX 15. Card grid columns, unify intelligence card grid

Operations card pattern is the master per README. Standardize all intelligence cards (Market Intel signals, Research findings, Operations D1 regulation references, regulation-detail action items) to:

- Grid: `1fr 220px` with 22px gap
- Left column (`.body`):
  - item-head strip (severity pill + kicker + when, all in one row)
  - h4 title (17-18px, weight 700)
  - byline (12px, secondary)
  - paragraph (13.5px, secondary)
- Right column (`.right`):
  - Tier pill
  - Severity pill
  - "What it changes" callout

Remove the kicker-as-first-column pattern (110px / 100px). Move kicker into item-head strip.

#### FIX 16. "What it changes" callout, right column only

Research CSS currently has both `.signal .right .changes-mini` AND `.signal .body .changes-callout` with display toggles. Pick ONE: right column. Remove the body-position variant.

---

### LOW (polish)

#### FIX 17. Masthead eyebrow structure, uniform span layout

Community currently uses flat text. Match other surfaces' span structure:
```html
<div class="mh-eyebrow">
  <span>Vol IV</span><span class="sep">·</span>
  <span>No. 21</span><span class="sep">·</span>
  <span>Sunday</span>
</div>
```

#### FIX 18. "Vol IV · No. 21" framing, keep editorial, drop from Admin

The volume/issue framing implies editorial newsletter cadence (weekly batch). KEEP on customer-facing surfaces. DROP from Admin (use "Platform admin · [date]" instead). Document in design system: Vol IV = current platform year, No. 21 = week number, day = current day.

#### FIX 19. Sidebar foot dot, success-green when online

Currently `--color-error` (red) on every page. Use `--color-success` for online/healthy state. Reserve red for genuine error states (notifications, system warnings).

#### FIX 20. Jurisdiction notation, ISO 3166-1 alpha-2 in compact displays

Standardize to 2-letter ISO codes in dense displays:
- UAE → AE
- UK → GB
- HK → HK
- Operations gap notation: "gaps in AE · GB · HK"

Exception: Common-name display in user-facing prose ("United Kingdom" in list rows) stays fine. Codes-only in compact, dense, or repeated displays.

#### FIX 21. Featured card border-width, uniform 3px

Research featured finding uses 4px left border. Standardize ALL left-accent borders to 3px (`--color-primary` default, `--color-critical` urgent variant).

---

## 4. Master design tokens (already in tokens.css, codify in design system docs)

**Colors:**
- `--color-primary` #E8610A (orange), primary actions, accent left-borders, kicker labels
- `--color-secondary` #1E3A8A (navy), masthead eyebrow, tabs active underline
- `--color-critical` #DC2626, Action required, critical priority
- `--color-high` #D97706, Cost alert, high priority
- `--color-moderate` #CA8A04, Window closing, moderate priority
- `--color-low` #16A34A, Background, low priority

**Typography:**
- `--font-sans` Plus Jakarta Sans (body, weights 400-800)
- `--font-display` Anton (display numbers + section heading badges only)
- Sizes: 9-11px (kickers/labels), 12-14px (body), 17-18px (card headlines), 22-28px (section headings), 44-56px (page titles / hero stats)

**Spacing:**
- Sidebar: 232px fixed
- Page content padding: 40px left/right
- Detail page max-width: 1100px
- Right rail: 320px standard, 360px for Admin Issues Queue
- Radius: `--radius-sm` 4px / `--radius-md` 8px / `--radius-pill` 999px

**Top accent line:** 4px high gradient `linear-gradient(90deg, #1E3A8A 0%, #DC2626 100%)`. Every page, no exceptions.

---

## 5. Skill operator-stated corrections (apply before any rebuild dispatch)

The platform-intent skill at `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` requires these operator-stated corrections per its own Section 10:

1. **Add Dashboard as a canonical surface OR cross-cutting capability.** Operator confirmed Dashboard stays as-is and is part of the canonical model. Current skill enumerates "five surfaces plus cross-cutting capabilities (Map, Intelligence Assistant, Onboarding)" with Dashboard absent. Operator recommendation: add Dashboard as a cross-cutting capability (alongside Map / Intelligence Assistant / Onboarding), framed as the digest/triage view that surfaces what's new, important, and flagged across the five intelligence surfaces.
2. **Remove vendor directory.** Section 3.5 currently lists vendor directory as "shipped per Workstream B." Operator decision: no vendor directory in the platform. Remove all references.
3. **Update editorial pickup pipeline status.** Section 3.5 claims editorial pickup pipeline shipped; audit confirms absent/stubbed. Correct to actual state.
4. **Update LinkedIn import status.** Currently described as "stub." Operator decision: in-flight feature build, not stub. Update language.

These corrections must land BEFORE Community rebuild or any Sequence C dispatch that depends on the affected sections.

---

## 6. Sequencing recommendation

1. **Apply Fixes 1-10 (CRITICAL + HIGH) to the design mockups themselves** before recreating in code. Retrofitting after means touching every surface twice.
2. **Apply Section 5 skill operator-stated corrections** to platform-intent SKILL.md.
3. **Run REC-OBS-G standalone wiring dispatch.** Connects existing category-aware RPCs into application code so /market and /operations deliver differentiated content. Foundation for items 4-8.
4. **Sequence C rebuild order** (per README):
   1. Research (cleanest spec, highest leverage)
   2. Operations (named decisions, structured content + Assistant, NOT decision-engine UI)
   3. Market Intel (depends on severity vocab decisions in Fix 1)
   4. Community (depends on AI bar addition + spec corrections)
   5. Regulations Detail (depends on format spec binding)
5. **Apply Fixes 11-16 (MEDIUM)** during the code build as each component is touched.
6. **Polish sweep (Fixes 17-21)** after all surfaces ship.
7. **Parallel:** Map refinement, Admin reorganization.

---

## 7. Operator standing instructions (binding on all work)

- No em dashes or en dashes where commas work grammatically. Use commas.
- No prescriptive process language; provide inputs + constraints, don't dictate how to design.
- Use "Claude reports X" framing when not directly verified.
- No new fitness functions / ADRs / layers unless operator authorizes.
- Skill modifications require operator-stated correction with strong emphasis per platform-intent Section 10.
- Dual-posture (current verticals: live events / fine art / luxury / automotive / humanitarian; expansion-time freight forwarders) applies to every rebuild dispatch unless operator explicitly narrows.
- Operations rebuild bounded to structured content + Intelligence Assistant. NEVER a decision-engine UI. Skill Section 11 anti-pattern.
- Every dispatch's Value Delivery Check must include explicit spec-match assessment against the canonical SKILL section for the touched surface.

---

**End of handoff.**
