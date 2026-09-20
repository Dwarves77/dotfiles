# record-briefs files -- a session lane's full-brief batch for record-grade stub items

Same family shape as `scripts/turns/ledger-verdicts/`: a committed-repo-path file contract a session
lane's own model access produces, validated by a pure, dependency-free function before any driver acts
on it. This directory is the answer to Part 3 of `docs/plans/brief-chain-build-plan-2026-09-11.md`'s own
gap: no existing path takes session-authored synthesis text (`synthesiseAndWriteBrief` has no injection
parameter and unconditionally calls `generateBriefText`). A record-briefs file is how a session lane hands
the driver (task 3.4, `scripts/turns/apply-record-briefs.mjs`) a batch of full briefs it authored offline,
for record-grade items that today carry only a title-plus-GAP-claims payload.

## The mechanism, in one sentence

A session lane reads a batch of stub items' pool text (task 3.1's `--with-pool-text` export), authors one
full markdown brief plus the metadata contract plus a claim ledger per item, writes the batch to a
committed `scripts/turns/record-briefs/record-briefs-NNN.json` file, and `validateRecordBriefsFile`
(`schema.mjs`) checks it end to end before task 3.4's driver ever calls the write site
(`generateBriefFromInjected`, task 3.3) against a live item.

## How a session lane produces a batch

1. **Export a batch of stub items with their pool text**, the same command task 3.1 built:
   ```
   node scripts/turns/export-corpus-for-extraction.mjs --with-pool-text --char-budget 3000000 --out scripts/tmp/batch.json --ids <uuid,uuid,...>
   ```
   Each item in the export carries `pool: [{url, text}]` -- the ONLY text this task's grounding may cite.
   Writing a claim whose `source_span` is not a verbatim (case-insensitive) substring of the item's own
   pool text is refused by this contract's own validator (see below) exactly as it would be refused by
   `record-facts.mjs`'s `assertVerbatim` or `validate-mint-payload.mjs` criterion 3 at mint time -- never
   invent a fact, never paraphrase a span, locate one that is already present in the text.

   Each item also carries its own `provenance_status` (D1 fix, `defect-fix-plan-2026-09-12.md`, task
   6.2d). An item exported this way with `provenance_status: "quarantined"` is written like any other:
   author its full brief the same way, from the same exported pool text, per the mechanism above. The
   prior verified-only `--ids` filter silently dropped a quarantined id even when named explicitly, which
   blocked the only path that resolves one -- `apply-record-briefs.mjs`'s own `--allow-brief-overwrite`
   flag, which re-grounds it once the batch is applied (ADR-030: items are resolved, never left
   quarantined). Auto-selection (no `--ids` given) never includes a quarantined item; only a named ticket
   does.

   Under `--with-pool-text`, each item also carries `forward_events: [{event_date, event_kind,
   obligation_text, confidence, source_span}]` (from `item_forward_events`, migration 274) and
   `timelines: [{milestone_date, label, is_completed}]` (from `item_timelines`, migration 004) -- both
   default to `[]`, never omitted (task-6.1-audit.md fix 3, task 6.2b). READ THEM: 7 of the pilot's 10
   items had DB-recorded forward events that never reached the brief's own forward-intelligence section --
   the events existed as rows the export handed the lane, but the lane's own body never surfaced them.

2. **Author the full brief.** For each item: the markdown body under its `format_type`'s section list (per
   `src/lib/agent/system-prompt.ts`), the 20-field metadata contract (a SUBSET of the full 26-field
   `AgentMetadata` contract -- see "Which fields, and why fewer than the full contract" below), and a
   `claims[]` array where every `FACT` claim's `source_span` is a literal, verbatim quote from the item's
   own pool text. Carry EVERY entry in the item's exported `forward_events` array into the "Anticipated
   Guidance and Pending Regulatory Events" section as a dated entry (event_date, event_kind, the
   obligation_text in prose, citing the row's own `source_span` verbatim), and into the "Confirmed
   Regulatory Timeline" section too when the event is itself a milestone the reader needs on the timeline
   -- never leave a forward event as a database row the brief's own reader-facing prose never mentions.
   Likewise carry every entry in the exported `timelines` array (a milestone already recorded from a prior
   pass) into the timeline section rather than re-deriving or dropping it.

3. **Write the batch** to a committed repo path -- `scripts/turns/record-briefs/record-briefs-NNN.json`,
   zero-padded, incrementing, the SAME naming convention `ledger-verdicts/README.md` documents and for the
   identical reason: `scripts/_snapshots/` is gitignored, so a file written there never reaches `origin`,
   and a `workflow_dispatch` (which checks out `origin`) could never see it there.

   Shape:
   ```json
   {
     "batch": "record-briefs-001",
     "generated_at": "2026-09-11T00:00:00Z",
     "entries": [
       {
         "item_id": "11111111-1111-1111-1111-111111111111",
         "source_pool_hash": "<ECHO the item's own `source_pool_hash` field from the --with-pool-text export -- export-corpus-for-extraction.mjs stamps it as hashSourcePool(pool) over the exact pool it exported (task 3.3 fix round 1); do not hand-compute or invent one, and do not echo a stale value from a re-exported/refreshed item>",
         "body": "<the full markdown brief under the item's format_type, section list per system-prompt.ts>",
         "metadata": {
           "severity": "MONITORING", "priority": "LOW", "urgency_tier": "stable",
           "format_type": "regulatory_fact_document", "topic_tags": ["emissions"],
           "signal_band": null, "theme": null,
           "what_is_it": "...", "why_matters": "...", "key_data": ["EUR 500000 maximum fine"],
           "cost_mechanism": null, "requirement_trajectory": null,
           "penalty_range": "up to EUR 500,000", "enforcement_body": null,
           "operational_scenario_tags": [], "compliance_object_tags": ["freight-forwarder"],
           "related_items": [], "intersection_summary": null, "sources_used": [],
           "regeneration_skill_version": "2026-09-11"
         },
         "claims": [
           {
             "slot_key": "effective_date", "claim_kind": "FACT",
             "claim_text": "[effective_date] The captured source states, verbatim: <the quoted span>",
             "source_span": "<verbatim substring of the pool text>",
             "source_url": "https://example.org/reg",
             "section": "<the canonical section key of the entry's own format_type this claim attaches to, e.g. \"8\" for Substantive Requirements -- REQUIRED (fix round 1, finding 1); see the claim-section-attachment mirror below>"
           }
         ]
       }
     ]
   }
   ```

