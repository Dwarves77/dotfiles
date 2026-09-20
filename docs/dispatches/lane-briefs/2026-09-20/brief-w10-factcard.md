# Lane W10-FactCard: the fact card, v2, one part, every call site (parts brief 2.1, artboard 21c)

Coordinator brief, 2026-09-20. Executor: Sonnet. Lane id `w10-factcard`. First of the part lanes (plan 6.4, parts brief 1.4). Worktree and branch are in your dispatch message; base `origin/master` at or after `1a81780c` (the design bundle must be in your tree: `docs/design/handoff-2026-09-07/screens/21-detail-parts.png`; if it is not, STOP).

## Read first, in this order, and nothing else until a step names it

1. `docs/dispatches/lane-briefs/2026-09-19/brief-common-local.md` (Amendment 1 wins over its body) and `docs/dispatches/lane-common-contract.md`.
2. `docs/design/ux-laws.md` and `docs/design/design-principles.md` (binding before any `.tsx` or `.css`; your session-log file carries a "UX compliance" block or CI fails the PR).
3. `docs/design/parts-brief-2026-09-18.md` sections 1 and 2.1 ONLY (lines 36 to 92). The operator's words; they govern.
4. `docs/design/handoff-2026-09-07/README.md`: "Fact card, v2", "Item group header" (context only: ItemGroup is the NEXT lane, not yours), the tokens block, and "Undrawn cases, rulings 2026-09-20" number 4.
5. The picture: `docs/design/handoff-2026-09-07/screens/21-detail-parts.png`, panel 21c. Open it ONCE with the Read tool. The artboard wins over the README where they disagree; report any disagreement, do not pick silently.
6. `docs/design/parts-inventory.md` row "2.1 FactCard" (one row).

FIRST tool call: the Skill tool `fsi-app:environmental-policy-and-innovation` (your parsing work may touch governed paths; one call now is cheaper than a denial later). Then `frontend-design` if the Skill tool lists it.

## State of the code [from the inventory row, CONFIRMED there; verify each path exists before relying on it]

A v1 part exists: `fsi-app/src/components/ui/FactCard.tsx` (three variants: sourced, inference, counsel), reached through `src/components/detail/primitives.tsx` (`RecordFactCard`, regulations) and `src/components/detail/FactBlocks.tsx` (`parseFactParagraphs`; market, research, operations), plus the operations matrix panel (`src/components/operations/RegionDimensionMatrix.tsx`). Against 2.1 it lacks: the kind band, the fixed kind vocabulary, the 132 / 1fr / 150 body grid, the Anton 22 figure lead, the provenance COLUMN (it is a bottom row today), and the edge is 2px, not 3px.

Measured on production today (`https://carosledge.com`, sha `6d9d139c`, a read-only audit) [CONFIRMED by DOM read]: on the EU ETS maritime regulation detail and on a market detail, fact content reaches the DOM as plain paragraphs with literal markdown (`**Cause:**`, `*Operational implication:*`) and raw URLs in running text (`*Source: ... https://...`). [HYPOTHESIS] the auditor concluded "FactCard absent" from class names; the inventory says the part is mounted. Your FIRST finding is which is true for those two pages and why (a fallback path that bypasses the parser? a brief format `parseFactParagraphs` does not recognise?). That cause is part of this lane: the brief's forbid is "Zero `*` in rendered text".

## What lands

