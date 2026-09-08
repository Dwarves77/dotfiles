# Shared-part presence/absence report, per route, 2026-09-08

Lane `sharedreport`, base `train/wave61-2026-09-08` (`9f549170`). This is a REPORT. No product code
was changed by this lane.

## Method

Every route was RENDERED, not read. Each of the 17 artboard routes was mounted at 1440 through the
existing audit machinery (`fsi-app/.discipline/rendering/audit/mounts.mjs` +
`fsi-app/.discipline/rendering/smoke/harness.mjs`, the same esbuild bundle and Playwright page the
`npm run audit:design` sweep uses), and each of the five items was measured from
`getComputedStyle` and from RENDERED text. Rendered text applies each text node's own computed
`text-transform` and skips any node under a `display:none` / `visibility:hidden` ancestor, so the
`Absence` narrow variant's hidden word is never counted and an uppercase token the source writes in
lower case is. That is the MOBFIX-61 discipline; a source-text check is why eight forbids matched
nothing for weeks.

Every artboard cited below was opened as an image before its prose was read. Where the image and
the item's prose wording disagree, the image is followed and the disagreement is named.

Probe scripts and raw JSON are session scratch, not repo files. Every count in the tables is
reproducible from the mounts named here.

## Table 1: the 17 routes against the five items

`PRESENT` = the defect the item describes is on the route when it renders.
`ABSENT` = it is not.
`NO MOUNT` = the route has no mount that renders that part, so the cell is not measurable here.

| # | Route | Artboard | 2 Card top rule | 3 Absence strings | 5 Overflow control | 6 Kind chip | 10 Nav footer |
|---|---|---|---|---|---|---|---|
| 01 | `/` dashboard | 01 | ABSENT | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 02 | `/regulations` | 02 | ABSENT | ABSENT (no unscored row in fixture) | **PRESENT** | ABSENT | NO MOUNT |
| 03 | `/regulations/[id]` | 03 | **PRESENT** | ABSENT | **PRESENT** | ABSENT | **PRESENT** |
| 04 | `/market` | 04 | ABSENT | **PRESENT** | **PRESENT** | ABSENT | NO MOUNT |
| 05 | `/market/[id]` | 05 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 06 | `/research` | 06 | ABSENT | **PRESENT** | **PRESENT** | ABSENT | NO MOUNT |
| 07 | `/research/[id]` | 07 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 08 | `/operations` | 08 | ABSENT | **PRESENT** | **PRESENT** | ABSENT | NO MOUNT |
| 09 | `/operations/[id]` | 09 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 10 | `/map` | 10 | ABSENT | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 11 | `/watchlist` | 11 | ABSENT | ABSENT (no unscored row in fixture) | **PRESENT** | ABSENT | NO MOUNT |
| 12 | `/community` | 12 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 13 | `/admin` | 13 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 14 | `/profile` account | 14 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 15 | `/settings` | 15 | **PRESENT** | ABSENT | ABSENT | ABSENT | **PRESENT** |
| 16 | `/login` auth | 16 | ABSENT | ABSENT | ABSENT | ABSENT | N/A (artboard draws no nav) |
| 17 | `/onboarding` | 17 | ABSENT | ABSENT | ABSENT | ABSENT | N/A (artboard draws no nav) |

Totals: item 2 PRESENT on 8 of 17; item 3 PRESENT on 3 of 17; item 5 PRESENT on 5 of 17; item 6
PRESENT on 0 of 17; item 10 PRESENT on 10 of 10 measurable routes.

## Table 2: the file and line that decides each item

| Item | Deciding file:line on this base | Correct there? |
|---|---|---|
| 2 Card top rule | `fsi-app/src/components/ui/SectionRule.tsx:27` (`SECTION_RULE_GRADIENT`) and `:30` (`SectionRule`) | YES, the value is exact. But there is NO single deciding line: `<SectionRule/>` is hand-mounted at 31 call sites in 16 files, so every card decides for itself |
| 3 Absence strings | `fsi-app/src/components/ui/ListRow.tsx:532` (impact cell) and `fsi-app/src/components/ui/ListRow.tsx:542-543` (date cell) | NO. Both pass the WIDE `Absence` variant into a track ~85 px across. The narrow variant exists and is applied only at `ListRow.tsx:556` (tier) |
| 5 Overflow control | `fsi-app/src/components/regulations/PriorityDropdown.tsx:222-236` (the bordered circle) vs `fsi-app/src/components/ui/RowTable.tsx:280-319` (the bare glyph) | SPLIT. `RowTable.tsx` is exactly right; `PriorityDropdown.tsx` is the bordered circle and is what every list row mounts |
| 6 Kind chip | `fsi-app/src/components/ui/Chips.tsx:101-120` (`TagChip`) | Border: YES, there is none. Every other stated value: NO (see the item-6 section) |
| 10 Nav footer | `fsi-app/src/components/Sidebar.tsx:250-321` (`footer()`) | NO. It renders ONE combined row. In flight: lane `communitynav2` |

