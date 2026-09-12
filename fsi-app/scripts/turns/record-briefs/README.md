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
             "source_url": "https://example.org/reg"
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

## `validateRecordBriefsFile(json, { poolTextByItemId })`

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
- Every error string names the item (`item <id>: ...`) and the offending field or claim index
  (`item <id> claims[2]: ...`), never a bare "invalid entry".
- Per-entry AND per-claim violations are collected across the WHOLE file in one pass (not stopped at the
  first bad entry), so a producer sees every problem at once.

## The five pre-write refusals (task 6.1b + task 6.2b)

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

3. **Timeline mirror.** The body must contain a "Confirmed Regulatory Timeline" section (heading aliases:
   `"Confirmed Regulatory Timeline"` or the section-sign form `extract-regulation-sections.ts`'s own
   heading table already accepts) whose entries, run through the real parser
   (`src/lib/agent/timeline-parse.mjs`'s `parseTimeline`, the SAME parser the live write site uses) and
   `buildTimelineRows(entries, todayIso)` (`src/lib/agent/timeline-harvest.mjs`), yield at least one row.
   Refusal prints the parser's own view of the section (how many raw entries it found, how many it
   skipped as unparseable, and why) so the lane sees exactly why, rather than guessing. **Authoring rule
   this implies:** the Confirmed Regulatory Timeline section is MANDATORY, with at least one dated entry
   in the `- <date>: <label>` form (a colon separator, never a literal em/en dash -- this repo's own
   dash-glyph ban means every lane-authored timeline entry uses a colon); the instrument's own adoption,
   publication, or entry-into-force date qualifies when no other dated milestone exists. "No item should
   be without some date in the timeline" (operator ruling, 2026-09-12): every brief-apply item ends with
   at least one `item_timelines` row.

4. **Depth-accounting mirror (task-6.1-audit.md fix 1).** For a `regulatory_fact_document` entry whose
   "Substantive Requirements" section is present with content, that section must END with an accounting
   line, exactly:
   ```
   Obligations surveyed: N; workspace-adjacent: M; extracted as FACT: K.
   ```
   The validator (`extractCanonicalSections`, the SAME real section boundaries the criterion 4 mirror
   uses) refuses when: the line is missing; `K` exceeds the number of FACT claims this entry actually
   attaches to that section's own text (by `claim_text` or `source_span`, case-insensitively) -- K must
   never overstate coverage; or `K < M` with no following `Shortfall: <reason>` line naming why the
   shortfall exists (one line is enough; it may name more than one reason). For a source pool over 200,000
   characters, `K < 5` is ALSO refused without a `Shortfall:` line, even when `K == M` -- a large-pool item
   this thin needs its own explicit accounting, the exact gap the pilot's CLP (2.59M chars, 5 FACT claims,
   no accounting line at all) and Environmental Permitting 2016 (965k chars, 4 FACT claims) both left open.
   `N` is never fixed by this rule -- it must be STATED, so "the source genuinely states little" and "the
   lane did not look far enough" stop being indistinguishable from the outside. **Authoring rule this
   implies:** before closing "Substantive Requirements", count what you surveyed, what applied to the
   workspace, and what you actually extracted as FACT, and write the accounting line -- add a `Shortfall:`
   line whenever the last number is smaller than the middle one, or whenever a large pool still leaves you
   under 5 FACT claims in this section.

5. **Qualification-accounting mirror (task-6.1-audit.md fix 2).** Within that same "Substantive
   Requirements" section, each of three qualification categories is either CAPTURED (a FACT claim this
   entry attaches to the section carries the category's own language) or explicitly recorded ABSENT with
   the exact sentence below -- silence is refused either way, so a genuinely unqualified source and an
   unmined one stop being indistinguishable:
   - **Per-year trajectory** -- captured via `metadata.requirement_trajectory` (non-null), or the sentence
     `No phase-in stated in the source.`
   - **Exceptions, carve-outs, exemptions** -- captured via an attached FACT claim whose text matches
     `except` / `exempt` / `carve-out`, or the sentence `No exceptions stated in the source.`
   - **Scope limits** -- captured via an attached FACT claim whose text matches `scope` / `does not apply`
     / `applies only` / `limited to`, or the sentence `No scope limits stated in the source.`
   Zero captures across all ten pilot items, with no absence note anywhere, was the audit's own finding --
   this refusal is what makes that state unreachable going forward. **Authoring rule this implies:** for
   every regulatory_fact_document brief, before closing "Substantive Requirements", state the trajectory,
   the exceptions, and the scope limits the source actually gives you, or write the matching absence
   sentence verbatim when the source genuinely gives you none.

**The `allow_brief_overwrite` flag.** Task 3.3's own write site refuses to re-generate a non-`record`-grade
item (an existing brief) unless `--allow-brief-overwrite` is passed explicitly; `.github/workflows/brief-
apply.yml` carries an `allow_brief_overwrite` boolean input (default `false`) mapped to that flag. This
validator has no opinion on `item_grade` itself (that is a live-DB read the driver's own validate step
performs, per "What task 3.4's driver is expected to do with a validated file" below) -- the flag only
ever matters at the driver, never inside `validateRecordBriefsFile`.

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
4. **Timeline parsing** -- `src/lib/agent/extract-sections.ts`'s `extractSectionByHeading` (zero imports)
   locates the section, `src/lib/agent/timeline-parse.mjs`'s `parseTimeline` (moved out of
   `extract-regulation-sections.ts` by task 6.1b, re-exported and used by that module too -- one parser,
   two callers) turns it into entries, and `src/lib/agent/timeline-harvest.mjs`'s `buildTimelineRows`
   turns entries into rows. The timeline mirror above never re-implements any of the three.

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
- Every validated entry flows into `generateBriefFromInjected(itemId, caller, { body, metadata,
  sourcePoolHash })` (task 3.3), which re-parses `body + frontmatter` through the SAME `parseAgentOutput`
  this validator already proved it against -- so a file that passes `validateRecordBriefsFile` is not
  merely "shaped right", it is proven to parse under the real write site's own parser before any grounding
  cost is spent on it.