4. **Validate before landing.** `schema.mjs`'s `validateRecordBriefsFile(json, { poolTextByItemId })` is
   the actual enforcement task 3.4's driver runs -- this README is the same contract in prose. Keep them
   in agreement: `record-briefs.test.mjs` is the executable spec.

5. **Discovery note (task-6.1-audit.md fix 5).** In the lane's own commit/report for the batch, add ONE
   line per item stating whether the exported pool alone sufficed to fill every required slot and section,
   or the lane found the source genuinely silent on a slot (naming which one). No code enforces this --
   it is a report-template convention, the same honesty the depth-accounting and qualification-accounting
   mirrors above ask the BRIEF itself to state, restated one level up so a reviewer reading the lane's
   report (never the individual briefs) can also tell "the source said little" apart from "the lane did
   not look far enough", per item, at a glance. Example line: `b7135a5b: pool sufficed for all required
   slots; per-year trajectory genuinely absent from the captured text.`

## `validateRecordBriefsFile(json, { poolTextByItemId, requiredSlotsByItemType, itemTypeByItemId })`

```
validateRecordBriefsFile(json, opts?) -> { ok: true, entries } | { ok: false, errors: string[] }
```

- `json`: the parsed file (`{ batch, generated_at, entries: [...] }`). A structural violation (not an
  object, `entries` not an array) fails the WHOLE file closed -- a producer bug, never guessed around,
  the same posture `run-ledger-consume.mjs`'s `validateVerdictsFile` takes.
- `opts.poolTextByItemId`: `Record<string, string>` -- one concatenated pool-text string per `item_id`,
  which every `FACT` claim's `source_span` is checked against. The caller (task 3.4's driver) builds this
  from task 3.1's export parts (`pool: [{url, text}]`, concatenated per item) -- this module never fetches
  or reads anything itself; it is pure.
- `opts.requiredSlotsByItemType` and `opts.itemTypeByItemId` (lane L25): the `item_type_required_slots`
  rows grouped by item_type (`{slot_key, description}`) and each entry's item_type. When BOTH are given,
  refusal 8 runs; the driver always passes them (its own reads). Omitted, the check is skipped.
- Every error string names the item (`item <id>: ...`) and the offending field or claim index
  (`item <id> claims[2]: ...`), never a bare "invalid entry".
- Per-entry AND per-claim violations are collected across the WHOLE file in one pass (not stopped at the
  first bad entry), so a producer sees every problem at once.

## The eight pre-write refusals (task 6.1b + task 6.2b, fix round 1; numeric-figure mirror added D30, lane L19; criterion-5 mirror added lane L25)

A 10-item pilot batch (brief-apply run 34688130473) generated and sectioned cleanly, then quarantined
10/10 at the ground step for defects the validator now catches before any grounding cost is spent.
**Quarantine is never the end state of brief-apply** (operator ruling, 2026-09-12, verbatim: "Items need
to be resolved not quarantined. This is a failure of the previous system."): a lane-authored brief that
would fail one of these criteria is refused HERE, at the lane's own commit AND again in the driver's
validate step (one validator, two call sites), naming the exact token or section so the lane fixes the
source rather than writing something the ground step will quarantine anyway.

1. **Gate A mirror.** Runs the REAL `scanBrief` (`src/lib/agent/gate-a-scan.mjs`, the same scanner
   `item_gate_a_state` and criterion 7 use) against the entry's own FACT claims (as `{claim_text,
   source_span}`) and refuses when `orphan_count > 0`, naming every orphan token and its class (figure or
   deadline). No `derivedCovered` set is computed at authoring time -- that requires a live DB lookup of
   grounded DERIVED claims this pure, offline validator has no access to, and a record-briefs entry
   carries no DERIVED claims of its own -- so this mirror is `scanBrief`'s LITERAL coverage arm only.
   **Authoring rule this implies:** every figure and date written in the body is either inside a FACT
   claim's `claim_text` or `source_span`, verbatim from the pool, or not written at all. An "as of" note
   is written WITHOUT a date token the scanner gates -- for example "as of the export date" with the real
   date carried in the run artifact -- or the date is covered by a claim. Writing a bare "In force as of
   2026-09-12." (a real pilot defect) gates on the ISO token; "In force as of the export date." does not.

   **[HYPOTHESIS] residual risk, NOT closed by this validator (fix round 1, review finding 3).** This
   mirror proves the body against the claims AS AUTHORED, at validate time -- it cannot prove a claim
   survives to ground time. `buildGateARow` (the live write path) scans `full_brief` against the claims
   that SURVIVED grounding, not the full set the lane submitted; a claim can be dropped between
   validate-time and ground-time for reasons that have nothing to do with `derivedCovered` -- the pilot's
   own finding C is direct proof this already fired once (a target-match MISMATCH zeroed all claims for 4
   items, re-orphaning every Gate A token those claims used to cover). Fix C (own-URL match in
   `target-match.mjs`) closes that specific mechanism for the three `identifierInUrl` forms it recognises
   (CELEX, UK legislation, Federal Register); it does not close it for an item whose own-identifier shape
   isn't one of those three, or for a claim dropped by a verbatim re-check against a live pool that has
   changed since this validator ran. **Mitigation, why this residual is bounded rather than open-ended:**
   `assertVerbatim` already runs in this validator (`validateRecordBriefsClaim`) against the SAME pool
   text this Gate A mirror reads, so a claim cannot be dropped here for failing verbatim-ness this
   validator itself already confirmed passed -- the remaining path is a target-match hold on the item's
   whole pool, or the pool genuinely changing between validate-time and ground-time (a race this pure,
   offline validator cannot observe). Ideally the Gate A mirror would also re-run each FACT claim's
   `source_span` through the same target-match check `groundBrief` applies, so a claim the ground step
   would drop is never counted as coverage here either -- not built in this task.

2. **Criterion 4 mirror.** Extracts the body into the SAME section rows the real write path would persist
   to `intelligence_item_sections` (`extractCanonicalSections` in `schema.mjs`, reusing
   `extractSectionByNumber`/`extractSectionByHeading` from `extract-sections.ts` -- the number-first-then-
   heading-then-alts walk `src/lib/agent/formats/prose-extractor.ts`'s `makeProseExtractor` itself runs,
   over each format's own canonical section list, mirrored here as data since the real format files import
   via `@/` tsconfig aliases the no-npm-ci discipline job cannot resolve). Content outside every canonical
   section (a preamble, a non-canonical heading standing alone) is never checked, because the real write
   path never persists it either. **Fix round 1 correction (review finding 2):** the prior version of
   this mirror split the body at every `#`-`######` heading, a FINER boundary than the write path's own
   (an H1-matched section's body runs to the next H1, folding in any H2/H3+ sub-heading) -- which could
   isolate an early unlabeled sentence from a labeled sub-heading the live database folds into the same
   row, over-refusing a compliant lane emitting the documented H1-with-H2-subsections pattern. Fixed by
   reusing the real extraction functions instead of a bespoke splitter.
   Refuses any resulting section whose text matches
   `/\b(requires|must|mandates|obligates|prohibits|applies to)\b/i` unless that SAME section also carries
   one of the four analysis labels (`*Per the workspace's reading:*`, `*Analytical inference:*`,
   `*Industry interpretation:*`, `*Operational implication:*`) or the `*Legal Confirmation Required:*`
   callout. **This is DELIBERATELY STRICTER than the live DB rule**, which also accepts a FACT claim
   attached to the section (`section_key` matching) as an alternative to a label -- that escape is not
   available here, because claim-to-section attachment happens at the real write site (once a real
   `intelligence_item_sections` row exists to attach the claim to), not from a flat `body` string this
   validator reads pre-write. **Authoring rule this implies:** every section that states a requirement
   carries an analysis label or the legal callout, in that same section, even when a FACT claim elsewhere
   in the entry covers the same ground.

3. **Timeline mirror -- PER FORMAT (D31, lane L20, defect-fix-plan-2026-09-12).** Before D31 this mirror
   checked every entry, regardless of `format_type`, for a "Confirmed Regulatory Timeline" heading only --
   so a non-regulatory entry could pass it ONLY by adding a dummy regulatory heading its own format does
   not have (the defect the batch-007 exemplars discovery-45006684 and discovery-0781a8c0 both hit before
   this fix). The entry's OWN format's timeline section is now looked up through ONE per-format table
   (`TIMELINE_SECTION_BY_FORMAT`, `src/lib/agent/formats/timeline-section.mjs` -- the SAME module the live
   write site imports, so the validator and the write site can never check two different sections):

   | `format_type` | timeline section (key, heading) |
   |---|---|
   | `regulatory_fact_document` | `14` "Confirmed Regulatory Timeline" |
   | `market_signal_brief` | `3` "Expected Trajectory and Conversion Triggers" |
   | `research_summary` | `5` "What the Finding Does Not Resolve" |
   | `operations_profile` | `7` "Pending Changes That Shift the Calculus" |
   | `technology_profile` | `7` "Time-to-Market, Procurement Window, and Action" |

   That section's entries, run through the real parser (`src/lib/agent/timeline-parse.mjs`'s
   `parseTimeline`, the SAME parser the live write site uses) and `buildTimelineRows(entries, todayIso)`
   (`src/lib/agent/timeline-harvest.mjs`), must yield at least one row. Refusal prints the parser's own
   view of the section (how many raw entries it found, how many it skipped as unparseable, and why) and
   names the FORMAT'S OWN section heading -- never "Confirmed Regulatory Timeline" for a non-regulatory
   entry. `regulatory_fact_document`'s own lookup is byte-for-byte the pre-D31 behaviour (heading-text
   match only, including the section-sign heading alias `extract-regulation-sections.ts`'s own heading
   table already accepted; never a number-first attempt); the other four formats resolve number-first-
   then-heading-then-alts, the same order every other section extraction in this codebase uses.
   **Authoring rule this implies:** every entry's OWN mapped section (per the table above) is MANDATORY,
   with at least one dated entry in the `- <date>: <label>` form (a colon separator, never a literal
   em/en dash -- this repo's own dash-glyph ban means every lane-authored timeline entry uses a colon);
   for `regulatory_fact_document`, the instrument's own adoption, publication, or entry-into-force date
   qualifies when no other dated milestone exists. Adding a "Confirmed Regulatory Timeline" heading to a
   non-regulatory entry satisfies NOTHING -- it is not that format's own section. "No item should be
   without some date in the timeline" (operator ruling, 2026-09-12): every brief-apply item ends with at
   least one `item_timelines` row, now for all five formats, not only `regulatory_fact_document`.

4. **Claim section attachment mirror (fix round 1, finding 1).** Every claim in `claims[]` carries
   `section`: the canonical section key (from the entry's own `format_type` section list, e.g. `"8"` for
   Substantive Requirements in a `regulatory_fact_document`) that claim attaches to. This is NOT cosmetic:
   the live write path attaches a claim to a section via this SAME explicit field
   (`canonical-pipeline.ts:1889`, `sectionMap[String(c2.section)] || secs[0].id`) -- before this field
   existed, EVERY record-briefs claim silently attached to whatever section a live item's row at
   `section_order = 1` happens to be, never the section its content actually describes. The validator
   refuses: `section` missing or not a string; `section` not a member of the entry's own format's canonical
   section-key list (naming the valid keys); or -- when the claim carries a `source_span` -- that span not
   being a verbatim (case-insensitive) substring of THAT section's own extracted text (the same real
   extraction the other mirrors use). **Authoring rule this implies:** know which section a claim's
   evidence actually appears in before writing it, and declare that key; a claim cannot borrow a different
   section's evidence to satisfy its own attachment. **record-briefs-001.json and -002.json (the pilot and
   chunk-1 batches, already applied) predate this field and carry no `section` key on any claim** -- both
   are refused by this validator as committed; they are RE-APPLIED (regenerated with `section` added to
   every claim, then re-run through `apply-record-briefs.mjs`) after this fix lands, not hand-patched in
   place.

