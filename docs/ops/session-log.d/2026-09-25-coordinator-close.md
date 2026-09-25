# 2026-09-25  -  Coordinator close: rulings R1-R13, state, design changes owed, bugs

Session close. Operator is ending the session to save tokens (rule 11). This entry plus
`docs/plans/build-plan-2026-09-25.md` is the resume state; nothing here is meant to be re-derived by
the next session by reading the operator's own words twice  -  read this once, then act.

## How the build is run (operator-stated, binding)

This section is the process contract for every future session on this thread. Cited rule numbers exist
where a standing rule already covers the point; otherwise it is new as of this close.

1. **The coordinator coordinates only.** Sub-agents do the work  -  Sonnet for implementation and
   research, Haiku for mechanical work (pushes, extraction, verification passes). No Opus sub-agents.
   No research fan-outs without the operator's explicit go.
2. **Sub-agents never decide how the work is done when there is a question**  -  scope, design, a
   conflict with a doc, a choice between approaches. They send the question to the coordinator
   (SendMessage to "main") and wait. The coordinator decides; anything only the operator can decide goes
   to the operator. Routine execution inside the brief is the agent's own call. (Matches the lane
   contract already in `docs/plans/complete-system-build-plan-2026-09-04.md` section 6.1: "a lane that
   meets a problem the brief does not address... STOPS... does not work around it.")
3. **"Don't waste tokens"** (rule 11): short coordinator replies; no replies to routine background
   notices; one or two lanes at a time; reuse cached results; read narrowly; never re-derive what the
   vault already says  -  read specs 00-10 and ADRs before researching a question the vault already
   answers.
4. **Examples are not scope** (rule 19, this close). **Look vs. system** (rule 20, this close):
   artboards govern look; structure and function are ruled in conversation; divergences become
   DESIGN CHANGES OWED entries, never silently absorbed into the artboard.
5. **Lanes work in their own worktrees** (rule 7, RD-19). One writer per file. Lanes write session
   notes to `docs/ops/session-log.d/`, never to `session-log.md` (rule 6, F51). A fresh worktree needs
   `npm ci` in `fsi-app` before gates or push.
6. **Gates per lane**, each starting only when the node.exe count is ≤ 3: the rendering guard (x2 for
   surface work), the npm suite, `tsc`, the full fitness runner, restore `coverage-report.json`, the
   locked `lane-prepush-check.sh`. Priority order when lanes contend for the machine. Never `taskkill`
   all node processes (it happened this session  -  do not repeat it). Never `--no-verify`.
7. **The coordinator merges** ("you merge not me"  -  operator, verbatim): squash-merge once CI is
   green. The operator signs off artboard compares route by route, via the dual-site harness: same
   Supabase project, auth-asserted per route, one run, both sites, a 3-panel live | branch | artboard
   view, the harness copy kept out of commits, the guard suppression count unchanged.
8. **Database: SELECT-first.** Writes only from coordinator-approved statements, never self-directed
   (memory: DB agents edit with approval; rule 8 on standing rules re: never hand-editing published
   rows).
9. **No human in the runtime process** (rule 20 of R8.6c below / RD-20): humans approve methods and
   rules, never step into evaluation itself.
10. **Handoffs must lose nothing.** Every correction and ruling goes into the vault at the moment it is
    made, not only at close. Operator, verbatim: "we do a minimal amount of work and then you say hand
    off then I spend half the new session explaining what you're doing wrong." This close entry and the
    build plan exist specifically to stop that pattern recurring.
11. **Build mode:** scrape cadence off (rule 16); no paid research during the build (decision 6a below).
12. **Verification:** every finding carries `[CONFIRMED]` / `[HYPOTHESIS]` / `[REFUTED]` (rule 14); a
    flag is work, fixed in the same motion or delivered decision-ready (rule 13); a proof must execute,
    a guard is proven by attack (rule 15).

## Operator rulings, 2026-09-24/25 (verbatim quotes as marked; rest is faithful coordinator summary)

**R1  -  Artboards govern LOOK only.** "we are matching artboards for layout and design, not for how we
build the site as a system"; "the artboard is done by claude design which only designs the look, we
design the tools and the functions"; "if you ever have a part of this build that doesnt match the
design, then we need to change the design to fit those systems and tools." Structure/function
divergences go to a DESIGN CHANGES OWED list for the operator (see below).

**R2  -  Examples are not scope.** The Operations page was built around one example: "we have a whole
page built to ONE idea i thought of"; "It's not about automate and hire. That's one item." Tariffs:
"Tariffs and trade were an example of future structure"; "an example of how this system can be used in
the future." Decision 5 APPROVED: examples in specs/briefs are marked illustrative; each section states
the full question plus a coverage test beyond the example; lane reports confirm generalization; a
discipline check flags examples without a coverage requirement; added to CLAUDE.md standing rules as
rule 19.