---

## Item 2: card top rule

Design value, verbatim from `Caros Ledge UI System.dc.html`:
`height:3px;background:linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))`, first child
inside the card's border and radius. Band blocks instead carry a 3px solid band-coloured top
border. Artboard 03 was opened: every section card and every rail card on the detail page carries
the dark rule at its top edge. Artboard 11 was opened: WATCHED, RECALCULATION NOTICES, SHARE WITH
WORKSPACE and LEGEND all carry it.

The measurement counts a card as any visible element with border-radius >= 8, a border or shadow,
at least 180 x 48, holding content. It is satisfied by a 3px full-width gradient strip painted at
the card's top edge AT ANY DEPTH (`DetailShell` wraps its rule in an absolutely positioned div, so
a first-child-only check gives a false pass), or by the 3px band-coloured top border.

Excluded from the count, each after opening the artboard that governs it:

- The section-index strip (`S1 Summary · S2 ...`). Artboard 03 draws it with no rule.
- The five inner price tiles on `/market`. Artboard 04 draws them inside the HEADLINE SERIES card
  with a plain 1px border and no rule.
- The onboarding preview panel. Artboard 17 draws it with no rule.
- `li.cl-row-card` on `/watchlist` (4 of them). A row is not a card. Separately noted below.

Cards measured, and the ones with no rule:

| Route | Cards | With rule | Without | The cards without it |
|---|---|---|---|---|
| 01 | 5 | 5 | 0 | |
| 02 | 7 | 7 | 0 | |
| 03 | 16 | 12 | 3 | Owner & team; Connections; Affected lanes |
| 04 | 15 | 10 | 0 | (5 excluded inner price tiles) |
| 05 | 17 | 13 | 3 | Your notes; Affected lanes; Connections |
| 06 | 6 | 6 | 0 | |
| 07 | 12 | 10 | 1 | Connections |
| 08 | 7 | 7 | 0 | |
| 09 | 12 | 10 | 1 | Connections |
| 10 | 6 | 6 | 0 | |
| 11 | 9 | 5 | 0 | (4 excluded row cards) |
| 12 | 8 | 7 | 1 | Vertical groups |
| 13 | 6 | 5 | 1 | Companies |
| 14 | 6 | 5 | 1 | Sectors followed |
| 15 | 14 | 12 | 1 | Help centre pending |
| 16 | 0 | 0 | 0 | |
| 17 | 1 | 0 | 0 | (1 excluded preview panel) |

**This is the per-page-patch signature, and it is the most valuable line in this report.** The part
is CORRECT where it is defined. On `/regulations/[id]` 12 of 16 cards carry it and 3 do not; on
`/community`, `/admin`, `/profile` and `/settings` exactly ONE card on each page was missed while
every other card on the same page has it. That is not a part that is broken, it is a part that was
applied card by card by different lanes, and the cards each lane did not happen to touch were left
behind.

The misses share a mechanical tell [CONFIRMED]: they are written against the OLDER token family.
`fsi-app/src/components/shell/ItemConnectionsCard.tsx:57-62` and
`fsi-app/src/components/regulations/OwnerTeamCard.tsx:92-96` use
`border: 1px solid var(--border-sub)` with `borderRadius: var(--r-md)`, while every card that DOES
carry the rule uses `var(--line-1)` with `var(--radius-card)`. `--border-sub` resolves to
`--line-3` = `rgba(0,0,0,.06)` (`fsi-app/src/app/theme.css:235`, `:50`), so those cards also draw
the wrong border colour: the design states `rgba(0,0,0,.12)`, which is `--line-1`
(`theme.css:48`). A sweep by token family finds the rest of the set without guessing.

Defect exposed, not fixed here: `ItemConnectionsCard` and `OwnerTeamCard` (and the community,
admin, account and settings rail cards named above) need `<SectionRule/>` and the `--line-1` /
`--radius-card` token pair. A shared card wrapper would end the class; 31 hand-mounted call sites
in 16 files is why this keeps recurring.

Separate deviation, named not fixed: `/watchlist` renders each watched row as its own
`li.cl-row-card` (1028 x 95, radius, border, shadow). Artboard 11 draws those rows as plain rows
inside the one WATCHED card, with no per-row card at all.

## Item 3: absence strings