1. **One model, one home.** A pure module (put it beside `FactBlocks.tsx`'s parser; extend that parser, do not write a second one: grep for every existing fact or paragraph parser first and name them in your report) that turns brief text into card models: `{ kind, qualifier, figureLead, figureSubLabel, claim (structured inline nodes: text, bold; NEVER an HTML string, NEVER markdown), provenance { tier, source, org, href, accessed } }`. Rules, all from 2.1's "Pipeline mapping":
   - the bolded lead-in (`**ACTION REQUIRED.**`) becomes the kind word; the fixed vocabulary is ACTION REQUIRED, LEGAL CONFIRMATION REQUIRED, DEADLINE, BASELINE TARGET, NATIONAL TARGET, SCOPE, PENALTY, DEFINITION, ANALYTICAL INFERENCE; an unknown lead-in maps to SCOPE;
   - a "Legal Confirmation Required:" or "Analytical inference:" sentence INSIDE a body splits into its own card;
   - `*Source: ...*` trailers and raw URLs leave the claim and become the provenance column (href on the link, host as text); a URL never appears in running text;
   - the figure lead is the first figure or date the claim itself bolds (or, where the record carries a structured value or operative date for the claim, that value: say which structured fields exist and whether you used them). ANALYTICAL INFERENCE has no lead. For an ACTION REQUIRED or LEGAL CONFIRMATION card with no figure, the lead is an instruction of at most three words: use the imperative verb the claim opens with if it opens with one ("Register", "Confirm", "Ask", "Budget", "File", "Request", "Map"); otherwise NO lead text. Count every card that ends with no lead and is not an inference, by kind, and report the count with three examples: that case is not drawn and goes to the operator; do not invent a lead.
   - no `*`, `**`, `#`, backtick or `[text](url)` survives into any node. Unit tests on the pure model: each rule above, the split, the unknown-lead-in case, and an attack fixture built from the two production pages' actual patterns named above.
2. **The part**, `src/components/ui/FactCard.tsx`, to 2.1 exactly: kind band (10.5px/800 .12em uppercase kind word, 10.5px `#7A6E6C` qualifier, padding 6px 14px, tint, 1px `rgba(0,0,0,.06)` rule below); body grid `132px 1fr 150px`, gap 14, padding 12px 14px; figure lead Anton 22 in the edge colour with a 10px uppercase .06em/700 muted sub-label; claim 13px/1.6, max 66ch, figures and dates bold; provenance column with a 1px left rule: tier square, source, org, link with the north-east arrow, accessed date, 10.5px muted, never a paragraph under the body; left edge 3px. Forms by kind: orange family (`#F97316` edge and kind word, `#FFF7ED` band); ink family (`#1A1A1A` edge and kind word, `#F5F2EE` band); inference (1px dashed `rgba(0,0,0,.3)` all round, band `#FAFAF8`, italic `#5A6B67` body, no lead, right column "not citable"). Semantic tokens only: if `theme.css` lacks a token for a value, add the token there (one token set; never a raw hex in a component). The v1 variant prop is REMOVED, not kept beside the new one: every call site moves in this lane (no two generations of one part).
3. **Mobile (artboard 20c)**: below 768 the card stacks (band, then lead, claim, provenance as a footer line); nothing clips at 375. F35 and the rendering guard measure at 375.
4. **Every call site** (ruling 4: the four details, the operations matrix panel, research findings; dashboard "What changed" is NOT a consumer and stays on ListRow): `RecordFactCard`, `FactBlocks`, `RegionDimensionMatrix`, and any other importer (`git grep -n "FactCard" -- fsi-app/src` from the repo root). F49 (parts, not pages) must stay green; no page gains literal part styles.
5. **Presence report** (brief 1: the done-state): a table `route, file, line` of every place the part renders, in your session-log file; and ONE fixture page or story that renders every kind and form at once (find how lane W10-A built its impact-meter fixture and reuse that mechanism; if none exists, a route under the existing dev-only fixtures path, never a customer route). Take one screenshot of the fixture at 1440 and one at 390 and name their paths: the operator signs off the PART from that picture.
6. `docs/design/parts-inventory.md`: update row 2.1 in place (dated); strike "dashboard What changed" from its consumers citing ruling 4.

## Out of scope: STOP, do not solve

ItemGroup, the group header and the ACTION strip (next lane). SectionHeader. The masthead. Any change to what the brief GENERATOR writes (`src/lib/agent/**`): if a rule above cannot be met at render time because the stored text lacks the information, STOP and say exactly what is missing; do not touch the generator. Any database write. Any data backfill.

## Standing constraints

Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in anything you write. Never `git stash`, `git add -A`, `--no-verify`. Accordions closed by default. 44px touch targets. A new test file in a directory the suite does not cover trips F23 until lane T3 merges: put tests beside code in already-covered directories (`src/lib/detail/`, `src/components/...` entries listed in `fsi-app/.discipline/run-test-suite.sh`), or report F23 as your only failure. A gate FAIL caused by your change: fix the cause, run once more; a second FAIL on the same step is a STOP.

## Gates and report

`npx tsc --noEmit`; `node --test` on touched tests; `node .discipline/fitness/runner.mjs` (F35, F45, F49 are the ones you can trip); the rendering guard's smoke slot if the contract requires registering the fixture; the override check; then the locked push gate once, last, as one background task. You commit; you do not push. Return as TEXT: commits, diff stat, the cause finding for the two production pages, the no-lead count with examples, the presence table, the two screenshot paths, gate summary lines, every STOP, the PR body, and a per-lane estimate for the NEXT part lane (ItemGroup with SectionHeader) based on what this one cost, labelled an estimate.
