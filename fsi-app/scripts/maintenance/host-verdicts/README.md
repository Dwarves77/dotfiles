# Host verdict batches

A host the built-in class table (`src/lib/sources/host-authority.ts`) cannot place used to park its
`provisional_sources` row until a person edited `RULED_HOST_TIER` in code. It no longer waits: a session lane
classifies such hosts into a committed batch here, and `resolve-provisional-sources.mjs` applies the batch by
rule (rule b2, after the built-in rules and before the residue worklist). Same shape as
`scripts/turns/ledger-verdicts/`.

## How a session lane produces a batch

1. Export the unplaced hosts (read-only, no database write):
   `node scripts/maintenance/resolve-provisional-sources.mjs --arg export-unplaced --out <dir>` writes
   `<dir>/unplaced-hosts.json` (host, stored name(s), discovered_via). The `enumerate-unclassified-hosts`
   maintenance step writes the same file.
2. For each host, read the page title or self-description and pick ONE class from the table below. Write the
   title or description into `evidence`.
3. Commit the result as `host-verdicts-NNN.json` (zero-padded, next number) in this directory.

## Entry shape

`host`, `class`, `evidence`, `verdict_source` (always `"session-lane"`), `generated_at`. See `schema.json`.
A batch is `{ batch, generated_at, entries }`.

## Classes (the existing class table; the tier is read from it, never written here)

legal 1, gov 2, verifier 4, academic 4, association 4, standards_body 4, analysis 6, lawfirm 7, news 7,
company 7. An entry that names any other class, or carries a `tier` field, is rejected by the loader.

## Rules

- Later batch wins per host.
- The built-in rules run first; a verdict only places a host they leave unplaced.
- Aggregators and hosting platforms (`permanentlyUnregisteredClass`) never register, a verdict included.
- A rejected entry is reported in the run summary (`host_verdicts.rejected`) and never blocks the run.
- A host with no verdict stays recorded as residue, reason "awaiting host verdict batch", and the run exits 0.
- `host-verdicts-000.fixture.json` is the loader's test fixture; it does not match the batch filename
  pattern and is never applied.
