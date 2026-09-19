# Harness-run artifact convention (Wave MH-1)

**Why this exists.** arXiv 2603.28052 ("Meta-Harness," Lee/Finn et al.) measured that giving a proposer
FULL raw traces of prior runs beats giving it scores-plus-summaries — 56.7% vs 38.7% in their ablation.
Summaries didn't just under-perform, they *actively hurt*. This project already has three iterated
harnesses — the mint kit, the screen rules, the fetch-drain ladder — and each one has already produced a
run history that lived only as scratch files under `/root/work/{mint,build}/`: gitignored, unversioned,
and in one proven case (see "The screen-v1 loss" below) **silently overwritten by the harness's own next
run**. That is the failure mode this convention exists to close: not a lack of logging, a lack of a
place for the logs to survive and be found again.

This directory is that place. One JSON artifact per **run** of a harness family, written by
`scripts/lib/run-artifact.mjs`, read by the same module, navigable by a two-line CLI. Nothing here
replaces the full traces (payload files, source excerpts, screen-results.json, dispositions tables) —
those stay wherever they were produced. A run artifact **points at** them (`full_trace_refs`) so a
proposer lane can pull the complete history without a summary standing in the way. See
`PROPOSER-RUNBOOK.md` for the read-before-you-propose cadence this convention exists to serve.

## Directory layout

```
fsi-app/scripts/harness-runs/
  CONVENTION.md              # this file
  PROPOSER-RUNBOOK.md        # the cadence: read-all-artifacts-before-proposing
  family-registry.mjs        # loads every family's family.json descriptor (lane N2, 2026-09-19)
  governing-files.mjs        # derives GOVERNING_FILES from every family's descriptor
  <family>/
    family.json               # the descriptor: family, registered, registered_by, governing_files,
                               # rationale (see "Registering a family" below)
    FAMILY.md                 # optional: the family's own prose, where a family's shape needs more
                               # than its family.json's rationale field says
    PENDING-RUN.md             # optional: first-run acknowledgment, or a staleness marker (rule (c))
    LAST-PROPOSER-PASS.md      # optional: required once the family has two or more run artifacts
    <family>-run-NNN.json      # one per run
    traces/                    # optional: the family's raw full traces, one level BELOW the family
                               # dir, so F28's family-level *.json glob never mistakes a trace (or a
                               # descriptor) for a run artifact
```

