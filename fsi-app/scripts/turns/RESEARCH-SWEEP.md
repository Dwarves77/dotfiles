# Research sweep — a $0 data path for the Research surface (Lane RSRCH, 2026-09-02, wave 2)

Every run's history belongs in `scripts/harness-runs/source-sweep/` — this subject shares that family's
directory, run_id sequence and `CONVENTION.md` schema; see `research-sweep.mjs`'s own header for exactly
why it is a *subject* of the existing `source-sweep` harness family rather than a newly registered one
(`ALLOWED_FAMILIES` in `scripts/lib/run-artifact.mjs` and F28's `GOVERNING_FILES` table are both
coordinator-only files outside this lane's write set).

Absolute rule: **$0, no LLM, no paid API, no DB write except a routine read of `sources`.** Every fetch is
a plain, politely-rate-limited `GET`. Discovery state ("have I already turned this URL into a row") lives
in a git-committed JSON manifest, not a database table.

## What it does

1. **Selects** research-role sources from the live `sources` registry. The exact query (docs/plans/wave2-lanes-2026-09-02.md:
   "Identify the registry subset by role/category — state the query"):

   ```sql
   sources.category = 'research' AND sources.status = 'active'
   ```

   (`RESEARCH_SOURCE_SELECTION_QUERY` in `research-sweep.mjs`.) Verified against migration 084 §7's live
   `get_research_items` RPC body — this is the *exact* WHERE clause that routes items onto the live
   `/research` surface, so membership in this subset is definitionally on-vertical, not a lane-invented
   rule. Migration 084 §2's backfill resolves `category = 'research'` for: `source_role IN
   ('academic_research', 'intergovernmental_body')` by default (IMO/ICAO are name-excepted to
   `'regulatory'` first, so they are correctly excluded here); PLUS eight name-excepted analytical-press
   sources (`source_role = 'trade_press'`: Loadstar, FreightWaves, GreenBiz, Splash247, Supply Chain
   Digital, Reuters Sustainable Business, Edie, Environmental Finance); PLUS two name-excepted
   `statistical_data_agency` sources (Carbon Trust, Project Drawdown). `get_research_items`'s two
   *item-level* status conditionals (a `standards_body`/`primary_legal_authority` source's *existing item*
   reclassifying to Research by that item's own status) are out of scope for a source-selection query and
   are not modeled — they apply to items already minted, not to a document a fresh sweep is discovering.

2. **Fetches** each selected source's own listing/feed page (one request/second, `research-sweep.mjs`'s own
   politeness gap, mirroring `run-source-sweep.mjs`) and **discovers** candidate document links — RSS/Atom
   via `feed-walk.mjs`'s `parseFeedEntries` when the body looks like a feed, else `extractPortalLinks` from
   `portal-links.mjs` (the same two extraction primitives `register-walk.mjs`/`feed-walk.mjs` already use;
   imported, never re-implemented).

3. **Filters** to new documents only, against a git-committed seen-URL manifest
   (`scripts/harness-runs/source-sweep/research-sweep-seen-urls.json` by default; only updated in
   `--mode apply`). This subject has no `portal_link_candidates` DB ledger write available to it (that
   ledger belongs to `run-source-sweep.mjs`'s two register/feed walkers), so "new" is tracked locally
   instead — the same posture a harness-run artifact's own committed history already gives every other
   family.

4. For each new candidate, applies `congruence("research_finding", url)`
   (`src/lib/entities/source-role.mjs`, unmodified, read-only). A URL that reads as `news` (a press
   release, not the study itself) is skipped from record-building — docs/specs/03-research.md §1: "a press
   release ABOUT the study is a lead/corroborator, not the primary" (source-role.mjs's own 1b rule for
   `STUDY_BACKED_TYPES`). The skip is recorded (`outcome: "skipped_incongruent_source"`) and the URL is
   marked seen — a stable, deterministic judgment, never re-checked forever.

5. **Builds** a research-grade record payload via `buildResearchRecordPayload`
   (`src/lib/intake/record-facts-research.mjs`) and **validates** it with the family's own unmodified gate,
   `validate-mint-payload.mjs` (imported read-only, exactly as `run-mint-batch.mjs` already does).

6. **Writes** two output shapes in `--mode apply` (see "Two output shapes," below) plus a raw per-source
   trace, in both modes, and always records a `source-sweep` harness-run artifact from a `finally` block.

## The research-grade record profile

`buildResearchRecordPayload` produces `item.grade = "record"`, `item.item_type = "research_finding"`, and
seven claims (FACT when the captured text states one, verbatim, GAP otherwise — never invented):

- **Four required slots** (`item-type-required-slots.json`'s `research_finding` row):
  `finding`, `methodology_limits`, `decision_relevance`, `does_not_resolve`. `buildRecordPayload`
  (`record-facts.mjs`, unmodified, read-only) supplies the honest GAP floor for these; this lane's own
  triggers (research/analytical prose — "this report finds," "limitations of this study include") upgrade
  any of the four to a FACT when the source states one.
- **`key_figure`, always present.** A FACT (a verbatim quantified figure — digit plus a unit/%/currency
  marker) when the source states one, else an explicit GAP carrying the surface's own copy ("no key figure
  yet" — the exact honest em-dash state `src/components/research/ResearchLedger.tsx` already renders,
  docs/design/redesign/DESIGN-DEVIATIONS.md D06-2). Never simply absent — `docs/plans/wave2-lanes-2026-09-02.md`:
  "`NO KEY FIGURE YET` becomes a real figure only from the source."
- **`evidence_agreement_signal` and `source_authority_signal`, always present.** The two research
  credibility inputs docs/specs/03-research.md §4 names ("Score 1, evidence base" and "Score 2, source
  authority"). Spec 03 §4's *full* computation needs paid/keyed APIs (OpenAlex FWCI, ROR institution
  types, topic-scoped standing) this $0 lane does not call. What this lane does instead, honestly: the
  same verbatim-span-or-GAP discipline every other slot uses — a document that itself states "this study
  was peer-reviewed" or "independently funded by [public body]" carries that as a FACT; a document that
  states neither carries an explicit GAP, never an inferred score.

## The screen contract

Every payload carries, per `docs/plans/wave2-lanes-2026-09-02.md`'s exact contract for research sources:

```json
"screen": { "verdict": "on_vertical", "provenance": "registry", "basis": "<the source's registry role>" }
```

`provenance: "registry"` because this verdict is never a content-based rule match against the fetched
document — it is membership in the on-vertical registry subset (the query above), decided *before* any
document is even fetched. `basis` is just the source's own `source_role` field (falling back to
`category`, then `"unspecified"`) — not the query prose, which is auditable once per run instead, in that
run's harness-run artifact `config.source_selection_query`.

### Known kit-check gap (report to the coordinator)

`validate-mint-payload.mjs`'s screen kit check (`hasProvenance`) currently accepts only `provenance`
`"rule"` or `"reviewed"`:

```js
const hasProvenance = !!screen && typeof screen === "object" && ["rule", "reviewed"].includes(screen.provenance);
```

Because this sweep's own contract stamps `provenance: "registry"`, **every research-sweep payload is
currently quarantined by `screen_verdict_missing`** until this allowlist is widened. The fix is one line
in that coordinator-only file:

```diff
- const hasProvenance = !!screen && typeof screen === "object" && ["rule", "reviewed"].includes(screen.provenance);
+ const hasProvenance = !!screen && typeof screen === "object" && ["rule", "reviewed", "registry"].includes(screen.provenance);
```

This is pinned as a passing test (`record-facts-research.test.mjs` and `research-sweep.test.mjs`, both
asserting the CURRENT quarantined behavior) so the gap stays visible rather than silently worked around,
and so the fix's effect is verifiable the moment it lands: both tests should be revisited (they currently
assert `valid: false` / `built_invalid`) once the allowlist widens.

## Two output shapes, and why both

`--mode apply` writes, under `<harness-runs-dir>/traces/` by default:

1. **`<run_id>.census-rows.json`** — rows in exactly the shape `run-mint-batch.mjs`'s documented
   `--census-rows` contract expects, so the population runtime can consume this file today with zero
   changes to any coordinator-only file. **Limitation, stated honestly:** `--census-rows` rebuilds every
   row through the *generic* `buildRecordPayload` (`record-facts.mjs`), which has no research-language
   triggers — a row consumed via `--census-rows` gets four honest GAP claims (plus the screen verdict,
   which IS carried through), not this lane's finding/methodology/credibility extraction. This path is a
   floor, not the enhancement.
2. **`<run_id>.payloads.json`** — the fully built, already-validated research-grade payloads (via
   `buildResearchRecordPayload`), in `run-mint-batch.mjs`'s other, also-unmodified input shape:
   `--batch-file`. **This is the recommended path** — it preserves the research-profile extraction:

   ```
   node scripts/mint/run-mint-batch.mjs --batch-file <run_id>.payloads.json
   ```

   runs these payloads through the same unmodified validator + apply chain, no new code, no
   coordinator-only file touched (once the kit-check gap above is closed).

`--mode dry` writes only a raw per-source trace (`<run_id>.raw-per-source.json`) and the harness-run
artifact — no census rows, no payloads, no seen-urls manifest update.

## Usage

```
node scripts/turns/research-sweep.mjs --mode dry
node scripts/turns/research-sweep.mjs --mode apply [--max-sources 25] [--max-docs-per-source 10]
  [--seen-urls-file path] [--out-dir dir] [--harness-runs-dir dir]
```

Requires `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (a routine, unguarded *read* of the
`sources` registry only — this script never writes to the database). Exit 0 done · 1 bad args · 2 no DB
creds.

Dispatched via `.github/workflows/source-sweep.yml` with `walker: research` (a distinct choice value from
the register/feed walkers `run-source-sweep.mjs` drives — `research-sweep.mjs` needs no `from`/`to`/
`feed_url`). Dispatch-only, no schedule, `mode: dry|apply` — same posture as every other subject in that
workflow.

## Deps-injected / tested without a database

Every network call is behind an injected `fetchText` (see `sweepOneSource`'s `deps` parameter) — no test
in `research-sweep.test.mjs` touches the network or a live database. `selectResearchSources`,
`discoverCandidateLinks`, `normalizeUrlKey`/`filterNewLinks`, `stripHtmlToText`/`extractHtmlTitle`,
`screenForSource`, `censusRowFor` and `sweepOneSource` are all pure or dep-injected and independently
tested there; `record-facts-research.test.mjs` independently tests the payload builder itself, including
against the real `validate-mint-payload.mjs`.
