# record-briefs files -- a session lane's full-brief batch for record-grade stub items

Same family shape as `scripts/turns/ledger-verdicts/`: a committed-repo-path file contract a session
lane's own model access produces, validated by a pure, dependency-free function before any driver acts
on it. This directory is the answer to Part 3 of `docs/plans/brief-chain-build-plan-2026-09-11.md`'s own
gap: no existing path takes session-authored synthesis text (`synthesiseAndWriteBrief` has no injection
parameter and unconditionally calls `generateBriefText`). A record-briefs file is how a session lane hands
the driver (task 3.4, not yet built) a batch of full briefs it authored offline, for record-grade items
that today carry only a title-plus-GAP-claims payload.

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

2. **Author the full brief.** For each item: the markdown body under its `format_type`'s section list (per
   `src/lib/agent/system-prompt.ts`), the 20-field metadata contract (a SUBSET of the full 26-field
   `AgentMetadata` contract -- see "Which fields, and why fewer than the full contract" below), and a
   `claims[]` array where every `FACT` claim's `source_span` is a literal, verbatim quote from the item's
   own pool text.

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

## Reuse, not reimplementation

Two things this validator does NOT reimplement (per this task's own instruction):

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

One local vocabulary is genuinely duplicated, and named as such rather than left silent:
`CLAIM_KIND_VALUES` (`FACT`/`ANALYSIS`/`LEGAL`/`GAP`) mirrors `parse-output.ts`'s own (also
module-private) constant of the same name -- there is no exported claims-array validator in
`parse-output.ts` this task's interface calls for, so this is the same judgment call
`record-facts.mjs`'s own `assertVerbatim` docstring makes for its own re-implementation. Exporting
`CLAIM_KIND_VALUES` from `parse-output.ts` would close this one duplication; it is a 4-value, closed,
versioned-together vocabulary, not a drift-prone one.

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

## What task 3.4's driver is expected to do with a validated file

Not built by this task -- named here so this contract's consumer-side expectations are written down in one
place, the same way `ledger-verdicts/README.md`'s "What the driver does with a verdict file" section
documents `run-ledger-consume.mjs`'s side of that contract:

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
