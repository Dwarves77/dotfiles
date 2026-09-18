# Site-wide parts brief, 2026-09-18 (operator, Claude Design)

Landed verbatim by the coordinator on 2026-09-18. This is the single design document for the
parts program (W10 in `../plans/complete-system-build-plan-2026-09-04.md`, section 5.4); it
supersedes the detail-page and process notes of the same day. Four coordinator notes, each
reported to the operator the same day under the brief's own rule 1.3:

1. The bundle the brief names, `docs/design/handoff-2026-09-07/`, does not exist in the repo.
   The bundle is `docs/design/handoff-2026-09-06/` (screens 00 to 19, README, HANDOFF,
   DEVIATION-LOG, SHARED-PART-REPORT-2026-09-08, AUDIT-2026-09-07). Artboard 21
   (`screens/21-detail-parts.png`) and the README dimensions for it are not in the repo yet;
   the operator supplied the artboard image in chat. It is owed to the bundle before the FactCard
   lane starts; until it lands, the brief's section 2 text is the fixture.
2. F44 is taken (`F44-broken-main-guard`). The parts gate the brief calls "F44" is built as F49
   (parts-not-pages) with the brief's exact rule.
3. Prior art the parts inventory extends rather than duplicates: `SHARED-PART-REPORT-2026-09-08.md`
   (rendered presence per route for five items) and `AUDIT-2026-09-07.md` (generated, 2,557
   value-level checks from `fsi-app/.discipline/rendering/audit/spec/`). Shared parts already have
   homes under `fsi-app/src/components/ui/` (FactCard, Masthead, CommandBar, ListRow, Absence,
   Chips, SectionCard, StatBlock, MilestoneTimeline, ActionRow and others); the defect is drift
   and call sites that bypass them, which is what the inventory measures.
4. Section 2.16 (impact meter, row variant) was added by the operator later the same day and is landed here verbatim.
5. Lines below that carry an em dash, an en dash or a section sign keep them verbatim and carry
   the repo's disclosure marker in an invisible comment (pre-commit rule 022).

---

CLAUDE DESIGN — 2026-09-18 — SITE-WIDE PARTS BRIEF (supersedes today's earlier <!-- glyph:verbatim -->
detail-page and process notes; this is the single document)

Refresh the bundle first: docs/design/handoff-2026-09-07/ now carries
screens/21-detail-parts.png (fact card v2, merged action card, long-title
masthead) and a README with the matching dimensions. Artboard 21 is the
fixture picture for every part named below.

════════════════════════════════════════════════════════════════════════
1. RULE OF WORK — parts, not pages <!-- glyph:verbatim -->
════════════════════════════════════════════════════════════════════════
The same defects recur on every page because each page owns its own markup.
From now on nothing is fixed on a page. Every item in this brief is a SHARED
PART; a lane owns one part and every call site of it on all 17 routes plus
/watchlist, /privacy, /invitations. Done-state per part: renders from one
file everywhere it appears, proven by a presence report (route · file · line)
and one fixture screenshot of the part with all its variants. I sign off the
part; the pages follow. Page screenshots are no longer the review unit.

1.1 Produce docs/design/parts-inventory.md before any lane starts. For each
    part below: component path or NONE; every route rendering the equivalent
    UI without it (file + line). That list is the backlog.
1.2 Fitness F44: a route's page.tsx may not contain the literal styles that
    define a part (Anton title, card border + radius 10, 3px rule, fact card
    edge/band, chip padding, state note edge). Pages import parts. No
    grandfathering.
1.3 Artboard wins over README where they disagree; tell me. Case not drawn →
    ask, do not invent. I answer same day and add it to the README.
1.4 Lane order: FactCard → ItemGroup + SectionHeader → Masthead + ActionCard
    → CommandBar → ListRow + Absence + Chips → StateNote → RailCard +
    StatBlock → NavCard.

════════════════════════════════════════════════════════════════════════
2. PARTS — definition, where used, current defect <!-- glyph:verbatim -->
════════════════════════════════════════════════════════════════════════

