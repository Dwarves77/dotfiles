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
  CONVENTION.md              -- this file
  PROPOSER-RUNBOOK.md        -- the cadence: read-all-artifacts-before-proposing
  mint/
    mint-run-001.json
    mint-run-002.json
    ...
  screen/
    screen-run-001.json
    screen-run-002.json
    screen-run-003.json
    ...
  fetch-drain/
    fetch-drain-run-001.json
    fetch-drain-run-002.json
    ...
  meta-harness/
    meta-harness-run-001.json
    meta-harness-run-002.json
    meta-harness-run-003.json
    ...
  forward-events/
    forward-events-run-001.json
    ...
  source-sweep/
    source-sweep-run-001.json
    ...
```

One directory per harness family. Five exist today: `mint`, `screen`, and `fetch-drain` — matching the
three iterated harnesses in `fsi-app/scripts/mint/`, `fsi-app/scripts/mint/screen-*.mjs`, and
`supabase/functions/capture-worker/` — plus `meta-harness` itself (Wave MH-4, build plan §3
"self-application"): the meta-harness layer's own family, whose "runs" are the waves that build or extend
this substrate (this file, `PROPOSER-RUNBOOK.md`, `run-artifact.mjs`, `F28`) rather than a mint batch, a
screen round, or a fetch-drain lane — plus `forward-events`, registered over
`src/lib/forward-events/extract-forward-events.mjs` (moved there from `scripts/forward-events/` in lane
FIX, 2026-09-01, once the intake mint chokepoint needed to import it as a runtime `src/lib` module): a
family whose "runs" are neither a mint batch, a
screen round, a fetch-drain lane, nor a meta-harness wave, but a fifth shape of its own — one extraction
pass over a defined corpus slice, pulling forward-looking-obligation events (a date, a kind, a source
span) out of source text; never a mint (nothing is minted) and never a fetch (nothing is fetched) — plus
`source-sweep` (RT lane, 2026-09-01), registered over `scripts/turns/run-source-sweep.mjs` and the two
dormant, pure, dep-injected enumeration modules it gives a runtime to for the first time,
`src/lib/sources/register-walk.mjs` (the date-paged EUR-Lex OJ / Federal Register index walk) and
`src/lib/sources/feed-walk.mjs` (the RSS/Atom feed walk): a sixth shape again, whose "runs" are
enumeration passes over a source's index/feed for a date range, writing discovered candidate URLs to the
`portal_link_candidates` ledger (never a mint, never an extraction, never a fetch-drain replay).
`meta-harness-run-001` through `-003` retrofit MH-1, MH-2, and MH-3
respectively — the same real-evidence retrofit discipline this file's own "screen-v1 loss" section
applies to the three original families, applied one layer up, to the harness that builds harnesses. A new
harness family — meta-harness and forward-events included — gets a new subdirectory and one addition to
`ALLOWED_FAMILIES` in `run-artifact.mjs` — never a family folded into an existing one just because it
seemed similar (mint and screen already looked similar to each other before this convention existed, and
that resemblance is exactly what made the loss below possible).

**meta-harness's standing metric** (build plan §2's "measurement, not assertion," per family): *proposals
implemented per cycle* — of a meta-harness proposer pass's hypotheses, how many land as a diff in the
NEXT meta-harness run (retrospective, like screen's operator-overturn rate — not measurable until a next
run exists to check against; `meta-harness-run-001`..`-003` predate the family's own first proposer pass,
so it is not yet measurable for any of them, honestly recorded as such rather than defaulted to zero) —
plus *gate-catch rate*: of the distinct defect classes named across ALL families' `defects_found` history,
the fraction now caught by a landed, automated, pre-coordinator-review check (a validator gate or a
fitness function) rather than only by a human/proposer reading full traces after the fact. This is a
small-N, retrospectively-computed number, not a statistically robust rate — see
`meta-harness/LAST-PROPOSER-PASS.md` for the current count and its method, recomputed at each meta-harness
run rather than asserted once and left stale.

**forward-events's standing metric** (build plan §2's "measurement, not assertion," per family): *extraction
precision* — of the emitted events a human hand-checked against their source text, the fraction whose
date, kind, and span all match — over events checked, not over all events emitted, since a run over a
large corpus slice checks a sample, not the whole population (same "checked, not emitted" honesty
`screen`'s ambiguous rate and `mint`'s validator-pass rate already apply to their own denominators) —
plus *coverage*: of the items in the run's corpus slice whose brief carries forward-obligation language
(a renewal date, a notice period, a sunset clause — whatever the family's own extraction protocol defines
as in-scope), the fraction with at least one extracted event. Precision without coverage would hide a
harness that only ever finds the easy events; coverage without precision would hide one that emits noise
to inflate its hit rate — the two are reported together for exactly that reason, the same pairing
`screen`'s ambiguous rate and operator-overturn rate serve for that family.

**source-sweep's standing metric** (build plan §2's "measurement, not assertion," per family): *candidates
discovered per walk*, broken down by walker (`register-eurlex` days, `register-federal-register` pages,
`feed` entries) and by disposition (`upserted` vs `failed` in the ledger write) — the enumeration-family
counterpart to `fetch-drain`'s capture-success-rate-per-attempt-class. A dry run's plan and an apply run's
actual ledger write are reported as the same shape (`persist`'s injected counting in dry mode vs its real
upsert in apply mode — see `run-source-sweep.mjs`'s own header), so the two are directly comparable run
over run.

**A named risk of self-application** (surfaced by meta-harness's own first proposer pass, Wave MH-4):
`meta-harness`'s governing files ARE this file and `PROPOSER-RUNBOOK.md` — the two documents every wave
that extends the substrate is most likely to touch (this very wave touched both). Combined with F28 rule
(c)'s whole-file-hash staleness coupling (deliberately not narrowed — see F28's own header), `meta-harness`
is structurally the family MOST likely to need a new run or a `PENDING-RUN.md` marker on any given wave,
including a wave whose only change to the meta-layer is a documentation clarification like this one. This
is not treated as a defect to fix (narrowing the hash would repeat the exact false-feeling-positive
tradeoff F28's header already reasoned through and rejected) — it is named here so a future lane is not
surprised by it, and so a run of unrelated documentation edits does not get mistaken for a real proposal
cycle just because it happens to be the thing that satisfies rule (c) for a given wave.

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

### `harness_version` — content hash, not a version string

Computed by `hashHarnessVersion(filePaths)` in `run-artifact.mjs`: SHA-256 over
`"<relative-path>\n<file content>\n"` for every listed file, sorted by path, truncated to 16 hex chars
and prefixed `sha256:`. Each family's harness files:

| Family | Hashed files |
|---|---|
| `mint` | `scripts/mint/MINT-RUNBOOK.md`, `validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`, `lib/gate-a-scan.mjs`, `lib/gate-a-match.mjs`, `lib/canonicalize-citation-url.mjs`, `../../src/lib/intake/record-facts.mjs` |
| `screen` | `scripts/mint/screen-rules.mjs`, `screen-worklist.mjs` |
| `fetch-drain` | `supabase/functions/capture-worker/index.ts` |
| `meta-harness` | `scripts/harness-runs/CONVENTION.md`, `PROPOSER-RUNBOOK.md`, `../lib/run-artifact.mjs`, `../../.discipline/fitness/functions/F28-harness-run-integrity.mjs` |
| `forward-events` | `src/lib/forward-events/extract-forward-events.mjs`, `../../../scripts/harness-runs/forward-events/PROTOCOL.md` |
| `source-sweep` | `scripts/turns/run-source-sweep.mjs`, `../../src/lib/sources/register-walk.mjs`, `../../src/lib/sources/feed-walk.mjs` |

A harness-family README or runbook edit that doesn't touch the files above does not change
`harness_version` — the hash tracks *behavior-bearing* files, not documentation. If a family's file list
changes (a new file becomes part of the classifier, say), update the table here in the same commit.
`meta-harness`'s row is the one exception that proves this rule rather than contradicts it: for the
meta-harness family, THIS file and `PROPOSER-RUNBOOK.md` are not "mere documentation" of some other
harness's behavior — they ARE the family's behavior (the schema a run artifact must satisfy, the cadence
a proposer pass must follow), the same deliberate call F28's own header makes for `MINT-RUNBOOK.md`. Note
also that `meta-harness`'s hashed files are NOT all in one directory the way every other family's are —
the table's usual shorthand (every file after the first is relative to the first file's own directory)
still applies via ordinary relative-path notation (`../lib/...`, `../../.discipline/...`), not a new rule;
see `hashHarnessVersion`'s test coverage in `run-artifact.test.mjs` for the exact resolution.

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