One directory per harness family, each with its own `family.json` descriptor (lane N2, 2026-09-19,
`scripts/harness-runs/family-registry.mjs`; build plan section 6.8, Rule A: "a harness family is a
directory with a descriptor, never a line in three shared files"). Thirteen families exist today: `mint`,
`screen`, and `fetch-drain` (the three original iterated harnesses, matching `fsi-app/scripts/mint/`,
`fsi-app/scripts/mint/screen-*.mjs`, and `supabase/functions/capture-worker/`), `meta-harness` (the
meta-harness layer's own family, whose "runs" are the waves that build or extend this substrate), and
`forward-events`, `source-sweep`, `ledger-consume`, `change-detection`, `propagation`, `corpus-turn`,
`brief-apply`, `inaccessible-triage`, and `maintenance`, registered over the course of the build (see each
family's own `family.json` for who registered it and when). Where a family's shape needs more explanation
than its `family.json`'s `rationale` field carries, that explanation lives in the family's own `FAMILY.md`,
never as a per-family block here that a new registration would have to find and edit.

## Registering a family

Add the new directory under `scripts/harness-runs/` and its own `family.json` (see the Schema section
below for the run-artifact shape; `family.json`'s own shape is `{ family, registered, registered_by,
governing_files, rationale }`, validated by `scripts/harness-runs/family-registry.mjs`). Nothing else is
edited: `governing-files.mjs`'s `GOVERNING_FILES` and `run-artifact.mjs`'s `ALLOWED_FAMILIES` are both
DERIVED from every family's descriptor, and this file carries no per-family table or enumeration for a
registration to find and update. This is the fix for the 2026-09-18 collision: three lanes (M8, M9b, M9a)
each registered or touched a family and each stopped the merge train, because registering a family used
to mean appending to the SAME spot in three shared files at once.

**Filename = `run_id` + `.json`.** `run_id` is `<family>-run-<NNN>`, zero-padded 3 digits, monotonic
per family. `writeRunArtifact` refuses to overwrite an existing file unless the caller explicitly asks
for it (see below) — the writer enforces the discipline the convention describes.

## The screen-v1 loss (the concrete case this convention is designed against)

`screen-worklist.mjs`'s CLI writes to `<out-dir>/<basename>.screen-results.json` — a fixed path, not a
run-numbered one. Round 1 of the screen harness (commit `ff93fdc7`, 12 title rules, run against all
3,661 census rows) left 3,312 rows ambiguous and decided 349 (confirmed byte-identical against later
rounds in commit `4f29b053`: *"Round-1's 349 already-decided verdicts confirmed byte-identical
throughout"*). Round 1's own raw per-row output — the file that would show exactly which 349 rows and
why — was never given a run-scoped name, so round 2's run against the same `--out-basename` **silently
replaced it on disk**. All that survives round 1 today is its aggregate counts, quoted in a commit
message and a session-log addendum. That is a summary standing in for a lost full trace — precisely the
failure the paper's ablation measured as worse than nothing. `screen-run-001.json` below records this
loss explicitly (`defects_found[0]`) rather than backfilling a `per_item` array this session cannot
honestly reconstruct.

`run-artifact.mjs`'s `writeRunArtifact` refuses a same-path overwrite by default for exactly this
reason: a harness convention that lets its own tooling repeat the loss it was built to prevent is not a
convention, it's decoration.

## Schema

One JSON object per run. All eleven top-level keys are **required** on write (an absent key fails
closed — see "Fail-closed, not fail-soft" below); several may hold an empty array when a run genuinely
produced none of that thing (e.g. `defects_found: []` for a completely clean run), but the key itself
must be present so a reader never has to guess whether "absent" means "none found" or "not measured."

Two further top-level keys are **optional** (Wave M9a, 2026-09-18, the loop manifest and gate F50:
`.discipline/governance/loop-manifest.mjs`): `trigger` and `upstream_run_id`. Neither is required; an
artifact written before this addition, or by a caller with no CI event context, stays valid exactly as it
is without them.

- `"trigger"`: one of `"workflow_run"`, `"workflow_dispatch"`, `"push"`, `"manual"`. Tells a reader
  whether this run fired automatically off another workflow's completion, off an explicit dispatch, off a
  push, or was run some other way (the `"manual"` default: a local run, a test, anything with no matching
  CI event). Stamped in exactly ONE place, `writeRunArtifact` (`scripts/lib/run-artifact.mjs`), from
  `process.env.GITHUB_EVENT_NAME` when the artifact object does not already carry a `trigger` field, the
  standard GitHub Actions runner environment variable, present without any workflow-file change. This is
  what lets F50 tell "the edge exists in the yml" apart from "something has actually fired through it from
  its upstream, not from a person," the exact gap the 2026-09-18 stage audit named invisible.
- `"upstream_run_id"`: the GitHub Actions run id of the workflow that triggered this one, when known.
  Stamped the same way from `process.env.GITHUB_EVENT_WORKFLOW_RUN_ID`, but that variable is NOT one of
  the standard runner environment variables: GitHub only populates `github.event.workflow_run.id` on a
  `workflow_run` triggered run, and it must be exported into the job's environment by the workflow file
  itself before `writeRunArtifact` can see it, e.g.:
  ```yaml
  env:
    GITHUB_EVENT_WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
  ```
  Lane M9a (this addition) does not edit any `.github/workflows/*.yml` file; that line is added by
  whichever lane (M1 through M6) wires each workflow's own `workflow_run` trigger, at the same time it
  adds the trigger edge itself.

```jsonc
{
  // ── identity ──────────────────────────────────────────────────────────────────────
  "harness_family": "mint",              // one of ALLOWED_FAMILIES — "mint" | "screen" | "fetch-drain" |
                                          // "meta-harness" | "forward-events"
  "harness_version": "sha256:9f2a1c...", // content hash of the harness's own source files (see below) —
                                          // NOT a human-assigned version string. Two runs against
                                          // byte-identical harness code always get the same hash; any
                                          // edit to any hashed file changes it. This is what lets a
                                          // proposer lane tell "the harness changed between these two
                                          // runs" apart from "the input changed" without reading a diff.
  "run_id": "mint-run-001",              // <family>-run-<NNN>, matches the filename
  "started_at": "2026-09-01T00:49:22Z",  // ISO 8601 UTC. When the run's evidence trail begins (first
                                          // artifact file's mtime, first commit's author date, or a
                                          // report's own logged timestamp — cite which in proposer_notes
                                          // when it's inferred rather than self-reported).

  // ── what was run ──────────────────────────────────────────────────────────────────
  "config": { },                         // free-form object: batch size, candidate-pool definition,
                                          // spend ceiling, DB project, whatever parameters this run's
                                          // harness took. Family-specific; not schema-constrained beyond
                                          // "must be an object" — this is where family differences live
                                          // WITHOUT forcing every family into the same parameter shape.
  "inputs_ref": [ ],                     // array of paths (or path+selector strings) to the exact input
                                          // this run consumed — a census dump, a queue export, a pending-
                                          // fetch snapshot. Never the input's content, never a summary of
                                          // it — the path, so a proposer can open the actual file.

  // ── what happened, item by item ──────────────────────────────────────────────────
  "per_item": [                          // array, may be empty. See "per_item at scale" below for how
    {                                    // this stays honest when a run touches thousands of rows.
      "id": "32006R1692",                // family-native identifier: a CELEX id, a census_worklist uuid,
                                          // a pending_first_fetch queue_id — whatever the harness itself
                                          // uses to name the item. Never invented.
      "outcome": "minted",               // free-form short string, family-native vocabulary (minted /
                                          // fetch_blocked / off_vertical / source_not_registered /
                                          // classified / captured / terminal_error / retry_after_v1.6 —
                                          // whatever the harness's own report called it). Required.
      "verdict": "valid, 0 orphans",      // optional: the gate/validator's own verdict string, verbatim.
      "evidence_refs": [ "path", ... ],  // optional array of paths backing this item's outcome.
      "error": null                      // optional: error text/class if outcome was a failure; null
                                          // otherwise. Never omitted-vs-null ambiguity — always present
                                          // when the entry represents an attempted-and-failed item.
    }
  ],

  // ── what it added up to ───────────────────────────────────────────────────────────
  "metrics": { },                        // free-form object: counts, rates, whatever the run's own
                                          // report tallied (on_vertical/off_vertical/ambiguous counts,
                                          // minted/blocked/duplicate counts, class-by-class error counts).
                                          // This is the STRUCTURED complement to per_item, not a
                                          // replacement for full_trace_refs — see below.

  // ── what's wrong, and what to do about it ────────────────────────────────────────
  "defects_found": [                     // array, may be empty. This is the field a proposer lane reads
    {                                    // FIRST — see PROPOSER-RUNBOOK.md.
      "description": "...",              // required: what was wrong, in the harness's own terms.
      "root_cause": "...",               // required (may be "" only if genuinely still open — say so,
                                          // don't leave it silently blank): why it happened.
      "fix_ref": "..."                   // required (may be null): a commit sha, a file path, or a
                                          // one-line pointer to where the fix landed or is proposed —
                                          // null when no fix has been authored yet.
    }
  ],

  // ── the full trace (the paper's core finding, encoded structurally) ──────────────
  "full_trace_refs": [                   // REQUIRED NON-EMPTY for any run that reached the point of
    "path/to/full-report.md",            // producing evidence. writeRunArtifact fails closed on an
    "path/to/raw-results.json"           // empty array here — a run artifact with nowhere to point a
  ],                                     // reader for the complete trace is exactly the summary-only
                                          // failure mode the paper measured against. Paths, not content:
                                          // never inline a compressed version of what these point to.

  "proposer_notes": ""                   // free-text string (may be ""). Context a future proposer lane
                                          // needs that doesn't fit the structured fields — an inferred
                                          // timestamp's basis, a caveat about data that didn't survive,
                                          // a pointer to a follow-up decision still open.
}
```

### `per_item` at scale

Three of the runs retrofitted below classified or replayed hundreds to thousands of items in one run
(the screen harness: 3,661 rows; the fetch-drain ladder: 127 error rows). Inlining every row into
`per_item` would make the run artifact itself into exactly the kind of derived, lossy restatement the
paper's finding warns against — a second copy that can drift from the real data and that nobody would
ever regenerate from source. So `per_item` holds:

- **every item**, when the run's item count is small enough that "every item" is itself the natural unit
  of the run (mint batches — tens of items, not thousands); or
- **the items a human or a downstream reader would actually reach for** — every item a report table
  named individually (a minted payload, a disposition, a per-class example row) — when the run's full
  population is in the thousands, with the complete population living in the file(s) named in
  `full_trace_refs` and its breakdown captured in `metrics`.

The rule either way: `per_item` entries are never invented and never paraphrased from a source that
still exists — if a row is in `per_item`, it is because a real report named that exact row with a real
outcome. Population-level truth always lives in `full_trace_refs`, never only in `per_item` or
`metrics` — that is what keeps this schema from becoming the summary the paper's finding warns against.

### `harness_version` (content hash, not a version string)

Computed by `hashHarnessVersion(filePaths)` in `run-artifact.mjs`: SHA-256 over
`"<relative-path>\n<file content>\n"` for every listed file, sorted by path, truncated to 16 hex chars
and prefixed `sha256:`.

**The source is each family's own `family.json`, not a table here.** `scripts/harness-runs/
governing-files.mjs` derives `GOVERNING_FILES` from every family's `family.json` (`governing_files` field;
lane N2, 2026-09-19). F28 (`.discipline/fitness/functions/F28-harness-run-integrity.mjs`) and every
family's own canonical runner script (screen-worklist.mjs, run-mint-batch.mjs, run-extraction.mjs,
run-ledger-consume.mjs, run-propagation-drain.mjs, run-change-detection.mjs, run-source-sweep.mjs) import
their list from `governing-files.mjs`, so F28's own re-hash and a runner's own self-hash (the thing it
stamps onto `harness_version` when it writes an artifact) are the SAME array, not two hand-maintained
copies that can silently drift apart. A hand-maintained markdown table used to sit here and had to be kept
in sync with `governing-files.mjs` by a dedicated test (CONVENTION-TABLE-PARITY); that table is retired
(lane N2, 2026-09-19), replaced by the FAMILY-DESCRIPTOR-REALITY test
(`F28-harness-run-integrity.test.mjs`), which checks every family's own `governing_files` paths exist on
disk directly, with no intermediate table to drift from either source.

A harness-family README or runbook edit that doesn't touch a family's own `governing_files` does not
change `harness_version`, the hash tracks *behavior-bearing* files, not documentation. If a family's file
list changes (a new file becomes part of the classifier, say), update that family's own `family.json` in
the same commit. `meta-harness`'s own list is the one exception that proves this rule rather than
contradicts it: for the meta-harness family, `CONVENTION.md` and `PROPOSER-RUNBOOK.md` are not "mere
documentation" of some other harness's behavior, they ARE the family's behavior (the schema a run artifact
must satisfy, the cadence a proposer pass must follow), the same deliberate call F28's own header makes for
`MINT-RUNBOOK.md`.

## Fail-closed, not fail-soft

`writeRunArtifact(dir, artifact)` validates before it writes anything:

- all eleven top-level keys present, each the right JS type (`per_item`/`defects_found`/`full_trace_refs`/
  `inputs_ref` are arrays; `config`/`metrics` are objects; the rest are strings);
- `harness_family` is one of `ALLOWED_FAMILIES`;
- `run_id` matches `^<family>-run-\d{3}$` for the given `harness_family`;
- `started_at` parses as a valid ISO 8601 timestamp;
- `full_trace_refs` is non-empty;
- every `per_item` entry has a non-empty `id` and `outcome`;
- every `defects_found` entry has a non-empty `description` (a `root_cause` key must be present, `""`
  is allowed but must be explicit).

Any failure throws with a message naming the exact field — no partial file is ever written. This is the
same "flag it, never invent or silently drop" discipline `MINT-RUNBOOK.md` and `screen-worklist.mjs`
already apply to their own rows, applied one layer up, to the run record itself.

`writeRunArtifact` also refuses to overwrite an existing `<run_id>.json` unless called with
`{ allowOverwrite: true }` — see "The screen-v1 loss" above for why that default is not optional.

## Reading

`readRunHistory(dir)` returns `{ runs, invalid }`: `runs` is every valid artifact in `dir`, sorted
ascending by `started_at`; `invalid` lists any `*.json` file in `dir` that failed to parse or failed
schema validation (file name + reason), so a corrupt or hand-edited file is visible to a reader instead
of silently skipped or silently crashing the read. A lightweight CLI ships in the same module —
`node scripts/lib/run-artifact.mjs --dir scripts/harness-runs/mint --list` — printing one line per run
(run_id, started_at, a "metric headline" — up to 3 top-level `metrics` entries, family-agnostic since
`metrics` itself is family-specific — and the defect count) so a proposer lane (or a human) can survey a
family's history without opening every file, per the paper's lightweight-CLI guidance. `--list` is a
survey, never a substitute for reading the artifacts and their `full_trace_refs` before proposing a
harness change — see `PROPOSER-RUNBOOK.md`.

## The loop manifest and F50

Wave M9a (2026-09-18). This convention governs one harness family's own run history at a time. A build
made of many workflow files also has HOPS one level up from that: a workflow's completion is meant to
trigger the next workflow, or a runtime is meant to write into a harness family the next stage reads. The
2026-09-18 stage audit named the gap directly: every hop existed as code, but "wired and never fired" was
invisible, because nothing stated the hops as data a gate could check.

**What a hop is.** `.discipline/governance/loop-manifest.mjs` exports `LOOP_HOPS`, one entry per hop of
the build plan's own loop (`docs/plans/complete-system-build-plan-2026-09-04.md` section 1): a producer
workflow, a consumer workflow, the trigger kind (`workflow_run` today, everywhere in this loop), the
harness family the hop feeds (or `null` when the hop has none yet), and two booleans.

**The two flags.** A single "enforce" flag cannot say both "the wiring exists" and "something has actually
run through it," which is exactly the distinction this gap needed: `ledger-consume.yml` already carried
the `workflow_run` edge from `source-sweep.yml` before any workflow had ever fired it that way. So every
hop carries two:

- `enforceEdge`: true means the consumer workflow's `on.workflow_run.workflows` list MUST already name
  the producer's `name:` today. F50 checks this by reading the consumer's committed yml text.
- `enforceFired`: true means at least one artifact in the hop's harness family MUST already carry
  `trigger: "workflow_run"` today (see the Schema section above), proof the hop fired from its upstream,
  not from a person dispatching it by hand. F50 checks this by reading the family's own committed run
  artifacts.

A hop where either flag is still false is counted, never failed: F50 prints "hops not yet enforced: N" on
every run, so the number is visible whether or not any hop is enforced yet. A lane that wires a hop (adds
the `workflow_run` edge, proves a real fired run) flips its flag to `true` in the SAME commit that lands
the wiring; the manifest is a claim about the tree, and a flag flipped ahead of the wiring it describes
would make F50 fail on the very commit meant to prove it, which is the gate doing its job.

**Pending files and pending families.** A hop can name a consumer workflow or a harness family that does
not exist on the tree yet (`consumerPending`, `familyPending` on the hop): the lane that will create it is
named in the hop's own `note`. `loop-manifest.test.mjs` exempts a pending file or family from its
existence/name checks; F50 never enforces a flag for a hop whose file or family is pending, since a flag
can only be true once the thing it claims about exists to check.

**Flipping a flag.** When a lane wires a hop: (1) add the `workflow_run` edge (or, for a fired claim,
confirm a real run left an artifact with `trigger: "workflow_run"`); (2) flip the corresponding flag to
`true` in `loop-manifest.mjs`, in the same commit; (3) run the fitness runner and confirm F50 reports one
fewer unenforced hop and zero violations. `loop-manifest.test.mjs` and `F50-loop-wiring.test.mjs` are the
two proofs that keep the manifest itself honest about what it claims.