2.1 FACT CARD (v2 — artboard 21c). Used on all four detail surfaces, the <!-- glyph:verbatim -->
    operations matrix panel, research findings, dashboard "What changed".
    Three zones:
    a. KIND BAND across the top: kind word 10.5px/800 .12em uppercase +
       qualifier 10.5px #7A6E6C, padding 6px 14px, on a tint, 1px
       rgba(0,0,0,.06) rule below.
    b. BODY ROW, grid 132px · 1fr · 150px, gap 14, padding 12px 14px:
       - figure lead: Anton 22, colour = edge colour, plus 10px uppercase
         .06em/700 muted sub-label. The number, date or instruction the card
         exists for. No figure → ≤3-word instruction ("Register").
       - claim: 13px/1.6, max-width 66ch, figures and dates in <b>.
       - provenance column, 1px left rule: T-square, source, org, link ↗,
         accessed date; 10.5px muted. Never a paragraph under the body.
    c. LEFT EDGE 3px.
    Kind vocabulary (fixed) → form:
       ACTION REQUIRED, LEGAL CONFIRMATION REQUIRED
           edge #F97316, band #FFF7ED, kind word #F97316
       DEADLINE, BASELINE TARGET, NATIONAL TARGET, SCOPE, PENALTY, DEFINITION
           edge #1A1A1A, band #F5F2EE, kind word #1A1A1A
       ANALYTICAL INFERENCE
           1px dashed rgba(0,0,0,.3) all round, band #FAFAF8, body italic
           #5A6B67, no figure lead, right column "not citable"
    Pipeline mapping: the bolded lead-in ("**ACTION REQUIRED.**") becomes the
    kind word; "Legal Confirmation Required:" and "Analytical inference:"
    sentences inside a body split into their own cards; unknown lead-in →
    SCOPE. Zero "*" in rendered text — add to forbids. <!-- glyph:verbatim -->
    Defect today: every card identical — no band, no figure, provenance as <!-- glyph:verbatim -->
    grey prose, asterisks in the DOM.

2.2 ITEM GROUP (artboard 21c). Wraps fact cards inside S2 on all four details.
    Header: item band pill (tinted pill, 6px dot, 9.5px/800 label) · item
    title 13px/600 · qualifier 11px muted. Groups separated by 1px
    rgba(0,0,0,.08). Every group CLOSES with an ACTION strip = StateNote in
    the item's band tint (2.7), label "ACTION" in the band colour, one
    sentence. Defect: S2 is a flat stack of identical cards, no groups.

2.3 SECTION HEADER (artboard 3, 21c). Every S-section on every detail, every
    card title on lists/dashboard/admin. "S2" 10.5px/800 .1em #7A6E6C +
    Anton 20 uppercase .04em title + right meta 10.5px uppercase .12em muted
    ("2 items · newest first"). Padding 14px 20px 10px, 1px .08 rule below.
    Running prose with no card (S3 "Compliance chain") → one fact card,
    kind DEFINITION. Defect: Anton only, no index, no meta.

2.4 MASTHEAD (artboard 21a). Every page.
    - Title = DISPLAY NAME: Anton 28 detail / 34 list, ≤2 lines, ≤72 chars.
    - Legal/full title = dek line 1, 12.5px #5A6B67, ≤72ch, wraps freely;
      issuing body line 2, 11px muted.
    - No display name in the record → derive "<jurisdiction> <subject> — <!-- glyph:verbatim -->
      <short ref>" and show a "DERIVED NAME" neutral tag in the meta line.
    - Eyebrow: "Vol IV · No. 38 · Regulations / European Union", right
      "4 of 13 in Immediate".
    - Dek row: 10px gap, 22px bottom padding, so a long scope line wraps
      instead of touching the command bar.
    Defect: 8-line Anton legal titles; dek jammed against the bar.

2.5 COMMAND BAR (artboard 21a). One control on every page: ⌕ · input · ⌘K
    hint · dark "Ask" button, 40px, radius 8. Placeholder scoped to the page
    ("Ask about this regulation — e.g. …"). Typing searches; Ask sends the <!-- glyph:verbatim -->
    same text. Remove the Search|Ask toggle and the second "Search" button.
    Remove every floating Ask AI button. Remove every per-tab ask bar.