**R3  -  The product question for every surface and item.** "What's happening in this industry and how
does it affect me"; "How do all of these things affect the choices I make as a business and what do I
do to meet regulations and where do I invest or not."

**R4  -  Data is not yet populated, by design, and that is not a gap.** "this is NOT an estimate to the
regulations missing. It's how that data is managed." Coverage counts are not gaps; data MANAGEMENT
(structure, connection, classification, turning facts into answers) is the work.

**R5  -  Multi-industry, per ADR-034 (merged today, #799).** Role-based users (any organisation shipping
or affected  -  museums, SMEs, etc.), organisation size as a dimension, an "on behalf of many" aggregate
mode (governments/associations, illustrations only), plain language. Open items: reconcile population
thresholds N≥10 (this close) vs. spec-07 ≥5/25% (community benchmark, spec 07 line ~360); the
public-sector framework is undesigned.

**R6  -  Process.** "you need to be running sub agents to do all the work and have them come to you for
answers ... sonnet and haiku"; "sub agents do not decide how the work is done if theres a question, you
do"; "dont waste tokens"; operator frustration on lossy handoffs (quoted above, rule 10 of "How the
build is run").

**R7  -  Admin.** "admin only needs one access point": the Sidebar footer row. Done, PR #796, with a
test.

**R8  -  Decisions:**
  1. No freight-rate tracking. "people already have systems for this and it changes so often without
     an api from their systems this is too much work and not what our system should focus on." Market
     Intel's differentiator becomes carbon cost per container/tonne on its own terms.
  2. EUA: carrier-published ETS surcharges as a labelled proxy, per carrier/period/source, never
     blended without a range; client override labelled client-supplied; EEX licence deferred.
  3. ADR-034 merged.
  4. Research assessment model: DESIGN now, BUILD after the four-question structure lands.
  5. See R2.
  6a. No paid research during the build. "we do NOT pay during the build, this has already been fixed
      in the build."
  6b. Conclusions stored separately from calculated values (`inference_record`).
  6c. "for reliability scores we want approval from humans on how these function but not in the process
      of evaluating ... a human intervention is a hindrance and a stopping point in the system." The
      operator approves the scoring METHOD; scoring runs autonomously (RD-20). Tiers are never touched
      (rule 18); reliability is a separate score.
  7. Community: "a room can and should know who you are when you talking. unless you choose to be
     annonymous"; "the point ... is to share where you are and what you're doing, if it doesnt have
     context and you cant trust the sources whats the point, but people can be anonymous if they choose
     in a post or as a user." Identity is shown by default; anonymity is opt-in per post or per user; an
     anonymous post keeps a verified-member marker; the antitrust posting guard stays; fix the composer
     (400 without `entity_ids`). **This supersedes spec 07's opposite default** (spec 07 Community
     section, "1. Your profile as others see it... Not your name, not your company"  -  now amended, see
     Deliverable E below).

**R9  -  Detail-page rulings, 2026-09-25 (all detail pages with obligations):**
  - The priority dropdown is the last control in the masthead action row before ⋯, in the row's button
    style, and never changes the band colour.
  - The upcoming-obligations strip is removed; obligations become labelled timeline markers; the
    callout names the next obligation plus days left; show the next 4 then "+N more" jumping to the
    obligation register; the rail stays as artboard 03.
  - Ruling 2 (2026-09-24) stands over artboard 09: the Market/Research/Operations index is
    S1/S2/S5/S6 with content sections as S2 sub-sections ("Pending changes" → "Upcoming changes").
    Regulations keeps its own index; obligations are the timeline, and the register is the "+N more"
    target.

**R10  -  The learning loop.** "respond in real time to industry news ... its not just taking information
it then reaching out to find answers and make conclusions based on that new data, the site grows and
learns" (the BYD/fast-charger case is an illustration only, per R2). Build per
`docs/plans/learning-loop-design-2026-09-25.md` (preserved this close, Deliverable B), under the
build-mode cadence (rule 16) and no-pay (decision 6a).