5. **Depth-accounting mirror (task-6.1-audit.md fix 1).** For a `regulatory_fact_document` entry, the
   "Substantive Requirements" section is now REQUIRED (fix round 1, finding 5: a regulatory brief without
   this section is not complete, refused outright rather than silently skipped) and must END with an
   accounting line, exactly:
   ```
   Obligations surveyed: N; workspace-adjacent: M; extracted as FACT: K.
   ```
   "END with" is enforced literally (fix round 1, finding 3): the accounting line must be the LAST content
   in the section, save for an optional following `Shortfall:` line (or several) -- any other content after
   it (a new, uncounted obligation) is refused, naming what follows. The validator refuses when: the
   section cannot be extracted at all; the accounting line is missing; `K` exceeds the number of FACT
   claims this entry attaches to that section by the explicit `section` field above (fix round 1, finding
   1 -- never a text-containment guess); or `K < M` with no following `Shortfall: <reason>` line naming why
   the shortfall exists (one line is enough; it may name more than one reason). For a source pool over
   200,000 characters, `K < 5` is ALSO refused without a `Shortfall:` line, even when `K == M` -- a
   large-pool item this thin needs its own explicit accounting, the exact gap the pilot's CLP (2.59M chars,
   5 FACT claims, no accounting line at all) and Environmental Permitting 2016 (965k chars, 4 FACT claims)
   both left open. `N` is never fixed by this rule -- it must be STATED, so "the source genuinely states
   little" and "the lane did not look far enough" stop being indistinguishable from the outside.
   **Authoring rule this implies:** every regulatory_fact_document brief has a "Substantive Requirements"
   section; before closing it, count what you surveyed, what applied to the workspace, and what you
   actually extracted as FACT (against claims that DECLARE this section), and write the accounting line
   LAST -- any qualification-absence notes (see the next mirror) go BEFORE it, not after. Add a
   `Shortfall:` line immediately after the accounting line whenever the last number is smaller than the
   middle one, or whenever a large pool still leaves you under 5 FACT claims in this section.