2.6 ACTION CARD (artboard 21b). Every detail page; ONE card between the
    masthead and the sticky index. Contents in order: band pill + kind tag +
    tier square + source meta → action row (Export brief primary · Share ·
    ☆ Watch · + Tag; no band dropdown) → 1px rule → EXPOSURE Anton 17 +
    4-col grid (10px uppercase labels, 12.5px values, 3-line clamp) → 1px
    rule → TIMELINE Anton 17 + "N milestones · N in force" + track + dates +
    next-obligation callout (StateNote, item band tint). Two milestones still
    draw the track and both dates. Empty "workspace tags" label is hidden;
    applied tags render as a row under the title without a trigger.
    Defect: three separate cards with 40px gaps; empty tags label; dropdown.

2.7 STATE NOTE. Every page with a state worth declaring: list foot, map,
    watchlist, admin, account, settings, detail callout, ACTION strips.
    border-left 3px solid <band>; background <band tint>; radius 0 6px 6px 0;
    padding 9px 12px; text 12.5px left, label or one link right. Tints:
    Immediate #FEF2F2 · Action #FFF7ED · Monitor #EFF6FF · Awareness #F0FDF4;
    neutral #5A5552 on #F5F2EE. Tinted grounds carry band meaning; a detail
    page with no tinted element is wrong, an all-white S2 is the defect.

2.8 LIST ROW. Regulations, Market, Research, Operations, Watchlist,
    Dashboard "Due next" and "What changed". Grid 3px 56px 1fr 88px 84px
    76px 40px 44px, gap 0 14px, min-height 56px. Band spine full-bleed ·
    jurisdiction · title 14/600 one-line ellipsis + meta 11px · impact meter
    · due date + days · timeline 76px · tier · ⋯. Hover #FAFAF8; divider 1px
    .06; whole row is the target. ⋯ is a bare glyph #7A6E6C in a 44px cell
    with a 1px .08 left divider — no circle, no border. <!-- glyph:verbatim -->
    Defect: 44px rows, 13px titles, bordered ⋯ circle.

2.9 ABSENCE. Everywhere a value is missing. Meter: 30px dashed baseline
    rgba(0,0,0,.3) + em dash in the score slot. Date/tier cells: em dash.
    Timeline: empty track, no dots. Reason word (not in primary source ·
    pending · unscored · connect data) appears ONCE, small caps 10.5px/600
    #7A6E6C, in the title cell's meta line — never in a column, never a <!-- glyph:verbatim -->
    second row, never "UNSCORED" or "PENDING" in caps from source text.

2.10 CHIPS. Four families, one rule each:
    - band: tinted pill, 6–7px dot, band-coloured label 9.5–10.5px/800 <!-- glyph:verbatim -->
    - workspace tag: #F5F2EE, 1px rgba(0,0,0,.14), 6px square ink dot,
      removable
    - kind / mode / topic / theme / jurisdiction / region: #F5F2EE, no dot,
      NO border, 9.5px/700 .06em uppercase, radius 3, padding 2px 6px
    - tier: bordered square T1–T6 — the only bordered chip <!-- glyph:verbatim -->
    Filter groups keep the group shell border; chips inside do not.

2.11 SECTION CARD. Every panel on every page. White, 1px rgba(0,0,0,.12),
    radius 10, shadow 0 1px 2px rgba(26,26,26,.04) + 0 4px 14px
    rgba(26,26,26,.06), 3px top rule linear-gradient(90deg,#5A5552,#5A5552
    22%,rgba(90,85,82,.18)) inside the radius. Band blocks keep a
    band-coloured rule. The ONLY four-colour rule on a screen is the nav
    card cap. Defect: rule missing on rail cards; shadow missing.

2.12 RAIL CARD. Header 10.5px uppercase .12em/700 muted; label/value rows
    12.5px, labels #7A6E6C. Facet rows 24px, checkbox 14px, count right-
    aligned tabular; group label 10px uppercase, 14px above 6px below; 1px
    .08 rule between groups. "SOME RELEVANCE" pill: HOLD for the relevance
    component (pending from me), do not restyle.

