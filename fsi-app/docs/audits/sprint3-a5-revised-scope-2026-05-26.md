# A5 — Revised Scope (Sprint 3, post brief-drift correction)

**Date:** 2026-05-26
**Status:** READ-ONLY scope reset. Awaiting operator decisions before A5 implementation.
**Dispatch:** Sprint 3 A5 — Intelligence item sections backfill (per `docs/dispatches/sprint3-dispatch-brief.md` Section 8)

---

## TL;DR

The dispatch brief (Section 8 row A5) said: "Populate `intelligence_item_sections` for 11 of 14 regulation brief sections." The new mockup at `design_handoff_2026-05/regulations-detail.html` does **not** render 11 sections. It renders **5 of the 14 spec sections** (§3, §4, §8, §14, §15) plus **2 NEW UI primitives** (Impact Assessment, Why It Matters) that are NOT in the SKILL.md 14-section spec at all.

Brief drift is significant. A5 must be re-scoped before implementation.

---

## What the mockup actually renders

Read end-to-end from `design_handoff_2026-05/regulations-detail.html`. Ordered list of UI primitives the mockup composes in the main `.content` column (between sidebar and right edge — note there is no right rail in the new mockup, unlike the live `RegulationDetailSurface.tsx`):

| # | Primitive | DOM/CSS shape | Lines |
|---|---|---|---|
| 1 | Breadcrumb | `.crumb` | 213 |
| 2 | Hero card | `.hero` (mode chips, type/action pills, h1 title, deck, tag chips, action row, meta line) | 216-242 |
| 3 | AI prompt bar | `.ai-bar` (input + Ask button + chip row) | 245-256 |
| 4 | Tabs | `.tabs` — Summary · Exposure · Penalty schedule · Timeline · Sources (5 tabs, identical to live) | 259-265 |
| 5 | Summary switcher | `.summary-switch` — Short / Full toggle pill | 271-274 |
| 6 | Short summary card | `.ai-summary#short-summary` | 277-283 |
| 7 | Full summary block | `.full-summary#full-summary` — 6-segment grid (What it is / What it requires / Who it affects / What it costs / What to do / Open questions) + "Read the source" full-width segment | 286-353 |
| 8 | **Impact Assessment** | `.impact-card` — 4 gradient bars (Cost Impact, Compliance Obligation, Client-Facing, Operational), each with a `.score` `<b>X/3</b> · Label` line | 356-378 |
| 9 | **Why it matters** | `.why` — left-3px-blue-accent block, 2 editorial paragraphs | 381-385 |
| 10 | §3 Issues requiring immediate action | `.sec` with `.sec-num` "§3" + `.sec-tag` "Always · 3" + 3-row `.action-list` of `.action-item` with chip badges | 388-422 |
| 11 | §4 Compliance chain | `.sec` "§4 How the workspace sits in the compliance chain" + `.sec-tag` "Always" + `.prose` block + `.src` footer | 425-437 |
| 12 | §8 Substantive requirements | `.sec` "§8" + `.sec-tag` "Always · 5" + `.ob-table` 4-col obligations table | 440-455 |
| 13 | §14 Confirmed regulatory timeline | `.sec` "§14" + `.sec-tag` "Always" + `.timeline` of `.tl-item` rows | 458-471 |
| 14 | §15 Sources | `.sec` "§15" + `.sec-tag` "Always · 6" + `.sources-list` of `.source-item.t{1-5}` rows | 474-487 |

**Total numbered §-prefixed sections rendered: 5** (§3, §4, §8, §14, §15).
**Non-spec UI primitives between Full Summary and §3: 2** (Impact Assessment, Why It Matters).

No right rail. No DeadlineCard, AffectedLanesCard, OwnerTeamCard, Identification, Coverage, or LinkedItemsCard appear in this mockup.

---

## What the brief said vs what the mockup shows

**Brief language (Section 8 row A5, lines 84 + 280-292):**

> "Intelligence item sections backfill — Populate `intelligence_item_sections` for **11 of 14** regulation brief sections."
> "Verification: load 5 regulation detail pages, confirm **all 14 sections render** (sections 5/6 may be empty if conditional and not applicable)."

**Mockup reality:**

