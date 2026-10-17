# Why Caro's Ledge is being rebuilt (2026-10-16)

Read this before deciding what to build, what to change, or what "better" means in any slice. The build plan
(BUILD-PLAN-2026-10-12.md) says WHAT the new tree contains; the agent plan (PART2-AGENT-PLAN-2026-10-15.md) says HOW it
is built; this document says WHY, so that every judgement call a lane or the coordinator makes points the same way the
operator's decisions point. Where a figure is quoted it was measured during the 2026-10-11/12 audit and cut; the
registers under part1/ and the session logs hold the evidence.

## 1. What the product is (and is not)

Caro's Ledge is freight sustainability intelligence. Its first customers are freight forwarders who move high-value,
time-critical cargo (art, live events, luxury goods, film and TV, classic and prototype cars, humanitarian cargo), with
the architecture built to widen to freight forwarding in general and then other industries by profile (industry, role,
organisation size), never by forking the code.

It has two halves, both core:
- The intelligence half: four surfaces that each answer a different operator question, with a different analysis
  contract. Regulations: what is binding, when, what it costs, what to do (a compliance-action text brief built from a
  14-section fact document). Market Intel: what the industry is doing, numerically and comparatively (deltas,
  trajectories, lead time). Research: what is emerging, who is studying it, how it changes the planning horizon (a
  horizon assessment, fed autonomously; no editorial queue). Operations: structured jurisdictional data for real
  decisions (cost, labour, materials, infrastructure, feasibility by region); a content build, never a separate
  "decision engine".
- The community half: Community, peer information-sharing that breaks the industry's isolation (groups, threads,
  moderation). It is social only: nothing in Community feeds the other pages. It is kept whole and ported last.

Cross-cutting: Dashboard (what is new, important and flagged, every item linking back to its surface), the Map (a
visual filter over Regulations), Search, and the Intelligence Assistant (a research helper over platform content and
skill knowledge; never a synthesis or decision engine).