6. **Qualification-accounting mirror (task-6.1-audit.md fix 2, fix round 1 finding 2 + finding 4).** Within
   that same "Substantive Requirements" section, each of three qualification categories is either CAPTURED
   or explicitly recorded ABSENT -- this mirror runs UNCONDITIONALLY whenever the section is present (fix
   round 1, finding 2: it previously ran only when the accounting line was itself present, so it never
   fired against a single one of the twenty pilot+chunk-1 claims; now both refusals are reported together
   regardless of whether the accounting line exists):
   D18 (lane L12, 2026-09-13): each category's capture check matches a small STEM LIST with inflections,
   not a single bare root word -- a span reading "Exemption" or "exempted" was previously read as absent
   because the check matched only the bare root `exempt`, while a page-furniture "except" elsewhere in the
   body (never a claim's own span) could never satisfy it either way. Every stem is still matched with word
   boundaries on both sides and is still evaluated ONLY on a claim's own verbatim `source_span`.
   - **Per-year trajectory** -- captured via `metadata.requirement_trajectory` (non-null); OR an unnegated
     hit, in an attached FACT claim's `source_span`, of the stem list `phase` / `phased` / `phase-in` /
     `per year` / `from <four-digit year>`; OR a sentence naming the articles/sections checked: `No
     phase-in is stated in Articles 1 to 12.` (or `Section(s)`).
   - **Exceptions, carve-outs, exemptions, conditions** -- captured via a FACT claim DECLARING this section
     (the explicit `section` field, mirror 4 above) whose own `source_span` (never free-form `claim_text`)
     contains an unnegated hit of the stem list `exempt` / `exempts` / `exempted` / `exemption` /
     `exemptions` / `except` / `carve-out` (with or without the hyphen) / `condition` / `conditions` /
     `conditional` / `subject to` -- NO negation token (`no`/`not`/`none`/`never`/`nor`) in the few words
     immediately before the match -- a span reading "No party is exempt from this requirement" does NOT
     satisfy this (it asserts the opposite) -- or the sentence `No exceptions are stated in Articles 1 to
     12.` ("conditions" has no separate qualification kind of its own; D18 folds its vocabulary into this
     one rather than inventing a fourth kind the qualification-accounting mirror does not otherwise model.)
   - **Scope limits** -- captured the same way, matching the stem list `scope` / `applies to` /
     `applies only` / `does not apply` / `limited to` in the `source_span` (the negation window looks only
     at text BEFORE the match, so "does not apply" itself is never misread as negated by the word "not" it
     happens to contain), or the sentence `No scope limits are stated in Articles 1 to 12.`
   The absence sentences now REQUIRE a named article/section citation (fix round 1, finding 4: the prior
   fixed sentences -- `No exceptions stated in the source.`, with no reference to the source at all -- were
   satisfiable regardless of what the source actually says; a lane could paste all three into every brief
   unconditionally, and the pilot's own zero-captures state made this indistinguishable from a genuinely
   unmined source). Zero captures across all ten pilot items, with no absence note anywhere, was the
   audit's own finding -- this refusal is what makes that state unreachable going forward. **Authoring rule
   this implies:** for every regulatory_fact_document brief, before closing "Substantive Requirements",
   state the trajectory, the exceptions, and the scope limits the source actually gives you (as FACT claims
   that DECLARE section `"8"`, with the qualifying language IN THE SPAN, unnegated), or write the matching
   absence sentence naming the articles/sections you actually checked, when the source genuinely gives you
   none.

7. **Numeric-figure mirror (D30, defect-fix-plan-2026-09-12, lane L19).** A FACT claim's `claim_text` can
   restate a number the ground step's own S-NUMERIC gate (`mint-gates.mjs`'s `perFactGates` ->
   `defect-signatures.mjs`'s `detectNumeric`) would only catch AFTER a paid ground call -- real evidence:
   4a108d70's S-NUMERIC soft hold, named in this lane's own dispatch brief. This mirror refuses the SAME
   class of defect HERE, at author time: a significant number in `claim_text` (a digit run of two or more
   digits, optionally currency-prefixed, percent-suffixed, thousands-separated, or carrying a decimal
   point) that does not also appear in THAT SAME claim's own `source_span`, named per figure in the
   refusal. An ISO date such as `2026-09-13` needs no special case -- its component digit runs pass on
   their own terms whenever the date literal is genuinely present in the span. This is a NAMED DIVERGENCE
   from `defect-signatures.mjs`'s own `extractNumbers`/`detectNumeric` (see `NUMERIC_FIGURE_RE`'s own
   header comment in `schema.mjs`): that pair strips the decimal point along with other punctuation before
   comparing digits, which is tolerable for a mint-time SOFT hold but would false-positive a correctly
   cited decimal (`"3.5%"`) at this validator's HARD pre-write refusal, so this mirror's own
   `normalizeFigure` keeps the decimal point through the comparison instead. **Authoring rule this
   implies:** cite every figure in `claim_text` exactly as it appears in the claim's own `source_span`
   (currency marks, percent signs, and thousands separators may differ; the digits and any decimal point
   may not), or drop the figure from `claim_text` and let the span alone carry it.
   **Provenance pointers are not figures (lane L23, 2026-09-16):** the mirror measures `claim_text` AFTER
   stripping the leading slot tag (`[section12]`, `[effective_date]`) and every legal locator that names
   where the quote sits (`Section 61(6)`, `Article 8(2)`, `Regulation (EU) No 510/2011`, `Schedule 2`,
   `s. 60(1)`), because those digits point at the source, they do not state a fact. A dotted date in
   either text (`30.6.2014`, `31.12.2020`) is measured as its parts, like an ISO date. Everything else
   (`28-day`, `1974`, `EUR 6,800`) is still measured: write it as the span writes it, or leave it out.
   Batch 004 was refused whole on 260 pointers before this rule; `figureCheckText` in `schema.mjs` is
   the one place the exemption lives, and `record-briefs.test.mjs` pins both halves.
   The pointer classes, each learned from a real batch and pinned by a test (lanes L23 and L26): the
   leading slot tag including custom keys with hyphens (`[annual-report-10]`); legal locators with a
   keyword and one number or a list (`Section 61(6)`, `Sec. 60.4305(e)`, `Articles 7, 11, 12 and 14`,
   `Regulations 9 to 15`, `Annex XVII entry 61`, `point 2.1.2`, `Target 9.1`, `SDG 9.4`); an instrument
   title built from a year and a noun or acronym (`the 2012 Regulations`, `the 2020 Amendment Order`,
   `the IMO 2023 GHG Strategy`, `the 2027 TFMP`); a code citation (`17 CRR-NY Part 8`, `40 CFR 60`);
   a hyphenated identifier (`COVID-19`). Not pointers, still measured: a date the label computes or
   cites from elsewhere in the pool (`30 December 2024 (the third day after its 27 December 2024
   publication)`), a threshold (`sub-10,000 GT`), an amount (`EUR 100 per tonne`), a period name
   (`NEPN 2030-2040`): give each its own claim with its own span, or leave it out of claim_text.
   **Named limitation (words versus digits):** when the source spells a date or amount in words ("the
   first day of April in the year two thousand and fifteen"), no claim can carry it in digits, and the body
   cannot state it in digits either (Gate A needs a covering claim). Write it in the text's own words in
   both places, as batch 004b does for 15b1c540. A words-to-digits equivalence in the mirror is a later
   lane, not a workaround here.

**The `allow_brief_overwrite` flag.** Task 3.3's own write site refuses to re-generate a non-`record`-grade
item (an existing brief) unless `--allow-brief-overwrite` is passed explicitly; `.github/workflows/brief-
apply.yml` carries an `allow_brief_overwrite` boolean input (default `false`) mapped to that flag. This
validator has no opinion on `item_grade` itself (that is a live-DB read the driver's own validate step
performs, per "What task 3.4's driver is expected to do with a validated file" below) -- the flag only
ever matters at the driver, never inside `validateRecordBriefsFile`.

8. **Criterion-5 mirror (lane L25, brief-chain-build-plan Part 7 row P1).** Batch 006's apply quarantined
   1bb72c94 with `missing_required_slot penalty_summary (criterion 5, item_type regulation)` after this
   validator had accepted the file. The live `validate_item_provenance` (migration 207) counts, per required
   slot of the item's type, the claims of kind FACT or GAP whose `claim_text ILIKE '%slot_key%'`; zero is a
   quarantine. `requiredSlotErrors` mirrors that count and adds the GAP policy the slot descriptions carry:
   a GAP covers a slot only where the description names a GAP claim form (`slotAllowsGap`); elsewhere only a
   FACT does. The SQL count alone accepts any GAP; this mirror is stricter on that one axis so a batch never
   lands a GAP the descriptions forbid. Errors name the item, the slot, the item_type and whether a GAP would
   have been accepted. The allowance, read from the live rows on 2026-09-17 (48 rows):

   | item_type | FACT only (HARD) | FACT or GAP | source |
   |---|---|---|---|
   | regulation, directive | effective_date, jurisdictional_scope | penalty_summary, primary_deadline | migration 113 (seeded HARD), 137 (kept HARD), 326 (2026-09-17: a GAP only when the fetched source itself states no penalty or no compliance deadline, for example a Council Decision concluding an agreement) |
   | standard, framework, guidance | effective_date, jurisdictional_scope | penalty_summary, primary_deadline | migration 137 (GAP only when the fetched source characterises the instrument as voluntary or sets no deadline or penalty) |
   | market_signal, initiative | none | signal_event, driving_parties, conversion_trigger, action_now | migration 299; the descriptions name the GAP form as "GAP acceptable when ..." and "GAP when ...", which `slotAllowsGap` reads since lane L42 (2026-09-18); a GAP still needs the source's own basis in its claim_text |
   | research_finding | finding, decision_relevance, does_not_resolve, methodology_limits | none | migrations 128, 299 |
   | technology, innovation, tool | deployment_reality, operational_fit, supplier_access | procurement_window | migration 129 family |
   | regional_data | none | region_jurisdiction, cost_baseline, feasibility_choice, pending_change | migrations 131, 132 |

   A GAP is authorised only by the fetched source's own characterisation, never by the item_type label
   (migration 137's integrity note); the mirror checks the claim exists, the ground step checks the span.
   A claim covers a slot by naming the key in `claim_text` (the `[slot_key] ` prefix); since lane L42 the
   apply path does not add that prefix a second time when `claim_text` already carries it.

## Reuse, not reimplementation

Four things this validator does NOT reimplement (the first two per this task's own instruction; the
other two added by task 6.1b for the three pre-write refusals above):

1. **Metadata vocabulary** -- `src/lib/agent/parse-output.ts`'s `parseAgentOutput` is imported directly (a
   plain relative `.ts` import; Node 24's native type-stripping makes this portable to the no-npm-ci
   discipline job -- the same pattern `scripts/lib/db.mjs` already uses for
   `src/lib/sources/classify-source-role.ts`). `parseAgentOutput`'s own vocabulary constants (severity,
   priority, the locked severity-to-priority mapping, topic tags, compliance-object tags, the
   signal_band/theme format_type gates) are module-private, not exported, so the only way to reuse them
   without copying is to call the one exported function that applies them.
   `buildSyntheticFrontmatter`/`buildSyntheticRawText` (`schema.mjs`) turn a record-briefs entry's own
   `body` + `metadata` JSON into the flat-line YAML text `parseAgentOutput` expects, and feed it through
   the REAL parser -- the SAME technique task 3.3's own brief names for the write site itself
   (`parsed = parseAgentOutput(injected.body + frontmatter)`), applied one task earlier, at validation
   time, so a batch that would fail the real write site fails HERE first, before any grounding cost.