**The image and the item's prose disagree, and the image wins.** The item states the rule as "em
dash in the value slot ... the reason word only in the title cell's meta line in small caps". The
system sheet (artboard 00) ABSENCE panel draws the opposite for a wide key/value slot: `Penalty
rate → NOT IN PRIMARY SOURCE`, `Δ1m → BACKFILL PENDING`, `Lane exposure → CONNECT SHIPMENT DATA`,
each small-caps reason sitting exactly WHERE THE VALUE WOULD BE, with the caption "A small-caps
reason from a fixed vocabulary sits where the value would". Artboard 03 draws the same thing in the
detail rail (`CONNECT SHIPMENT DATA`, `NOT RECORDED`). The same sheet's LIST ROW panel draws the
unscored row with hollow bars and an em dash in the score, date and timeline cells and states
"Unscored — no NOT SCORED text anywhere".

So the governing rule is the product's own, and it is a property of the CELL, not of the page: a
narrow fixed track gets the dash; a wide slot gets the small-caps reason
(`fsi-app/src/components/ui/Absence.tsx:70-107`). Measured against that rule:

| Route | Rendered absence tokens | Verdict |
|---|---|---|
| 01 | 1 narrow, em dash, tier cell 40px | ABSENT |
| 02 | none (16 rows, 0 unscored in fixture) | ABSENT, see caveat |
| 03 | `PENDING` in a 243px slot, `NOT IN PRIMARY SOURCE` in a 266px slot | ABSENT |
| 04 | **16 x `PENDING` inside `.cl-impact-unscored`, the IMPACT METER cell, 88px** | **PRESENT** |
| 05 | 3 tokens, all in 243-266px slots | ABSENT |
| 06 | **5 x `PENDING` in the 88px meter cell, 8 x `PENDING` in `.cl-row-due`, the DATE cell, 84px** | **PRESENT** |
| 07 | 3 tokens, all in 243-266px slots | ABSENT |
| 08 | **11 x `PENDING` in the 88px meter cell** (its matrix `td` cells correctly draw the dash) | **PRESENT** |
| 09 | 3 tokens, all in 243-266px slots | ABSENT |
| 10, 11, 15, 16, 17 | none | ABSENT |
| 12 | 3 x `CONNECT DATA` in a 356px slot | ABSENT |
| 13 | 1 x `PENDING` in a 417px slot | ABSENT |
| 14 | 1 x `CONNECT DATA` in a 367px slot | ABSENT |

Deciding lines. `fsi-app/src/components/ui/ListRow.tsx:532` passes the row's reason into
`ImpactMeter`, which renders `<Absence reason={reason}/>` at
`fsi-app/src/components/ui/ImpactMeter.tsx:113`, the WIDE variant, into an 88px column. The same
file's `:542-543` renders `<Absence reason={rowAbsence}/>` into the 84px `.cl-row-due` cell. The
narrow variant is applied at `:556`, to the tier cell only. The part knows the rule; two of the
three cells that need it do not call it.

Caveat, stated so the ABSENT cells are not over-read: `/regulations` and `/watchlist` show 0
unscored rows in their compose fixtures, so their ABSENT is the fixture's, not the part's. Both
mount the same `ListRow`, so a row with a missing impact score on either route would render
`PENDING` in the 88px meter cell exactly as `/market` does. [HYPOTHESIS], unverified: no mount on
this base renders an unscored row for those two routes.

## Item 5: overflow control

Design value, verbatim from the dc.html row markup:
`border-left:1px solid rgba(0,0,0,.08);height:32px;padding-left:6px` on the cell, then
`width:28px;height:28px;border-radius:6px;color:#7A6E6C` on a bare `⋯`. No border on the glyph.
Confirmed in the system sheet and in artboard 11.

There are TWO implementations of this one part on this base, and they disagree:

| | Correct part | Defect part |
|---|---|---|
| File | `fsi-app/src/components/ui/RowTable.tsx:280-319` | `fsi-app/src/components/regulations/PriorityDropdown.tsx:222-236` |
| Button | 44x44, `border: none` | 44x44, `border: 1px solid var(--color-border)`, `borderRadius: 999` |
| Measured border | `0px none` | `1px solid rgba(0,0,0,0.12)`, radius `999px` |
| Glyph colour | `rgb(122,110,108)` = `#7A6E6C` | `rgb(90,107,103)` = `#5A6B67` |
| Glyph box | 28 x 28, radius 6 | none, 14px type centred in the circle |
| Left divider | 1.0 x 32 span, `var(--line-2)` = `rgba(0,0,0,.08)` | NONE |
| Routes | 12, 13, 14 | 02, 03, 04, 06, 08, 11 |

Measured counts of the bordered circle: 16 on `/regulations`, 16 on `/market`, 13 on `/research`,
11 on `/operations`, 6 on `/watchlist`, 1 on `/regulations/[id]`. Every list row on all five list
surfaces mounts `PriorityDropdown` as its `overflow` prop, so the defect is on every row of every
list.