Underneath: a data machine. Sources are registered and rated (tiers from an institution class table, never
hand-typed), captured in full, minted into items, grounded (every FACT's span verbatim in a capture, ADR-016),
validated (validate_item_provenance), connected by the flywheel (connection discovery, then decision propagation into
derived values the surfaces read), and recorded by the harness. Nothing in it waits on a human, and customers never
upload their own data for analysis: the product is external data, made trustworthy.

The integrity promise is the product. A figure is published with its source's rating, never refused because the source
is low (rule 18); what is refused is a figure with no source and any span that is not verbatim. Gaps are labelled,
legal interpretation is deferred to counsel, nothing is fabricated.

## 2. What went wrong (why the old tree could not be fixed in place)

The old tree was built over roughly six months by many agent lanes under a coordinator. By 2026-10-11 it had become
something the operator could no longer trust, for reasons that compound:

1. It was far larger than anyone said, and most of it was not product. 1,642,876 tracked lines at the start of the
   cut: about 391k lines of code, 184k of tests, 632k of JSON, 227k of markdown, 209k other. September 2026 alone added
   about 1.13 million net lines. The operator had been told the system was roughly 100,000 lines. The actual product
   code (src) was about 114k; the discipline layer around it (fitness functions, governance gates, an invariant
   registry, 37 harness families, 28 workflows, hooks, about 149k lines of tests, generated inventories) was larger
   than the product it guarded.

2. The guards became the failures. Every incident was answered by adding a rule, a gate or a check, so the system grew
   a layer per mistake instead of fixing the mistake's cause. The layer then failed on its own: CI reds from the gates
   themselves, goldens and audits that nothing actually ran (two silently red for weeks), a provenance guard that
   passed its presence check while defeatable by one call, and, as late as 2026-10-15, a dead PreToolUse hook that
   pointed into the deleted discipline folder and forced a permission prompt on every tool call for days. A rule is
   not a fix; a check that does not execute is not a proof.

3. Code was changed without being read. On 2026-10-11 four red runs in one day came from changes dispatched without
   reading the code they touched. The "complete" audit that preceded the rebuild claimed full coverage while only 2,587
   of 5,381 files had actually been named by a read; its coverage definition inflated the number. Findings had been
   stated as conclusions while still pattern matches (rule 14 exists because eight such findings were retracted in one
   earlier session).

4. A third of the code was narration, much of it false. Roughly a third of the raw lines were comment history
   recounting superseded rulings, lane histories and essays, several now contradicting the code beneath them. A reader
   (human or model) is misled by the file before reading a line of logic.

5. The same thing existed many times. Three request-guard families for one question; six versions of the tier
   vocabulary (OECD, IEA, World Bank, IPCC at T2 in code and T3 in the skill); five copies of hostOf and two URL
   canonicalisers; two scrape holds, one failing open; thirteen copies of one CLI skeleton; five modal implementations
   with no focus trap; 23 per-instance style tags shipping 13.5 KB of CSS on every list row; a single 5,048-line reader
   file serving five surfaces. Each copy drifted, so the same rule meant different things in different places.

6. Features looked shipped and were not. Found by whole reads (not tests) in Part 1: the Community composer sends no
   entity ids, so every post is refused; invitation accept and decline are mounted on no page; promote-to-public is
   listed as shipped and has no code; the settings loader has no caller, so dashboard defaults and the briefing
   schedule never save; six of seven turn runtimes and every drain lost their invoker; the capture worker reads neither
   the scrape hold nor the kill switch; Market detail guesses severity from keywords; 8 of 15 fact-document sections
   have no structured render; no Market figure shows its source rating; a unit error in the Operations labour chain; an
   unreachable band in the Research maturity ladder.

7. It depended on paid services the operator had ruled out. Brief generation, corroboration search, span judging,
   classification, tier recommendation, the Assistant and verification called metered model APIs, and fetching used
   Browserless. The operator's ruling is absolute: everything is free.

8. The history did not describe the system. The 394 migration files do not reproduce production (352 applied rows, 46
   with no file, 17 files with no applied row); the only true schema is production itself, now dumped into one file.

9. The process produced the bloat. Lanes were sized to what was asked, not to what the system needed; coordinators
   wrote rules instead of reading code; work was "done" when a PR was green, not when the feature worked end to end
   with its downstream (rule 17). The rebuild changes the process as much as the code.

The operator's verdicts, verbatim where it matters: the tree was cut first ("I don't want it archived I want it gone.
A top developer would not have saved it to begin with"), and that cut took it from 1.64 million to 534 thousand lines
(CLEAN-1 machine output, CLEAN-2 historical docs, CLEAN-3 the discipline layer, tests and one-off steps, after
extracting their knowledge into data-invariants.md and protected-properties.md). Then: "I'm not willing to get rid of
features. You need to fix the code. Not remove features." "The discipline layer should not be bigger than the code for
the actual product." "You look at the old code for every single thing, every single feature, and you write it to be
the best possible version of itself by using the old code."

## 3. What the rebuild is

A clean-room rebuild in a new repository (Dwarves77/caros-ledge): every feature kept, each written as the best version
of itself from a whole read of its old code (Part 1: 26 module registers, every file read whole, every finding labelled,
every feature named with its new home). The database and its rows are untouched; the new tree points at the same
project and takes the schema as one file from the production dump, with fixes as forward migrations. Targets: the
substrate within 15 to 25 thousand code lines, the platform within 35 to 60 thousand (the plan budgets about 52
thousand against 155 thousand today), enforced by CI. One workflow. Free only. Anonymous from the first commit.
Done means six proofs the operator opens, then Community as the seventh.

## 4. What "better" means here (the yardstick for every decision)

Better is not "different" and not "more". A change is better when it does one or more of these, and costs less than it
returns:
- Capability: the output is more correct, more complete, more trustworthy, or faster for the customer (a figure shows
  its rating; a fact-document section renders; a failed read shows an error instead of an empty list).
- Learning: the system improves as the world changes without a person in the loop (sources rated by class and use,
  corrections that propagate, the flywheel connecting new items).
- Self-maintenance: the system keeps itself honest with the minimum mechanism (a schema constraint instead of an audit
  script; one property check in CI instead of a governance tree).
Anything that serves none of the three is not built. Anything that serves one by adding a layer that must itself be
maintained is weighed against that layer's cost.

Concretely, prefer:
- One home for each mechanism. If the registers found copies, the slice builds the one and the others never return.
- Enforcement where the data lives. A rule the database can hold (constraint, policy, trigger, FK index) belongs in the
  schema; a rule code must hold belongs at the single write site with a test that attacks it; a property of the whole
  tree belongs in the one workflow. Never a separate engine that watches the others.
- Failing loudly and honestly. A failed read is an error state, never an empty or zero; a guard read that errors
  refuses (503), never allows; a hold fails closed; a missing configuration is reported, never silent.
- Fewer requests, fewer layers, fewer files. A thin route calling one feature function; a reader of a few hundred lines
  per surface; data fetched once per page.
- Code that explains itself. In-body comments state what the code does and why now; history lives in git and the
  docs, never in file headers.
- The free path. A deterministic rule, the class table, retrieval, plain HTTP and headless Chromium on the runner, or
  the injected-brief seam (a brief authored outside the system and then grounded and validated by the same code).

## 5. The boundaries "better" must not cross

- Every feature stays. Improving a feature never means dropping it; if the register says a feature was half-built,
  the rebuild finishes it.
- Design stays on base. The artboards and the existing site govern layout, spacing, type, colour and the order of what
  a page shows; Playwright parity guards that. Behaviour, data, speed and correctness may and should improve. When the
  system needs something the design does not show, build to the system and record a DESIGN CHANGE OWED; never silently
  change the look.
- Integrity is not negotiable: verbatim spans, rated sources, no fabrication, gaps labelled.
- No human gates in the data machine; no customer data input; Community never feeds other surfaces; the Assistant
  answers, it does not decide; build mode keeps the scrape cadence off.
- Examples are not scope: an example in a spec illustrates a class; build the class.
- Nothing runs alone: a runtime that ends triggers its downstream and records its run, in the same run.
- Anything the operator has ruled stays ruled unless the operator rules again. Improvements that change design,
  interfaces or rulings go to the IMPROVEMENTS list for discussion; the operator asked to discuss every one ("if during
  the build you find something that can be done better in ANY way let's discuss it"). Improvements inside a slice's
  budget that change no design and no interface are built and reported.

## 6. The failure classes the new tree must not repeat, and what stops each

| failure | what stops it now |
|---|---|
| Bloat by accretion | LOC gates in CI (src/core 25k, src 60k); a dependency budget; no file without a Ported-from header or a stated reason |
| A rule per incident | fix the cause in code or schema; a new check only when it executes in the one workflow and is proven by a seeded violation |
| Changing code without reading it | every slice reads its register and every ported file whole before writing; the header names the lines read |
| Findings stated as facts | [CONFIRMED]/[HYPOTHESIS]/[REFUTED] on every claim; numbers come from commands that ran |
| Copies that drift | one home per mechanism (BUILD-PLAN section 3); duplicates listed in ASSEMBLY-INPUTS E are not ported twice |
| Half-built features | a slice is done when its feature works end to end, its downstream fires, and its proof step passes; the features table in each register is the checklist |
| Paid dependencies | tree checks fail any metered SDK; every old call site has its free replacement written down |
| Silent failure | error states, fail-closed guards and holds, honest not-configured results |
| History that lies | one schema file from production; forward migrations only, each with a self-check |
| Process overhead larger than the product | one workflow, a handful of property checks, domain tests only, no governance tree |
| Config pointing at deleted code | after any deletion, search the repo and ~/.claude for references into the deleted paths |

## 7. How to use this when deciding

Before building or changing anything, answer in this order:
1. Which feature is this, and where is it in its register's features table? If it is not there, it is either a lost
   feature (add it) or not wanted (do not build it).
2. What did the old code do, read whole, including what it did wrong (register sections 4, 5 and the defects list)?
3. What is the one home for this mechanism in the new tree, and does something already provide it?
4. Does the better version improve capability, learning or self-maintenance, at a cost smaller than the gain?
5. Does it keep the design on base, keep every ruling, stay free, keep integrity, and fire its downstream?
6. Can it be proven: a test that fails first, a property in CI, or a proof step the operator can open?
If 4 and 5 are yes and it changes no design or interface, build it. If it changes design, an interface or a ruling,
put it on IMPROVEMENTS with your recommendation and keep building the rest.