2. **Verbatim-span checking** -- `src/lib/intake/record-facts.mjs`'s `assertVerbatim` is imported directly
   (plain `.mjs`, zero transitive npm dependencies). Every `FACT` claim's `source_span` is re-checked with
   the SAME case-insensitive-substring guard `record-facts.mjs` and `validate-mint-payload.mjs` criterion 3
   already use.
3. **Gate A scanning** -- `src/lib/agent/gate-a-scan.mjs`'s `scanBrief` is imported directly (zero
   imports beyond `node:crypto` and its own sibling `gate-a-match.mjs`, also zero-import). The Gate A
   mirror above calls it exactly once per entry, never a second hand-rolled figure/date-token scanner.
4. **Timeline parsing** -- `src/lib/agent/formats/timeline-section.mjs`'s `findTimelineSectionFor` (D31,
   lane L20; imports `src/lib/agent/extract-sections.ts`'s `extractSectionByNumber`/`extractSectionByHeading`,
   both zero-import) locates the entry's own format's timeline section through the ONE per-format table
   (`TIMELINE_SECTION_BY_FORMAT`) both this validator and the live write site (`canonical-pipeline.ts`'s
   `harvestItemTimeline`, `scripts/backfill-item-timelines.mjs`) import, `src/lib/agent/timeline-parse.mjs`'s
   `parseTimeline` (moved out of `extract-regulation-sections.ts` by task 6.1b, re-exported and used by that
   module too -- one parser, three callers now) turns it into entries, and
   `src/lib/agent/timeline-harvest.mjs`'s `buildTimelineRows` turns entries into rows. The timeline mirror
   above never re-implements any of the three.

