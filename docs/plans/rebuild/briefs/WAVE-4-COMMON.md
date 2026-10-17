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

ADDENDUM 2026-10-16 (wave 4 launch; main after P2-08 ac27656f and P2-02b):
- THE KIT AS IT EXISTS (import from "@/ui" and "@/ui/shell"; read src/ui/index.ts, src/ui/shell/index.ts and
  src/ui/list-surface/ before writing a part; a part that exists is reused, never redrawn): Absence, ActionCard, ActionRow,
  ActionButton, ErrorState, InlineErrorBanner, SystemErrorBanner, BandTile, BandTileRow, BandGroupHeader, BandGradientRule,
  BiasChips, BiasLegend, Button, BandChip, FilterChip, FilterChipGroup, GradeChip, TagChip, TierChip, WorkspaceTagPill,
  FactCard, ClaimTierProvider, CoverageState, Dialog, GfmSection, ImpactMeter, ItemGroup, DetailSubSection,
  MoreBelowDisclosure, ListRow, ListRowHeader, Masthead, Menu, MilestoneTimeline, RelativeTime, RowTable, RowTableAction,
  SectionCard, SectionHead, SectionIndex, SummaryDepthSwitch, SectionLabel, Skeleton*, RailCard, CardFoot, SourceLink,
  FilePickRow, StatBlock, StateNote, EmptyState, BandProvider, TabRow, Timeline, Toast, WatchToggle; forms from P2-02b:
  FormField, Input, Textarea, Select, Switch, Segmented, ChoiceChip, FormCard (src/ui/FormField.tsx); shell: AppShell,
  PageFrame, Providers, CommandBar, Sheet, BackToTop, ScrollContainer, useBootstrap, useUnreadCount, useAdminAttention,
  UserMenu. Every control is at least 44 px on its short axis (operator standard 2026-10-16); an artboard drawing less is
  built at 44 and recorded on DESIGN CHANGES OWED.
- PARITY, how a surface lands: the capture (P2-CI2) signs in as the member account and captures every route; a route in
  approved-changes.json `gates.frame` proves only the shell (controls, headings and `frameLandmarks` scoped); when your
  slice builds a route you MOVE it from gates.frame to gates.full in the same PR, and the compare then checks the full
  structure (controls, headings, landmarks, row heights at 375) against tests/parity/baseline. A detail route is discovered
  from the first matching link on its list page; the discovery runs as soon as the list route is in gates.full, so the list
  slice moves its detail route out of "skipped" by landing. Pixel waivers cite look rulings only (44 px, rule 2). A route
  that navigates more than three times fails the capture (loop ceiling). The member account has a workspace; the admin
  routes capture only on the deployed preview (P2-15).
- ASSIGNED IMPROVEMENTS: P2-10 builds IMP-064 (saved views: PERSONAL PER USER, operator ruling 2026-10-16;
  table with RLS, one route, list url-state) and IMP-068 (PageFailure into the shell, every server page offers Retry);
  P2-14 builds IMP-060 (fixtures page into the admin parts gallery behind the admin guard) and IMP-069 (community profile
  policy imports core/workspace/vocabulary.ts). nav_counts: P2-08 wired the shell's counts through the turn's deps; a
  surface that owns a count registers it there, never a second poll.
- The identity route is limited per user (never per IP) and answers anonymous requests without a database call; the shell
  never reloads the document on an auth event (auth-events.ts). Do not add a reload, a poll, or a second identity fetch.

ADDENDUM 2026-10-17 (from P2-10's parity red): production carries NO new migration until the cutover window (ruling: the
database untouched), and the parity job reads production. Therefore every surface renders a STATED degraded state when an
object its own migration adds (table, view, policy, rpc) is absent: the read fails closed into its named block with Retry
(INV-263 class), every control and link still exists (a count beside it is the Absence token), and the page never throws.
Parity proves exactly that path on production; the new-object path is proven on the fixture turn and `schema:local`. A
red-first test with a fake client refusing the new object's read is part of every slice that ships a migration.
