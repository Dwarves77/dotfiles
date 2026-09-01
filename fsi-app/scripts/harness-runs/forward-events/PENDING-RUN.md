# Pending run — forward-events

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`forward-events` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed:** lane FIX (integration), 2026-09-01. `extract-forward-events.mjs` moved from
`scripts/forward-events/` to `src/lib/forward-events/` — content and `EXTRACTOR_VERSION`
(`fe1-2026-09-01.1`) unchanged, only its path, so that the intake mint chokepoint (`src/lib/intake/
mint-item.ts`, contract rule 16) can import it as a runtime `src/lib` module without a runtime `src/`
file reaching into `scripts/` (no other runtime `src/` file does this anywhere in the repo — see the
extractor's own header comment for the full argument). `F28`'s `GOVERNING_FILES.'forward-events'` and
`run-extraction.mjs`'s `FORWARD_EVENTS_GOVERNING_FILES` were updated to the new path in the same commit,
which is exactly the edit that trips this rule: the governing-file *set* is unchanged in substance (still
the extractor + `PROTOCOL.md`) but its hash input (`hashHarnessVersion` hashes `"<rel-path>\n<content>\n"`
per file) necessarily changes when the path changes.

**Why this is not itself a new extraction run:** the extractor's logic, rule table, and
`EXTRACTOR_VERSION` did not change — only mint-item.ts gained a NEW CALLER of the unchanged extractor
(task: wire rule-16(b)/(d) into the mint chokepoint). `forward-events-run-001.json` (322 live items, 902
events) remains the accurate record of the extractor's actual behavior; nothing about that record is
invalidated by where the file lives.

**harness_version at write time:** `sha256:0a36113e8e96ade5`

**The planned run that supersedes this marker:** the next `forward-events-run-NNN.json` produced by
`scripts/forward-events/run-extraction.mjs` (which now imports the extractor from its new home) — a
routine re-run over any corpus slice will re-hash to this same value and land a matching artifact, at
which point this marker is stale-by-match and must be deleted per F28's reverse-audit (an artifact
matching the marker's recorded hash means "the planned run happened — delete the marker").