Two local vocabularies are genuinely duplicated, and named as such rather than left silent:
`CLAIM_KIND_VALUES` (`FACT`/`ANALYSIS`/`LEGAL`/`GAP`) mirrors `parse-output.ts`'s own (also
module-private) constant of the same name -- there is no exported claims-array validator in
`parse-output.ts` this task's interface calls for, so this is the same judgment call
`record-facts.mjs`'s own `assertVerbatim` docstring makes for its own re-implementation. Exporting
`CLAIM_KIND_VALUES` from `parse-output.ts` would close this one duplication; it is a 4-value, closed,
versioned-together vocabulary, not a drift-prone one. `ANALYSIS_LABEL_RE`/`LEGAL_CALLOUT`/
`UNLABELED_MODAL_RE` (the criterion 4 mirror) mirror `scripts/mint/validate-mint-payload.mjs`'s own
(also module-private) constants of the same name, themselves "ported verbatim from migration 171's
c_label_re / c_legal_req_re" per that file's own comment -- re-declared here for the same reason:
`validateMintPayload` is the only export, and this validator's own check is deliberately a STRICTER
subset of that file's criterion 4 (see above), not an identical copy that could silently drift into
disagreement if hand-copied loosely.

## Which fields, and why fewer than the full contract

A record-briefs entry's `metadata` carries 20 of the full 26-field `AgentMetadata` contract
(`system-prompt.ts`): the six write-only-at-persist-time fields are deliberately absent --
`what_it_changes`, `does_not_resolve`, `conversion_trigger`, `cross_references`, and `trajectory_points`
are format-gated callouts a record-grade brief does not need to originate (they layer on at a later
regeneration), and `last_regenerated_at` is stamped by the write site itself at persist time (task 3.3),
never authored by the lane. `buildSyntheticFrontmatter` fills in a placeholder timestamp purely to satisfy
`parseAgentOutput`'s structural requirement for that key -- it is never part of the validated entry and
never surfaced in this module's return value.

