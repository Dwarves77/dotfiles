# Lane briefs, 2026-09-05

This folder is the coordinator's record of how every Sonnet/Haiku lane and Workflow-tool
run this build day was briefed. Each file is source code, not documentation prose: it is
executed by the Workflow tool, which imports it as an ES module and calls the functions it
exports. Keeping these files committed (rather than deleting them once their lane finishes)
is the only durable record of the exact prompt an agent worked from, because the agent's own
chat transcript is not part of the repo and does not survive a container reset.

## The format

Every file exports:

- `export const meta = { name, description, phases: [{ title }] }` — `name` matches the
  filename (minus extension); `description` is a one-line summary of what the file dispatches,
  used verbatim as the "purpose" column in the index below; `phases` names the Workflow-tool
  phase(s) the file's `phase()` calls open.
- `phase('Title')` — opens a named phase in the Workflow tool's own UI/log. A file with more
  than one lane inside a single phase (most files) still calls `phase()` once; a file that
  runs lanes in sequence across distinct stages (rare in this set) calls it more than once.
- `agent(promptString, { label, phase, model })` — dispatches one agent. `label` is the
  short name shown in the Workflow tool's run log (matches the lane's own self-identification
  inside the prompt, e.g. `'HANDOFF'`, `'W7.1-CLOSE'`); `phase` matches the `phase()` title in
  scope; `model` is `'sonnet'` for a build lane doing real code/schema/test work, `'haiku'`
  for bulk classification, proposer passes, or drafting text a human/Sonnet lane will still
  gate (per the operator's ruling that Sonnet builds and Haiku does bulk text — see
  `handoff-2026-09-05.md` §3).
- A trailing `return { ... }` — the file's return value, keyed by short local names, one per
  `agent()` call. This is what the Workflow tool's caller receives back; it has no meaning
  beyond letting a multi-agent file report all its lanes' results together.

**At most two agents run concurrently per Workflow-tool invocation.** This is a measured
constraint (postscript 23: "the Workflow tool caps concurrent agents per workflow at this
container's CPU count (2)"), not a policy choice — a file that needs more than two lanes
dispatches them across more than one `agent()` call site or more than one file/run. The
two-agent files in this folder (`wave-a.js`, `wave-b.js`, ... `wave-f-1.js` through
`wave-f-6.js`, `wave-perf13-fededup.js`, `haiku-classify.js`, `haiku-classify-text.js`,
`haiku-rulings.js`, `proposer-13-15.js`) all follow the same shape: two `agent()` calls built,
awaited together via `Promise.all([...])`, then returned as one object.

## Shared preamble: `wave-f-common.mjs`

Not a lane brief itself — a template function `export const C = (name, wt, extra) => \`...\``
that the six `wave-f-*.js` files import and call to build each lane's opening paragraph
(worktree path, branch name, base commit, node_modules symlink note, the read-only
constraints on the main clone and sibling worktrees, the standing CLAUDE.md rules, the gate
list, and the REPORT contract). Every `wave-f-*.js` file supplies only the lane-specific
`name`, worktree name `wt`, and an `extra` string appended after the shared block — one body,
many callers, per the operator's "no copies of logic" rule.

## Worktree-per-lane, node_modules symlink, and the write-set discipline

Every lane brief assigns its own worktree under `/root/work/lanes/<name>` on its own branch
based on a named `origin/master` (or train) commit, so that concurrently running lanes never
collide on the filesystem or in git. Every worktree symlinks `fsi-app/node_modules` back to
one real install rather than each lane installing its own (time and disk). Multi-lane files
additionally name each lane's **write set** explicitly in its prompt (the exact files it may
touch) so two lanes running at once do not edit the same file; a lane whose work depends on a
path outside its write set is instructed to name what it needed but could not touch, rather
than reaching into another lane's files.

## Gates and the REPORT contract

Every lane brief ends with two things:

1. A **GATES** paragraph naming the exact commands to run from the repo root before the lane
   reports — always includes `fsi-app/.discipline/fitness/runner.mjs`, the discipline
   `node --test` suites, `closure-gate.mjs`, and (when `.ts`/`.tsx` changed) `tsc --noEmit`;
   most add `override-check.mjs --range=origin/master..HEAD` (C3 must be clean) and, for a
   lane touching a GitHub Actions workflow, a YAML-parse check. A lane brief that skips a gate
   says so explicitly (e.g. this HANDOFF lane's own brief: "Do not run the full test suite").
2. A **REPORT** paragraph naming exactly what the lane must hand back: the §0 evidences
   (reachable / run / populated / visible / gated / documented — see
   `docs/dispatches/lane-common-contract.md`), files touched, migrations written (number,
   apply order, post-check SQL), the exact dispatch inputs and artifact path the coordinator
   should use to prove the work, every gate's output line, commit hash(es), and anything
   refused with the reason.

## Index, by lane name and purpose

One line per file, purpose taken verbatim (or lightly trimmed) from `meta.description`.
Files with no `meta` export (`wave-f-common.mjs`) are the shared template, not a lane.

| File | Lane(s) | Purpose |
|---|---|---|
| `audit-a.js` | audit-a | Wiring audit 2026-09-04 part A: runtimes/workflows and customer surfaces landed since 2026-08-21 (PRs #474-#583) |
| `audit-b.js` | audit-b | Wiring audit part B: libraries/modules built since 2026-08-21, and the data layer (migrations, tables, RPCs) |
| `audit-c.js` | audit-c | Wiring audit part C: the flywheel loop map with every handoff, and rulings/ADRs/specs vs. implementation |
| `haiku-classify-text.js` | (2 Haiku) | Classify exported `portal_link_candidates` batches offline, with page text already fetched, into ledger-verdicts entries |
| `haiku-classify.js` | (2 Haiku) | Classify `portal_link_candidates` batches offline ($0) into ledger-verdicts entries using the exported first-fetch prompt verbatim |
| `haiku-rulings.js` | (2 Haiku) | Draft proposed decisions for the four review-queue ratification digests (Maintenance #48); decisions stay `null` until the operator rules |
| `lane-assemble47.js` | ASSEMBLE-47 | Fold the eleven wave-F lane branches into `train/wave47`, renumber the four colliding 308 migrations to 308-311, do cross-lane registrations, run every gate, write postscript 58 |
| `lane-boiler2.js` | BOILER-2 | Fix three evidenced record-facts defects HOLLOW-GATE reported and could not fix (bare-domain guard, `jurisdictional_scope` truncation, Cellar metadata garbling) |
| `lane-cap1000.js` | CAP-1000 | PostgREST's 1,000-row cap silently truncates unranged reads (312 of 1,312 slugs never prerendered); one paging helper, filters pushed into SQL, cache flush after apply |
| `lane-cap1000fix.js` | CAP-1000-FIX | Build-proof CI (no Supabase creds) fails because `generateStaticParams` throws through the new paging helper; enumerator returns `[]` with a logged reason instead |
| `lane-cap1000fix2.js` | CAP-1000-FIX-2 | The no-npm discipline suite fails importing `supabase-service.ts` (pulls in `@supabase/supabase-js`, absent in that job); move the env predicate to a dependency-free module |
| `lane-classifystep.js` | CLASSIFY-STEP | Maintenance wrapper `apply-classifications` |
| `lane-dbretry.js` | DB-RETRY | The first backlog flywheel apply died on a transient `fetch failed` mid-write; add bounded retry on transient transport errors to every guarded read/write in `db.mjs` |
| `lane-dedup.js` | DEDUP | `intelligence_items` carries more than one live row for the same `canonical_instrument_key`, against EP-11; measure corpus-wide and build the maintenance step that archives the duplicate reversibly |
| `lane-drift.js` | MIGRATION-DRIFT | The live `validate_item_provenance` carries schema not held by any committed migration; write the missing migration from the live definition |
| `lane-feslot2.js` | FE-SLOT-2 | 190 of 345 forward-event skips are `slot_date_unclassified`; give the extractor captured source context around the span so the deontic check sees the verb; collapse three mirrored corpus readers into one |
| `lane-feslot2b.js` | FE-SLOT-2b | Scope the grounding-pool reads FE-SLOT-2 added to items that actually carry a calendar-dated `[due_date]` slot claim |
| `lane-firstpage.js` | FIRSTPAGE | `/regulations` first paint shows only MONITOR rows while IMMEDIATE/ACTION rows arrive later; make the first page carry what the surface sorts first |
| `lane-fwdtext.js` | FWD-TEXT | `obligation_text` on the Upcoming Obligations strip starts mid-word with URL/markdown/table residue and duplicate events; fix the extractor, re-derive existing rows |
| `lane-fwdtext2.js` | FWD-TEXT-2 | Finish the retext normaliser from a dry-run's evidence (clause-boundary starts, quote/paren starts, `**` residue, bare `FACT:` labels, table pipes) before the apply |
| `lane-fwdtext3.js` | FWD-TEXT-3 | 58 live forward events display the mint's own slot template verbatim instead of the obligation; unwrap the template to its quoted passage |
| `lane-fwdtext4.js` / `lane-fwdtext4-resume.js` | FWD-TEXT-4 | One residual row after retext apply #44 still shows the record-facts template because the leading-edge snap landed after the marker; recognise the template by its body, not only its marker (resume variant re-runs the same fix) |
| `lane-gatea.js` | GATE-A-TOKENS | The gate-A scanner counts metadata stamps/boilerplate/structural numerals as orphan figures; classify heal dry #34's 627 orphan tokens and fix the scanner |
| `lane-govsingle.js` | GOV-SINGLE | Eight family runners each hand-sync a copy of F28's `GOVERNING_FILES`, already out of sync; one table, every runner and F28 import it |
| `lane-handoff.js` | HANDOFF | This lane: write the session handoff document, verify the coordinator's state dump against the repo, commit it with the lane briefs, proposed rulings, INDEX line, board pointer, session-log Addendum 86 |
| `lane-heal6.js` / `lane-heal7.js` / `lane-heal8.js` / `lane-heal10.js` | HEAL-6/7/8/10 | Successive passes diagnosing and closing heal-apply failure classes (gate-A orphans, criterion 3/4/7 failures, source-attribution-then-rating per rule 18, per-item cost) |
| `lane-hollowgate.js` | HOLLOW-GATE | Kit refusal of hollow record payloads + EU-act extraction triggers |
| `lane-hollowsweep.js` | HOLLOW-SWEEP | Maintenance step `record-hollow-sweep` |
| `lane-ledgerexport.js` | LEDGER-EXPORT | The ledger-consume candidate export must carry fetched page text via one shared fetcher, delivered as a workflow-dispatch artifact branch, so session-Haiku lanes classify offline with zero fetching |
| `lane-ledgerfr.js` | LEDGER-WALLS | The ledger fetcher marks bot-wall/CAPTCHA shells as `fetch_ok`; use the real transports (Federal Register JSON API, EUR-Lex HTML/CELLAR), detect walls with one shared detector |
| `lane-ledgertext.js` | LEDGER-TEXT | ledger-consume feeds the classifier raw HTML with boilerplate; one exported `htmlToText` replaces three private copies |
| `lane-legacy.js` | BACKLOG-LEGACY | `mint-run-001`/`005` predate `per_item.item_id` so the backlog flywheel can't select them; resolve their items by CELEX/canonical key |
| `lane-meta8.js` | META-8 | Write `meta-harness-run-008.json`, the coordinator's self-application review of the 2026-09-04 wave, to discharge the meta-harness F28 marker |
| `lane-perf5.js` … `lane-perf13` (via `wave-perf13-fededup.js`) | PERF-5 .. PERF-13, PERF-ARCH, PERF-MERGE, PERF-12-MERGE | The performance workstream: query-level fixes (PERF-5), Auth round-trip removal (PERF-7), full measurement + ADR-027 (PERF-ARCH), the three-part caching/RSC/API fix (PERF-8/9), static+SSG+public-RPC listing pages (PERF-10), cutting `/regulations` payload (PERF-11), cursor+virtualized listings (PERF-12), landing/merging those onto later trains (PERF-MERGE, PERF-12-MERGE), and the final "every click an edge hit" pass (PERF-13, paired with FE-DEDUP in the same file) |
| `lane-proposer3.js` .. `lane-proposer12.js`, `proposer-13-15.js`, `proposer-16..19.js` | PROPOSER-3 .. PROPOSER-19 | Successive proposer passes (F28 rule (d)) over mint/change-detection/forward-events/propagation/source-sweep/corpus-turn artifacts, naming each family's latest run so `LAST-PROPOSER-PASS.md` stays current |
| `lane-rdm4.js` | RD-M4 | Population apply #34 (rows_file) blocked 5 of 6 sibling-series rows on a same-URL holder check; make the check series-aware |
| `lane-rdm4b.js` | RD-M4b | `export-census-rows.mjs`'s exclude-held filter and RD-M4's same-URL check must share one instrument-identity predicate |
| `lane-rdtests.js` | RD-TESTS | Ratified all six R-D series; make the three market tests that asserted them "unratified" fixture-driven instead of asserting the live map's current state |
| `lane-recordsurface.js` | RECORD-SURFACE | Record-grade item detail page never renders title-only |
| `lane-reggrain.js` | REG-GRAIN | The obligations register must show what each obligation IS, so two distinct obligations on the same item/kind/date are distinguishable |
| `lane-retext3.js` | RETEXT-COLLIDE | forward-events-retext apply #35 died on a dedupe unique-index collision; collapse byte-identical derived duplicates (snapshotted, reversible) before the update |
| `lane-sitemap.js` | SITEMAP | Feed-first discovery + sitemap snapshot-and-diff walker for source-sweep, wired to the census ledger and change-sweep |
| `lane-sitemap2.js` | SITEMAP-2 | The sitemap-walker artifact must carry feed-probe evidence and classify HTTP 403 as a bot wall, not "no sitemap discovered" |
| `lane-sitemap3.js` / `lane-sitemap3-resume.js` | SITEMAP-3 | Bounded, resumable all-hosts sitemap/feed backfill mode + per-source coverage columns (resume variant continues the same build) |
| `lane-slimorder.js` | SLIM-ORDER | Give `get_workspace_intelligence_slim` an id tiebreak (migration 303, written not applied) so `/operations` and `/market` keep FIRSTPAGE's ordering discipline |
| `lane-sweepbudget.js` | SWEEP-BUDGET | The sitemap walker gets a wall-clock budget so a dispatch never dies at the job timeout with no artifact |
| `lane-tandem.js` | TANDEM | `population-turn.yml` triggers discovery, forward-event extraction, recluster and `--outcomes` after every apply |
| `lane-tandem2.js` | TANDEM-2 | THE GATE must see every unconnected apply slice, not only the newest artifact; a dispatchable backlog mode runs the flywheel over the ~650-item backlog |
| `lane-tierchip.js` | TIER-CHIP | Rule 18 publishes a figure WITH its source rating; the record-grade fact renderer must show the claim tier via the existing `TierBadge` |
| `lane-w71close.js` | W7.1-CLOSE | Close the W7.1 F25/F38 ratchet for real (wire by construction, or delete with tests and inventory rows) — no re-grants. **This is the next session's first substantive dispatch; see `handoff-2026-09-05.md` §7.** |
| `proposer-13-15.js` | (2 Haiku) | Proposer passes: forward-events-run-035, source-sweep-run-014, then corpus-turn's first attestation |
| `proposer-16.js` .. `proposer-19.js` | (1 Haiku each) | Proposer passes over source-sweep-run-015 through -018 (the four budgeted sweep runs) |
| `wave-a.js` | LEDGER-ZERO, REVIEW-WIRE | Plan T39: ledger-consume at $0 with session verdicts + flip; four ratification apply steps wired into maintenance.yml |
| `wave-b.js` | TURNREQ, T4-OVERRIDE | Plan T39/T40: `corpus_turn_requests` consumed by corpus-turn; standards bodies routed to T4 |
| `wave-c.js` | F25-WIDE, CLOSURE-GATE | Plan T40: module liveness widened repo-wide; CI fails on never-run steps / aged NEXT rows / writer-without-reader tables |
| `wave-d.js` | CHAIN, DEAD-EXEC | Plan T40/T42/T45: workflow_run chaining (ledger-consume→population-turn, producers→propagation-drain); the 2026-08-31 dead-code register closed |
| `wave-e.js` | DAG-AUTHOR | Plan T42: producers and the mint chokepoint write `derivation_edges` at write time; the decision-propagation loop stops being inert |
| `wave-f-1.js` | LEDGER-CHAIN-2, W71-WIRE | Wave-F pair 1 (became lane branches `ledgerchain2`, `w71wire`, folded into train47 by ASSEMBLE-47) |
| `wave-f-2.js` | ATTACH-SOURCES, CORRIDORS-STATUTORY | Wave-F pair 2 (`attachsrc`, `corridors`) |
| `wave-f-3.js` | NOTICES, CHIPS | Wave-F pair 3 (`notices`, `chips`) |
| `wave-f-4.js` | SPEC09-A, SPEC09-B | Wave-F pair 4 (`spec09a`, `spec09b`) |
| `wave-f-5.js` | RULINGS-EXEC, KIT-BACKFILL | Wave-F pair 5 (`rulingsexec`, `kitbackfill`) |
| `wave-f-6.js` | ASSEMBLY | Wave-F pair 6, single lane: scripted the train-assembly tool ASSEMBLE-47 then ran by hand |
| `wave-f-common.mjs` | (template) | Shared preamble builder `C(name, wt, extra)` all six `wave-f-*.js` files call — not a lane, no `meta` export |
| `wave-perf13-fededup.js` | PERF-13, FE-DEDUP | Post-train-44 measurement pass: prerender/prefetch/loading-boundary fixes (PERF-13) + forward-events claim/section duplicate collapse (FE-DEDUP) |

For the eleven wave-F lanes' actual outcome (which folded cleanly, which migrations
collided and how they were renumbered, which cross-lane registrations the coordinator still
owed), see `docs/ops/handoff-2026-09-05.md` §6 and train47's `docs/ops/session-log.md`
postscript 58.