The mockup renders **5** spec sections (not 14, not 11). It also renders **2 net-new UI primitives** (Impact Assessment, Why It Matters) that have no canonical home in the 14-section spec.

**Divergence per Brief-Drift Precedent:**

The brief premise (backfill 11 of 14 sections so all 14 render first-class) is incorrect against the new mockup. The mockup is the authoritative shape for what ships (per the design-reference-protocol feedback rule in MEMORY.md: "mockup binds unless protocol Section 3 explicitly overrides"). Therefore A5's scope must be re-cut:

- **In-scope sections drop from 11 → 5.** (Sections §1, §2, §5, §6, §7, §9, §10, §11, §12, §13 are NOT rendered first-class on the customer-facing detail page per this mockup.)
- **Two new UI primitives enter scope** (Impact Assessment + Why It Matters), each requiring a schema decision because neither maps cleanly to existing intelligence_items columns.

The original A5 verification ("confirm all 14 sections render") is unreachable because the mockup deliberately renders 5. A5 verification must be rewritten to match the mockup.

---

## Sections rendered by the mockup, mapped to SKILL.md spec

Per `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` "Regulatory Fact Document (14 sections, conditional)":

| § | Canonical name | Always / conditional | In mockup? | Parser needed? |
|---|---|---|---|---|
| 1 | Purpose and Scope of This Document | Always | NO | n/a |
| 2 | What This Regulation Is and Why It Applies to the Workspace | Always | NO (the Hero card + Short/Full summary replace this functionally, but not as §2 structured) | n/a |
| 3 | Issues Requiring Immediate Action | Always | YES — `.action-list` (3 items in mockup, agent-emitted variable) | YES — need to parse markdown action-list with severity chip labels |
| 4 | How the Workspace Sits in the Compliance Chain | Always | YES — `.prose` body + `.src` citation | YES — parse markdown prose + extract trailing source line |
| 5 | Authoritative Guidance Document Analysis | Conditional | NO | n/a |
| 6 | Anticipated Authoritative Guidance and Pending Regulatory Events | Conditional | NO | n/a |
| 7 | Threshold Questions | Conditional | NO | n/a |
| 8 | Substantive Requirements | Always | YES — `.ob-table` 4-col table (obligation, deadline, status, next action), 5 rows in mockup | YES — parse markdown table into rows |
| 9 | Product-Specific Compliance Status | Conditional | NO | n/a |
| 10 | Registration and Reporting Obligations | **Always** per spec | **NO** (mockup omits — see open question 1) | n/a |
| 11 | Operational System Requirements | **Always** per spec | **NO** (mockup omits — see open question 1) | n/a |
| 12 | Exemptions and Edge Cases | Conditional | NO | n/a |
| 13 | Adjacent Industry Research and Alternatives | Conditional | NO | n/a |
| 14 | Confirmed Regulatory Timeline | Always | YES — `.timeline` of `.tl-item` rows with `.when.crit` highlight on future events | YES — parse markdown timeline entries with date + label + source citation |
| 15 | Sources | Always | YES — `.sources-list` of `.source-item.t1` through `.t5` rows with tier badge, name, meta line, link | YES — parse markdown source list with tier classification |

**Mockup-rendered: §3, §4, §8, §14, §15** (5 of 14, all five "Always" per spec).

**Spec-mandated "Always" sections NOT rendered first-class in mockup: §1, §2, §10, §11.** §1 and §2 have functional analogs in the hero + summary block. §10 and §11 have no mockup equivalent — this is the gap that needs operator adjudication.

**Spec conditional sections absent from mockup: §5, §6, §7, §9, §12, §13.** These are correctly omitted when no grounded content exists per the integrity rule.

---

## New UI primitives NOT in the 14-section spec

These two primitives render between the Full Summary block (line 286-353) and §3 (line 388-422). Neither maps to the SKILL.md 14-section vocabulary.

### Impact Assessment

**Mockup shape:** `.impact-card` (lines 356-378). Light card with a single h3 "Impact Assessment" header and 4 `.impact-row` children. Each row is a 3-column grid: `200px label` / `1fr gradient bar` / `80px score`. The score format is `<b>X/3</b> · Label` (e.g., "3/3 · High", "2/3 · Moderate"). The bar fill class is one of `.fill.low` / `.fill.moderate` / `.fill.high` and uses gradient backgrounds that map to severity tiers.