**R11  -  Competitive floor.** Free vendor content (Greenly's PPWR explainer, used as a sales tool) and
free news (ESG Today) are the floor: "if we cant do better than them at this then theres a problem";
"if our clients could just get this and be fine then we have a problem."

**R12  -  Nav label.** Must be "Market Intel". The rename to "Market" in #604 was never approved.

**R13  -  Supabase requirement for the next session.** Tables and items must not duplicate; everything
must be clean, functional and wired. "past problems saw unfinished builds and unwired sections that
were just dead."

## State at close

- **Merged today:** #796 (identity retry + one admin entry), #797 (sign-in title + RD-82 guard), #798
  (id-redirect resolver + emit audit), #799 (ADR-034).
- **Open:** #800 (`lane/parity-parts`, worktree `.claude/worktrees/agent-a5509a6c592b1ef4d`). PARKED:
  built to the OLD artboards; needs a LOOK-ONLY pass against the new boards. A second artboards PR
  (branch `coord/artboards-2026-09-25`, re-exported boards 00/03/04/05/06/07/09 plus README/canvas) was
  being opened by another agent as of close  -  check `gh pr list` first thing next session.
- **New boards change:** the connections strip moves into the masthead card (03/07/09); the rail
  Connections card is removed; the absence rule is now "a value that exists is shown; one that cannot
  exist yet names the data it needs" (e.g. "needs 4 price inputs →"). This REVERSES #800's "renders
  nothing" behaviour  -  #800's look pass must correct this, not just re-skin.
- **Look-only fixes owed on #800** (operator's notes): band tag on every fact card should appear once,
  in the masthead, not per-card; the SCOPE wrapper is still present and needs removing; sections lost
  their card treatment (3px top rule); the Sources table is squeezed on Operations; confirm the stepped
  meter renders correctly; connections strip styling; absence wording per the new rule above.
- **Known bugs:**
  - A raw text/JSON-like dump mid-page on the Market detail page (reproduces live and on branch)  -  a
    data/rendering bug that needs its own lane, `[HYPOTHESIS]` pending a lane's repro (rule 14).
  - Items with "do now" prose but empty `recommended_actions`  -  structured actions must be extracted by
    the pipeline, not left as prose-only.
  - Regulation `d2da85da` is quarantined with 6 open flags  -  sits in the research-or-erase queue.
- **Memory feedback saved:** examples-are-not-scope, system-drives-design (both now also codified as
  CLAUDE.md rules 19/20  -  see Deliverable D).
- **Next free ids:** RD-82 and RD-84 are used; RD-83 and RD-85-90 were released; F57 is used. Check the
  board before claiming a new id.

## Design changes owed (for Claude Design  -  R1's escape valve)

1. Artboard 09: S1/S2/S5/S6 with content as S2 sub-sections; "Upcoming changes" label (R9, ruling 2).
2. Artboard 03: obligations as timeline markers plus the register link, no separate "Timeline by
   deadline" section (R9).
3. Artboards 03/05/07/09: the priority dropdown belongs in the action row, last control before ⋯, same
   button style, never changes band colour (R9).
4. Artboard 04: the carbon-cost card with no rate slot  -  carbon per container/tonne, ETS proxy, client
   override (R8.1, R8.2).
5. Artboard 12: Community identity-by-default plus the anonymity option, replacing the
   anonymous-by-default layout (R8.7).

## Decisions table (quick reference)

| # | Decision | Status |
|---|---|---|
| 1 | No freight-rate tracking; carbon cost/container/tonne is the differentiator | APPROVED |
| 2 | ETS surcharge as labelled carrier proxy, never blended, client override labelled | APPROVED |
| 3 | ADR-034 multi-industry core | MERGED (#799) |
| 4 | Research assessment model | DESIGN now, BUILD after four-question structure |
| 5 | Examples are not scope (mechanics) | APPROVED, codified as rule 19 |
| 6a | No paid research during build | APPROVED (already fixed in build) |
| 6b | `inference_record` separate from calculated values | APPROVED |
| 6c | Human approves scoring method, not the evaluation loop | APPROVED (RD-20) |
| 7 | Community identity-by-default, anonymity opt-in | APPROVED, supersedes spec 07 (Deliverable E) |

## Preserved scratchpad inputs (Deliverable B)

Four reports existed only in the session scratchpad (ephemeral, would be lost at session end). Moved
into the repo this close:

- `docs/archive/logs/intent-vs-live-and-competition-2026-09-24.md`  -  intent vs. live behaviour and
  competitive-floor read (feeds R11).
- `docs/archive/logs/whats-happening-and-how-it-affects-me-2026-09-24.md`  -  the R3 product-question
  read against current surfaces.
- `docs/archive/logs/versatility-audit-2026-09-24.md`  -  cross-industry versatility read (feeds R5 /
  ADR-034). Filed to `archive/logs/` rather than `docs/audits/` because its findings are not individually
  `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]`-labeled per rule 14 / `scripts/verify/audit-finding-status.mjs`;
  treat every claim in it as `[HYPOTHESIS]` until a lane re-verifies it.
- `docs/plans/learning-loop-design-2026-09-25.md`  -  the learning-loop design (R10), given its own
  INDEX line as a living plan doc (not archived: it is forward-looking, not a point-in-time report).

## Forward pointer

The forward build plan, the Supabase integrity-and-wiring audit lane spec, and the integration table
against the existing build plan are in `docs/plans/build-plan-2026-09-25.md` (Deliverable C). Read that
next, in the load order given in the new-session start message below.
