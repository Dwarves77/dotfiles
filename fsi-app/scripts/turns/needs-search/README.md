# needs-search files: a session lane's source URLs for open needs

Same family shape as `scripts/turns/question-answers/`: a committed batch file a session lane authors offline, a
pure validator (`schema.mjs`) that checks it end to end before anything is written, an apply step, and a harness
family. Free only: URLs are found in a session by sub-agents from the exported bundle, never by a metered API call.

A need is an open integrity flag that states, in words, a source the system wants and does not hold. The system
raises them by rule; this batch is the step that finds the source, replacing the operator-found URL the
ratify-flag-to-census path used to need.

| Kind | Flag namespace | Raised by | What the found URL becomes |
|---|---|---|---|
| `term-need` | `term-need:*` | an adopted vocabulary term with no authoritative holding (`raise-term-needs.mjs`) | a `census_worklist` row (lane C) |
| `holdings-need` | `holdings-need:*` | a question the held text cannot answer (`apply-question-answers.mjs`) | a `census_worklist` row (lane C) |
| `flywheel-gap` | `flywheel-gap:*` | a coverage gap in a theme (`analyze-corpus.mjs`) | a `census_worklist` row (lane C) |
| `lineage-gap` | `lineage-gap:absent-parent` | an item names a parent instrument that is not held | a `portal_link_candidates` row |

The kind decides the output (`schema.mjs` `OUTPUT_FOR_KIND`). The reason for the lineage split: a CELEX parent already
goes to `portal_link_candidates` through the EUR-Lex register walk (lane G5-NEED), so every lineage parent reaches the
ledger consume the same way. A census row feeds the population turn.

## The flow

1. **Export** (read only): `node scripts/turns/export-needs-for-search.mjs --out-dir <dir>`, or dispatch
   `.github/workflows/needs-search.yml` with `action=export`. ONE bundle file per run.
2. **Author** a batch from the bundle (below) and commit it as
   `scripts/turns/needs-search/batches/needs-search-NNN.json`, zero padded, incrementing.
3. **Apply**: `node scripts/turns/apply-need-urls.mjs --batch <file> [--execute]`, or the workflow with
   `action=apply`, `mode=dry|apply`, `batch_file=scripts/turns/needs-search/batches/needs-search-NNN.json` (fsi-app
   relative). Dry by default. `--fixture <corpus.json>` runs either CLI over an in-memory corpus
   (`fixtures/corpus.fixture.json`) with no database.

## The bundle (what the author reads)

Per need: `need_id` (the flag id), `kind`, `subject_ref`, `text` (the need in words), `key`, `created_at`,
`context` (the term kind and id, or the item, surface and product question, or the gap type and theme, or the
citing item and the absent identifiers with their CELEX ids), `output` (what the URL becomes) and `satisfies`
(the requirement, the authority floors by item type, how the source is rated, what the URL is used for).

Skipped, never listed: a need whose flag carries nothing a search can use (counted as residue), a lineage flag whose
every named parent is now held, and a need an earlier apply already served (same `key`) that the generator raised
again under a new flag id while the document is still working through the pipeline.

## The batch

```json
{
  "batch": "needs-search-001",
  "generated_at": "2026-10-07T00:00:00Z",
  "authored_by": "session-lane",
  "entries": [
    {
      "need_id": "<from the bundle>",
      "url": "https://<the institution's own page>",
      "institution": "<who publishes it>",
      "why_authoritative": "<one or two sentences: why this page is the institution's own statement of the thing>",
      "confidence": 0.8,
      "host_verdict": { "host": "<bare host>", "class": "<a class>", "evidence": "<page title or self-description read>", "verdict_source": "session-lane", "generated_at": "2026-10-07T00:00:00Z" }
    }
  ]
}
```

`host_verdict` is optional and needed only when the host is one the class table cannot place. `batches/needs-search-001.json`
is a worked example over the fixture corpus; it is a proof input, not a finding (applied against the live database
it is refused whole as unknown needs, which is the expected, recorded result).

- `url`: absolute `http` or `https`, no credentials, at most 2000 characters. A page of the institution that
  publishes the thing, not a republisher or hosting platform.
- `institution` (200 characters), `why_authoritative` (600 characters), `confidence` (a number from 0 to 1).
- No `tier` field. A batch names a source, never a tier (CLAUDE.md rule 18).

### How the source is rated

The tier is read from the institution class table (`src/lib/sources/host-authority.ts`) **by host alone**. The
`institution` text is never used to rate: a name that sounds like an association cannot lift an unplaced host.

1. A host the table places is rated by it (for example a legal publisher is tier 1, a government host tier 2).
2. Otherwise a host verdict places it: a committed `scripts/maintenance/host-verdicts/host-verdicts-NNN.json` entry
   for the host, or the entry's own `host_verdict` in the host-verdicts entry format (`host`, `class`, `evidence`,
   `verdict_source` always `"session-lane"`, `generated_at`; the loader's own validator checks it; `class` is a key of
   `HOST_CLASS_TIER`; a `tier` field is rejected). The verdict's `host` must be the URL's host. The tier is the table's
   tier for that class.
3. An aggregator or hosting-platform host is never rated, a verdict included. Cite the publisher's own page.
4. Otherwise the entry is refused: the host is unrated and no verdict places it.

A below-floor tier is **not** a refusal (rule 18: the source is found and rated, never the figure refused). The
need closes only when a held item's primary source clears its type's floor (`holdingQualifies`), so a low-tier URL
registers and mints but the generator may raise the need again.

## `validateNeedsFile(json, ctx)` and its refusals

A structural problem (not an object, a `batch` not named `needs-search-...`, `authored_by` not `"session-lane"`,
`entries` not an array or over 200) fails the whole file closed. Every other refusal is per entry: the entry is
refused whole, its reasons recorded as residue, and it never blocks the valid entries beside it (no human gate):

1. a `need_id` that is not an open need flag (unknown, resolved, a question flag);
2. a `tier` field, a missing or malformed url (not http or https, credentials, too long), a missing institution or
   why_authoritative, a confidence outside 0 to 1;
3. a `host_verdict` that fails the host-verdicts validator, names another host, or sits on an aggregator host;
4. an unrated host with no verdict;
5. a duplicate `need_id` in one batch.

## Apply

Dry by default. With `--execute`, per valid entry and in this order (a crash between steps is repaired by the next
run): register the source for the host through `registerSource` (idempotent by institution key; an existing source
is reused as it stands); create the census row through `ensureCensusRow` (`ratify-flag-to-census.mjs`; the identity
`flywheel-ratified:<flag id>`, lane C, skipped when the source and document already have a row) or upsert the portal
candidate; resolve the need flag (`resolved_by` `apply-need-urls`, a `resolution_note` carrying the need key, url,
source id, tier and row). Each write is read back. A second apply is a no-op. The run artifact reports sources
registered or reused, census rows and portal candidates created, flags resolved.

Known interplay, stated so it is not rediscovered: a generator that derives a need from a standing condition
(`raise-term-needs.mjs`, `analyze-corpus.mjs`, the lineage backfill) raises it again under a new flag id while the
document is still being minted. The export reads the resolution marker and does not list the new flag, so the
need is searched once; the generator closes the new flag by its own rule when the condition clears. A lineage flag
that names several absent parents is resolved by one URL, and the backfill raises a fresh flag for the parents
still absent.