2.13 STAT BLOCK. Profile, admin counters: label / Anton numeral / note.
    Never a band tile.

2.14 NAV CARD. 252px always; margin 20px 0 16px 16px; four-band 3px cap;
    two-row footer (Account + workspace, Admin + OWNER). Section rule
    between Map and Network. Defect: single footer row.

2.15 PAGE SCOPE. Content below an artboard's last card is not designed:
    /market Carbon-cost section, Policy timeline, Recalculation notices,
    Upcoming obligations → remove; Series board → /market/series.
    /regulations Upcoming-obligations strip → remove; Obligation register →
    /regulations/register. /operations calculator → /operations/calculator;
    DQI/aux/grid → profile S-sections. /community "Global room region" →
    remove. Disclaimer bar → remove from the frame (auth/onboarding keep the
    left-panel line).

2.16 IMPACT METER — ROW VARIANT (revised 2026-09-18; artboard 0 legend, all <!-- glyph:verbatim -->
    list screens re-captured). Every list row on Regulations, Market,
    Research, Operations, Watchlist, Dashboard "Due next" / "What changed".

    The four bars are a STEPPED FILL OF THE TOTAL N/12, not the four
    dimensions. Two rows with the same total must look identical.

    Geometry: four bars 8px wide, heights 6 / 9 / 12 / 15 px, gap 2, bottom-
    aligned, radius 1.5. Track (unfilled) #E5E1DB. Each bar holds 3 points
    and fills from the bottom, left to right:
        fill_i = clamp(N − 3·i, 0, 3) / 3   for i = 0..3
    So 1/12 = one low stub; 6/12 = bars 1–2 full, 3–4 empty; 8/12 = bars <!-- glyph:verbatim -->
    1–2 full, bar 3 two-thirds, bar 4 empty; 12/12 = four full bars. <!-- glyph:verbatim -->

    Colour: ALL filled bars in one colour, read off the severity ramp at N:
        1 → #16A34A   4 → #CA8A04   7 → #F97316   12 → #DC2626
    linear interpolation between stops (e.g. 3 → #8E921B, 5 → #DA820A,
    9 → #ED541C). Never per-bar colours; never #16A34A on a bar in a 12/12.

    Beside it: N/12, 11px, tabular numerals, N in bold, "/12" #7A6E6C.
    Column header reads "Impact" only — remove "LOW → HIGH". <!-- glyph:verbatim -->
    Unscored: the same four bars as 1px dashed rgba(0,0,0,.3) outlines,
    no fill, and an em dash in the score slot. No word.
    The legend row on every list uses this exact meter at 8/12.

    The per-dimension breakdown lives ONLY in the full variant (detail
    rail, dashboard rail): one continuous green→orange→red bar per
    dimension, revealed from the left by the score, sorted by name, not
    by value.

    Acceptance: on any list route, group rows by N — every row in a group <!-- glyph:verbatim -->
    renders byte-identical meter markup; 0 rows show "LOW → HIGH";
    0 filled bars are green when N ≥ 7.

════════════════════════════════════════════════════════════════════════
3. ACCEPTANCE — measured at 1440 on EVERY route, not one <!-- glyph:verbatim -->
════════════════════════════════════════════════════════════════════════
- presence report: each part in §2 renders from one file on every route <!-- glyph:verbatim -->
  that shows it; F44 = 0 findings
- zero "*" characters in rendered text, site-wide
- every fact card has a kind band, a left edge or dashed border, and a
  provenance column; ≥2 distinct kind forms visible on each detail route
- each detail S2 has ≥1 item group with a band pill and an ACTION strip
- exactly 1 card between masthead and sticky index on all four details
- title ≤2 lines on 20 random records per surface
- exactly 1 command bar per page; 0 floating Ask buttons
- every section card has the 3px top rule and shadow
- list rows 56px min on all six list surfaces; 0 bordered ⋯ circles
- 0 occurrences of "UNSCORED" / "PENDING" / "NOT SCORED" as rendered text
- one four-colour rule per screen (nav cap)
Send per-part fixture screenshots + presence reports. I sign off parts.