**4 dimensions (fixed):** Cost Impact, Compliance Obligation, Client-Facing, Operational.

**Existing data overlap.** Per SKILL.md "Impact Scoring (4 Dimensions, 0-3 Each)" (lines 639-647), the 4 dimensions are already defined: Cost, Compliance, Client, Operational. Each 0-3. Live code computes these via `scoreResource(r)` in `RegulationDetailSurface.tsx` line 1023 (`<ImpactScores scores={r.impactScores ?? scoreResource(r)} />`). The 0-3 score per dimension already exists in the `intelligence_items` table (column: `impact_scores` JSONB per the resource type definition).

**Schema gap:** Confirm column name + shape and confirm score labels. Options:
- **(a)** Reuse existing `intelligence_items.impact_scores` JSONB. Confirmed live via `r.impactScores` in the live component. This is the recommended path.
- **(b)** New `scored_dimensions` table (`item_id`, `dimension`, `score`, `label`). Higher schema discipline but redundant with (a).
- **(c)** Derive from existing fields (priority, severity, tags). Already what `scoreResource(r)` does as a fallback when `impactScores` is null.

**Recommendation: (a).** The data already exists on `intelligence_items.impact_scores` (or is derivable via `scoreResource`). The mockup's Impact Assessment card is a **render upgrade**, not a data backfill. A5 task: rebuild the `ImpactScores` component to match the gradient-bar + score-fraction shape from the mockup (lines 102-114 CSS, lines 356-378 markup). No DB write needed.

**Label vocabulary:** The mockup shows "High" / "Moderate" / "Low" for the score-label suffix. Mapping from 0-3 score: 3 → High, 2 → Moderate, 1 → Low, 0 → none-shown-or-Low. Confirm with operator (open question 4).

### Why It Matters

**Mockup shape:** `.why` block (lines 381-385). Left-3px-solid-blue-accent (`var(--color-secondary)`), light surface, "WHY IT MATTERS" small-caps label, 2 paragraphs of editorial prose at 14.5px line-height 1.6.

**Content character:** Editorial rationale tying the regulation to the workspace's verticals and the 6-month operational window. NOT a structured field — it reads as composed prose, distinct from §3 action items and §2 plain-language summary. Per the integrity rule and workspace-anchored rule, this is grounded analytical synthesis.

**Existing data overlap.** The live `RegulationDetailSurface.tsx` already renders a "Why it matters" block (lines 1057-1079) using `r.reasoning` (with blue left-border) and `r.whyMatters` (plain prose). Both are existing columns on the Resource type and presumably on `intelligence_items` (verify column names — likely `reasoning` and `why_matters`).

**Schema gap:** Verify both columns exist and which one drives the mockup's editorial copy. Options:
- **(a)** Reuse existing `intelligence_items.why_matters` TEXT (or `intelligence_items.reasoning` TEXT, whichever stores the editorial 2-paragraph form). This appears to be live already.
- **(b)** Carve a new field from `full_brief` markdown by parsing a `## Why It Matters` heading. The agent does NOT currently emit this header per SKILL.md (no §-prefixed section is called "Why It Matters"; the closest is §2 "What This Regulation Is and Why It Applies").
- **(c)** Derive at render time from §2 first-paragraph or from a synthesis of §3 + §4.

**Recommendation: (a) if `why_matters` already carries the editorial form; otherwise (a) with a new column + agent prompt extension.** Need to inspect 5 sample `intelligence_items` rows in production to confirm whether the existing `why_matters` column has the 2-paragraph editorial shape the mockup expects, or whether it has 1-line bullet-style content that doesn't match the mockup. If the latter, A5 needs to extend the agent prompt to emit a 2-paragraph workspace-anchored "Why it matters" synthesis (which sits adjacent to §2 in the SKILL.md spec but is not a numbered section).

---

## Current state of RegulationDetailSurface.tsx (live vs mockup)

Confirmed by reading `src/components/regulations/RegulationDetailSurface.tsx`:

**Renders from `intelligence_items` direct columns:**
- Hero card (modes, type, priority, note/whatIsIt, tags) — lines 299-434
- Stat strip (Effective, Penalty rate) — lines 438-465
- AI prompt bar — lines 470-479
- Tabs (Summary, Exposure, Penalty schedule, Timeline, Sources) — lines 481-517
- ImpactScores (live, scoreResource(r) fallback) — line 1023
- What changed (from changelog) — lines 1027-1054
- Why it matters (r.reasoning + r.whyMatters) — lines 1057-1079
- Key data (r.keyData) — lines 1082-1090
- Recommended actions (r.recommendedActions) — lines 1093-1105
- Dispute — lines 1108-1153

**Renders from `full_brief` markdown via parser:**
- Operational briefing expander (`extractOperationalBriefing`) extracts §3 Immediate Action, §2 What This Is, §4 Compliance Chain — lines 978-981. Limited to 3 sections; non-standard parsing.
- Full text panel renders the entire `full_brief` markdown via `IntelligenceBrief` component — lines 1162-1185.

**Renders from `intelligence_item_sections` table:**
- **None.** Migration 103 is applied (table exists) but no code path reads from it. This is the gap A5 must close — but only for the 5 mockup-rendered sections, not 11/14.

**Parsing gap:** The current "Tier 2 operational briefing" extraction relies on heading-substring matches in markdown and only covers §3 / §2 / §4 (3 of 14 sections). To render §8 (table), §14 (timeline), §15 (sources list) as first-class structured components per mockup, parsing must be extended or — preferred per Q4 — the data must live in `intelligence_item_sections` rows the renderer queries directly.

---

## Open questions for operator

1. **§10 and §11 omission from mockup — intentional or operator-decide?**
   SKILL.md (line 319) marks §10 (Registration and Reporting Obligations) and §11 (Operational System Requirements) as "Always present." The mockup omits both. Three readings:
   - (i) Intentional UI simplification — §10/§11 content folds into §8's obligation table (deadline + status + next action covers the same ground).
   - (ii) Mockup oversight — should add §10/§11 as additional `.sec` cards after §8.
   - (iii) Defer to a future mockup iteration; ship the 5 sections from the mockup now, revisit §10/§11 when content density warrants it.

   **Recommendation: (i) — fold §10/§11 into §8.** §8's table already captures registration deadlines, reporting status, and next actions, which matches §10/§11 scope. If operator confirms, A5 implementation merges §10/§11 markdown content into §8's table data during the backfill parser.

2. **Impact Assessment schema — (a) / (b) / (c)?**
   Recommendation: **(a) reuse `intelligence_items.impact_scores` JSONB.** The data already exists. A5 task is render-shape, not data-backfill. Confirm.

3. **Why It Matters schema — (a) / (b) / (c)?**
   Recommendation: **(a) reuse `intelligence_items.why_matters` (or `reasoning`).** Need to spot-check 5 production rows to confirm the existing column carries the editorial 2-paragraph shape. If column content is sparse or bullet-style, extend agent prompt to emit a 2-paragraph editorial synthesis on the next regeneration pass.

4. **Impact Assessment label mapping (0-3 → text).**
   Mockup shows "High" (3), "Moderate" (2), "Low" implied (1). Confirm: 3=High, 2=Moderate, 1=Low, 0=hide-row-entirely vs show-as-Low?

5. **Are §10/§11 markdown content currently in `intelligence_items.full_brief` for the existing 89-155 briefs?**
   If §10/§11 prose IS in full_brief markdown, dropping it from the rendered surface means content goes unused. Confirm acceptable. If §10/§11 content is sparse anyway, the omission is moot.

6. **Backfill source — `intelligence_item_sections` or render-from-`full_brief`?**
   Two architectures:
   - **(α)** Backfill `intelligence_item_sections` with 5 rows per item (§3, §4, §8, §14, §15 keys). Renderer queries the table. Q4 spec.
   - **(β)** Skip the backfill table for A5. Extend the existing markdown parser (`extract-sections.ts`) to extract all 5 sections from `full_brief` at render time.

   Recommendation: **(α) per Q4 + dispatch brief intent.** Table-backed is more queryable (per-section source_ids, per-section regeneration, per-section reverse-citation). Cost: one backfill script + agent persistence extension. But α is only worth it if Sprint 3+ uses `source_ids` queries; if not, β is faster and equivalent for read-only.