## A known, named limitation of the shared flat-YAML format

`parseAgentOutput` / its private `parseYamlFrontmatter` is a line-based parser with no multi-line
block-scalar form and no comma-escaping in inline arrays: every scalar field must be exactly one line, and
every inline-array item must contain no literal comma (the parser splits an array's inner content on `,`
unconditionally). A free-text field (`what_is_it`, `why_matters`, `cost_mechanism`, `penalty_range`,
`enforcement_body`, `intersection_summary`, or an open `key_data` entry) that violates either constraint
cannot be represented in this format at all -- not by this validator, and not by task 3.3's own frontmatter
builder, which will face the identical parser. `buildSyntheticFrontmatter` refuses such a value with a
named error (field name in the message) rather than silently truncating or mis-splitting it, so a batch
that would corrupt at the real write site is caught here first. A value that both starts and ends with a
matching quote character (`"`/`'`) is refused for the same reason: the parser's own generic quote-stripping
would silently remove that pair, corrupting content that was never meant to be a quoted literal.

**Confirmed live, 2026-09-13 (D31 calibration finding, batch-007 exemplar discovery-45006684):** this is
not a theoretical limitation. The first draft of `key_data` for that item included
`"23% of energy-related CO2 from transport today, could reach 40% by 2030"`, which this validator
correctly refused on first pass (`... contains a comma`). Fixed at authoring time by replacing the comma
with a semicolon and shortening a comma-joined actor list ("governments, organisations, institutions,
foundations and companies" -> "governments and organisations") -- never by patching this validator, since
the constraint is the shared parser's, not a bug here. **Authoring rule this implies:** never write a
comma inside a `key_data` (or `topic_tags`/`operational_scenario_tags`/`compliance_object_tags`/
`related_items`/`sources_used`) array entry; use a semicolon or "and" instead.

## Gate A named limitations (D31 calibration findings, 2026-09-13)

Two Gate A behaviours, confirmed live against the same batch-007 exemplars (discovery-45006684,
discovery-0781a8c0) that surfaced D31's timeline-mirror defect. Both are named limitations of the EXISTING
Gate A scanner (`src/lib/agent/gate-a-scan.mjs`), not bugs this validator introduces or re-implements
differently -- the mirror above calls the same `scanBrief` the live write site uses, so a lane hits these
at validation time exactly as it would at the real write site.

1. **Gate A treats spelled-out "percent" and the "%" glyph as different tokens.** `figureTokens`'s FIGURE
   regex accepts both `\d[\d.,]*\s?%` and `\d[\d.,]*\s?(?:per ?cent|percent)`, but the coverage check
   (`containsToken`, `gate-a-match.mjs`) is a literal substring check with no equivalence between the two
   spellings. A body that writes `"20 percent"` is NOT covered by a FACT claim whose span carries `"20%"`
   (the pool's own notation), or vice versa. **Authoring rule this implies:** always quote a percentage in
   the body using the SAME notation (glyph or spelled-out word) the covering FACT claim's `source_span`
   uses -- a paraphrase from one form to the other risks an orphan Gate A token even though the number
   itself is correct and sourced.
2. **Gate A's date-range harvest covers only the trailing endpoint of a hyphenated range.** When the pool
   states a range written `"N - M Month Year"` (hyphen-separated, spaces on both sides), the FIGURE/DATE
   harvest regex extracts only the trailing endpoint (`"M Month Year"`) as a standalone token -- it never
   lets the leading `"N"` bind across the `"- M"` in between to form a token of its own. A timeline (or any
   other) line citing the RANGE'S START date as a bare token is refused as an orphan unless it has its own
   separate covering claim; citing the range's END date, or restating the full range verbatim, is covered.
   **Authoring rule this implies:** when quoting a date range from the pool, either cite the trailing
   endpoint alone (Gate-A-covered by the SAME claim that covers the range), or restate the full range
   verbatim in the body rather than truncating to the leading date if the leading date needs its own
   bare-token citation elsewhere.

## `compliance_object_tags` out-of-vocabulary values are dropped, not rejected

A lane-authored `compliance_object_tags` value that is not in `parseAgentOutput`'s closed vocabulary
(`COMPLIANCE_OBJECT_VALUES`, `src/lib/agent/parse-output.ts`) does NOT fail validation and does NOT appear
in the offending entry's error list. `parseAgentOutput` filters the parsed array down to vocabulary values
only (capping at 4) and silently drops anything else -- the same leniency it applies to a model-generated
brief, so a batch that would pass through the real write site behaves identically here: one hallucinated
or misspelled tag costs an intersection-detection hint, never the whole entry. A lane that needs every one
of its tags to land should check its own output against the live vocabulary before writing the batch --
this validator (`validateRecordBriefsEntry`) has no separate check for this, by design, since inventing one
here would make an entry pass or fail on a rule the real write site does not enforce.

## Why a hand-written validator, not a JSON-Schema library

Same reason `ledger-verdicts/README.md` gives for its own family: `record-briefs.test.mjs` runs under
plain `node`, not `jiti` -- `.discipline/glob-portability.test.mjs` forbids a bare npm import (a
JSON-Schema engine included) in any file matched by `.discipline/run-test-suite.sh`'s no-`npm-ci` glob,
which `scripts/turns/record-briefs/*.test.mjs` is. `validateRecordBriefsFile` is the SAME pattern
`run-ledger-consume.mjs`'s `validateVerdictsFile` and `scripts/lib/run-artifact.mjs`'s `validateRunArtifact`
already use: a pure, dependency-free function that returns an array of human-readable error strings
(empty = valid), fail-closed at the caller.

## What task 3.4's driver does with a validated file

Built as `scripts/turns/apply-record-briefs.mjs` -- named here so this contract's consumer-side
expectations are written down in one place, the same way `ledger-verdicts/README.md`'s "What the driver
does with a verdict file" section documents `run-ledger-consume.mjs`'s side of that contract:

- **Schema violation -> the WHOLE file is rejected.** A structurally malformed entry is a producer bug.
- **`source_pool_hash` mismatch -> that entry is refused, per task 3.3's own brief**: "refuses when
  `sourcePoolHash` does not match the hash of the item's current stored pool (the lane read stale text)".
  Task 3.3 fix round 1: the hash function is `hashSourcePool` (`src/lib/agent/source-pool-hash.mjs`), the
  ONE shared helper `export-corpus-for-extraction.mjs` also uses to STAMP each exported item's
  `source_pool_hash` field under `--with-pool-text` -- see "Which fields, and why fewer than the full
  contract" above for where a lane gets the value it echoes back in `entries[].source_pool_hash`.
- **`item_grade` gate -> per task 3.3's own brief**: refuses a non-`record`-grade item unless
  `--allow-brief-overwrite` is passed explicitly (existing briefs are re-generated only by explicit order).
- **`replaceLedger` (D29, defect-fix-plan-2026-09-12, lane L19).** When `--allow-brief-overwrite` is set,
  `applyOneEntry` (`apply-record-briefs.mjs`) passes `groundBrief(itemId, "brief-apply", { injectedLedger:
  entry.claims, replaceLedger: true, batchId: <the file's own `batch` field> })`. This entry's claims are a
  COMPLETE, author-checked ledger, not a partial re-extract, so a prior claim the entry does not reproduce
  was deliberately left out by the author (below the floor / not verbatim) and is ARCHIVED to
  `claim_versions` (`supersede_reason='superseded_by_record_briefs'`, the batch id in `note` -- migration
  321) rather than kept current, per `ledger-apply.mjs`'s own "REPLACE-LEDGER EXCEPTION" header. A
  reproduced prior claim is unchanged either way. Without `--allow-brief-overwrite`, `replaceLedger` is
  `false` and the call is byte-for-byte the paid re-ground's own non-destructive apply (every not-reproduced
  claim kept, re-grounds-never-destroy doctrine, migration 208).
- Every validated entry flows into `generateBriefFromInjected(itemId, caller, { body, metadata,
  sourcePoolHash })` (task 3.3), which re-parses `body + frontmatter` through the SAME `parseAgentOutput`
  this validator already proved it against -- so a file that passes `validateRecordBriefsFile` is not
  merely "shaped right", it is proven to parse under the real write site's own parser before any grounding
  cost is spent on it.
- **Disk IO budget, cooldown, and pre-flight (D32, defect-fix-plan-2026-09-12.md, lane L21).** An
  `--execute` run meters the bytes it reads and stops cleanly before `--io-budget-mb` (default 400 MB); a
  pre-flight check refuses to even start when the previous apply run is too recent (`--cooldown-min`,
  default 30) or the database's own disk metrics read busy/saturated. See
  `docs/runbooks/MAINTENANCE-RUNBOOK.md` section 57 for the full budget/cooldown/restart procedure, and
  `scripts/turns/io-preflight.mjs` for the code.

## The chain, automatic and human halves (lane M4, 2026-09-20, build plan section 6.1 row M4)

The stage audit (`docs/audits/stage-audit-2026-09-18/README.md`, "Mint to brief chain") found mint leaves
a stub `full_brief` and nothing upgrades it: `.github/workflows/brief-export.yml` and `brief-apply.yml`
were both `workflow_dispatch` only, with a session lane's own authoring pass between them. W9's own goal
was "wired at mint" -- the authoring step stays human-driven by design (no LLM in runtimes; briefs are
authored by session lanes, per CLAUDE.md's agent-architecture rules), but everything AROUND that step now
fires by itself:

- **Automatic**: `brief-export.yml` now also carries a `workflow_run` trigger on "Population turn"
  completing (alongside its existing `workflow_dispatch`), and writes its own committed
  `scripts/harness-runs/brief-export/brief-export-run-NNN.json` on every firing, dry or auto-selected,
  including a zero-id run ("record it every batch, even when zero"). `loop_run_id` is resolved through
  `resolveLoopRunIdFromUpstream` (`scripts/lib/loop-run-id.mjs`), so a proof run's harness artifacts can be
  traced hop to hop from the mint that started them.
- **Human**: a session lane still reads the export's own part file(s) under
  `scripts/_snapshots/brief-export/` and authors a batch under this directory
  (`record-briefs-NNN.json`), validated by `validateRecordBriefsFile` (`schema.mjs`) exactly as before this
  lane. `scripts/turns/apply-record-briefs.mjs` / `brief-apply.yml` are unchanged by this lane.

**Not built by this lane**: landing the export as a committed "batch skeleton" of owed entries on a
`brief-lane/<loop_run_id>` branch, and a `push` trigger on `brief-apply.yml` running `dry` mode
automatically for a batch merged to master. Both were named in this lane's own brief
(`docs/dispatches/lane-briefs/2026-09-19/brief-m4.md`, items 2 and 3) but are out of scope for the reasons
in this lane's own report: the batch-skeleton shape is not representable with the existing validator (see
`brief-export.yml`'s own header, "NOT BUILT BY THIS LANE"), and the `brief-apply.yml` push trigger is a
separate, comparably-sized wiring task this lane did not reach within its own scope.