**This is the second per-page patch, and it is worse than a miss.** The part was rebuilt correctly
in `RowTable.tsx` down to the 1px x 32px divider and the 28px box, and the surfaces that use
`RowTable` (community, admin, account) render it exactly right. The five list surfaces were never
moved onto it and still mount a control that predates the design: a bordered pill at
`border-radius: 999`, in the wrong ink, with no divider at all. Two parts, one design object.

Defect exposed, not fixed here: `PriorityDropdown`'s trigger must become `RowTable.tsx`'s trigger.
Its own comment at `PriorityDropdown.tsx:211-215` documents the 44x44 growth for the law-2 floor
and never revisited the border.

## Item 6: kind chip

Design value, verbatim from the dc.html row meta line:
`padding:1px 6px;border-radius:3px;background:#F5F2EE;font-weight:700;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#1A1A1A`,
with no border, followed by the meta words as plain `font-size:11px;color:#7A6E6C`. Confirmed on
the system sheet chips panel ("COST ALERT", "OCEAN", caption "Kind, mode and topic are neutral
tags") and in the list row panel's meta line "Regulation · Ocean · emissions".

**The stated present-defect is a border, and there is none on any route.** Item 6 is ABSENT on all
17. The chip is `TagChip`, `fsi-app/src/components/ui/Chips.tsx:101-120`, measured on
`/market` (16 chips) and `/research` (13 chips): `border: none`, background `rgb(245,242,238)` =
`#F5F2EE`. The meta words beside it measure `var(--fs-11)` at `var(--ink-3)`, plain text, not
chips, at `ListRow.tsx:658-681`. Both halves of the stated rule hold.

Defect exposed, not fixed here, and NOT what the item asked about: the chip matches the WRONG one
of the design's two neutral chips. The design source carries a 10.5px/600/.04em variant (19
occurrences) and a 9.5px/700/.06em variant (16 occurrences); the row meta line is drawn with the
9.5px one, and `TagChip` is the 10.5px one. Measured against the row-meta design value:

| Property | Design | Measured | |
|---|---|---|---|
| border | none | none | MATCH |
| background | `#F5F2EE` | `rgb(245,242,238)` | MATCH |
| font-size | 9.5px | 10.5px | MISMATCH |
| font-weight | 700 | 600 | MISMATCH |
| letter-spacing | .06em (0.57px) | 0.42px (.04em) | MISMATCH |
| border-radius | 3px | 4px | MISMATCH |
| padding | 1px 6px | 3px 8px | MISMATCH |
| colour | `#1A1A1A` | `rgb(90,107,103)` = `#5A6B67` | MISMATCH |

Note the item's own prose says `padding 2px 6px`; the design source says `padding:1px 6px`. The
source markup is followed here.

## Item 10: nav footer

Artboard 00's frame panel and every page artboard draw TWO footer rows: `Account` with the
workspace name right-aligned and muted (`Dietl / Rockit`, wrapping to two lines), then `Admin` with
a bordered `OWNER` badge right-aligned.

The base renders ONE combined row on every route that has a nav. Measured: the footer block holds
exactly 1 visible child; its rendered text is `audit—` (the stub user plus the org fallback dash)
on routes 01, 03, 05, 07, 09, 10, 12, 13; `auditDietl / Rockit` on routes 14 and 15 where the
account fixture supplies an org name. No `Admin` row anywhere in the footer. No `OWNER` badge
anywhere on any route.

Deciding line: `fsi-app/src/components/Sidebar.tsx:250` (`const footer = (variant) => ...`), one
implementation shared by the desktop card and the mobile drawer. Its own header comment at
`:236-247` cites a 2026-09-07 operator ruling as SUPERSEDING the two-row footer. That comment and
artboard 00 disagree; the image is the spec, and the image shows two rows.

`NO MOUNT` on routes 02, 04, 06, 08 and 11: their compose mounts render the ledger only, with no
`AppShell` and therefore no `Sidebar`. The nav is one shared part, so the state measured on the ten
routes that do mount it is the state those five would show; that is stated as an inference, not a
measurement. `N/A` on 16 and 17: artboards 16 and 17 draw the auth frame with no nav at all, and
the product agrees.

**In flight.** Lane `communitynav2` is reported to be fixing this now. Everything above is the base
`train/wave61-2026-09-08` state and will be stale the moment that lane lands.

## Mount coverage

Every one of the 17 routes has a mount. No route needed to be reported as unmeasurable for items
2, 3, 5 or 6. Mounts used: `page-frame-1440` (scoped by `[data-audit="dashboard"]` and
`[data-audit="regulation-detail"]` for routes 01 and 03), `compose-02-regulations`,
`compose-04-market`, `market-detail-1440`, `compose-06-research`, `research-detail-1440`,
`compose-08-operations`, `operations-detail-1440`, `compose-map`, `compose-11-watchlist`,
`compose-community`, `compose-admin`, `compose-account`, `compose-settings`, `compose-login`,
`compose-onboarding`.
