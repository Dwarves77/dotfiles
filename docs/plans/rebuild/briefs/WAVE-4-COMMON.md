# Wave 4 common rules (surfaces P2-10 to P2-14; WAVE-2-COMMON.md and its addenda still apply)

Start after P2-09 (ui kit, shell, list surface, parity gate) and P2-08 (turn, harness, wiring) are on main. Imports: every merged
slice. Read first: WHY-2026-10-16.md; docs/design/ux-laws.md and design-principles.md; the kit's exports as merged (src/ui,
src/ui/shell, src/ui/list-surface, src/core/lists, src/features/lists) and the detail architecture once P2-10 lands it (src/core/
detail, src/ui/detail); P2-01..08's real exports for every read you make (one query kit, one guard family, one routing table).

ONE SYSTEM (operator 2026-10-16): a surface slice renders what the machine wrote. Its proof is P2-08's end-to-end fixture turn
extended with the surface's reader: the page is rendered from that turn's output and asserted to show it (the item the turn minted,
the derived value it propagated, the obligation it derived, the source rating of the capture it stored). Seeding rows by hand for
the proof is forbidden; a page-local engine (a reader of a table no machine stage writes, a computation that belongs to a stage)
fails the connection check in CI. Every reader is one of: the shared list read (src/features/lists), the shared detail load
(src/core/detail), or a per-surface reader of 100 to 300 lines on the query kit, named in the report with the tables it reads.

DESIGN: the page matches the parity baseline for its routes (structure, order, controls, row heights at 375) and the artboards;
better data, fewer requests, correct values and fixed defects pass; a look change without a ruling fails the parity job. What the
system needs and the artboard does not show is built to the system and listed on DESIGN CHANGES OWED with the artboard number
(BUILD-PLAN ruling 10 already owes: the five unrendered fact-document sections, the 40 px matrix cells, artboard 04's sparkline and
YoY, the headline-row scroller). Every control meets law 2 (44 px, or 24 px with 8 px clearance). Accordions and disclosures closed
by default. No wall-clock read in render: `nowIso` comes from one server instant per request.

INTEGRITY ON EVERY PAGE: a figure shows its source's rating (customerTierOf through the one reader; INV-213, INV-262); a failed read
renders a failure note with Retry, never an empty list or a zero (INV-263); "pending", "unscored" and "not scored" never render
(Absence with its reason); no customer string names an internal mechanism, table or code; no fabricated date or count.

ROUTES: thin: each src/app route calls one feature function. Old URLs kept. API routes behind requireUser (BUILD-PLAN ruling 3)
except the documented public ones. Persona matrix for every handler.

LANDING: as WAVE-2-COMMON.md, plus: the parity result per route in the report, the DESIGN CHANGES OWED list, the connection check
green, and the integration-proof extension named (test file and the assertions added).