---

## Revised A5 commit plan (proposed, awaiting operator approval)

Pending operator answers to Q1-Q6 above.

**Assumes:** Q1 = (i) fold §10/§11 into §8. Q2 = (a) reuse impact_scores. Q3 = (a) reuse why_matters (confirm content shape first). Q4 = High/Moderate/Low for 3/2/1, hide row for 0. Q5 = acceptable to drop §10/§11 prose. Q6 = (α) backfill `intelligence_item_sections`.

| # | Commit | Files touched | DB writes? |
|---|---|---|---|
| 1 | A5.1 — read-only inspection: 5 production `intelligence_items` rows confirm `why_matters` shape + `impact_scores` JSONB shape | `scripts/sprint3-a5-inspect.mjs` (new), `docs/audits/sprint3-a5-inspection-2026-05-26.json` (new) | No |
| 2 | A5.2 — parser extension for the 5 sections | `src/lib/agent/extract-sections.ts` (extend with §8 table parser, §14 timeline parser, §15 sources-list parser; existing §3 + §4 stay) | No |
| 3 | A5.3 — backfill script writes `intelligence_item_sections` rows from full_brief | `scripts/sprint3-a5-backfill.mjs` (new), idempotent per (item_id, section_key) UNIQUE constraint | Yes — `intelligence_item_sections` INSERTs |
| 4 | A5.4 — agent persistence: regeneration writes to `intelligence_item_sections` alongside full_brief | `src/app/api/agent/run/route.ts` (extend with section persist step), `src/lib/agent/persist-sections.ts` (new) | Yes (per regeneration) |
| 5 | A5.5 — RegulationDetailSurface read path: query `intelligence_item_sections` for §3/§4/§8/§14/§15; render via new component | `src/components/regulations/RegulationDetailSurface.tsx`, `src/components/regulations/SectionCard.tsx` (new — matches `.sec` mockup), `src/components/regulations/ObligationsTable.tsx` (new — matches `.ob-table`), `src/components/regulations/TimelineSection.tsx` (new — matches `.timeline`), `src/components/regulations/SourcesList.tsx` (new — matches `.sources-list`) | No |
| 6 | A5.6 — Impact Assessment component rebuild to match mockup shape | `src/components/resource/ImpactScores.tsx` (rewrite to gradient-bar + score-fraction shape per `.impact-card`) | No |
| 7 | A5.7 — Why It Matters render path confirmation/extension | `RegulationDetailSurface.tsx` (verify `r.whyMatters` populates the `.why` block correctly; if column content is sparse, add agent prompt extension in `src/lib/agent/system-prompt.ts` to emit editorial 2-paragraph synthesis on next regeneration; backfill via re-run is operator-gated) | Conditional |
| 8 | A5.8 — verification: 5 regulation detail pages load with §3, §4, §8, §14, §15 rendered first-class + Impact Assessment + Why It Matters per mockup; right-rail components remain or are stripped per Q (NOT in this audit's scope; flag separately) | `docs/audits/sprint3-a5-verification-2026-05-26.md` (new) | No |

---

## Constraints honored in this audit (per Sprint 3 dispatch discipline)

- **READ-ONLY.** No code or DB changes from this audit.
- **Verification-before-authorization.** This audit IS the read-only investigation phase. Writes wait on operator authorization based on Q1-Q6 answers.
- **Brief-Drift Precedent.** Mockup divergence from brief is named explicitly (5 sections + 2 new primitives, NOT 11 of 14). Scope reset is the surfaced finding.
- **Integrity rule (SKILL.md).** Where mockup omits "Always" sections (§10, §11), audit surfaces the omission as an open question rather than papering over it.
- **Design reference protocol (MEMORY.md feedback rule).** Mockup binds; live `RegulationDetailSurface.tsx` is the existing implementation surface; SKILL.md is the agent contract. A5 reconciles all three by reshaping the live UI to match the mockup, parsing the agent's output into the structured table the renderer needs.
