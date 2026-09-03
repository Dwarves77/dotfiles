# ADR-025: Deterministic derivations auto-adopt with provenance; no human gate in the flywheel

Status: accepted (operator ruling 2026-09-03, "why is a human gate involved in the flywheel? that is a
sticking point"; "get it all done, leave nothing for later").

## Context

`docs/specs/08-flywheel-design.md` closes Loop B "without a human in the path", and the ledger's standing
correction states the flywheel has no human-review loop. Three side channels contradicted that in
practice, each built by a lane in the 2026-09-01/02 waves as an over-application of the operator's "no
assumptions" preference after the August census wave minted items with bad tags:

- connection-signature tags: `propose-tags.mjs` wrote proposals as `integrity_flags`, `apply-tags.mjs`
  applied only rows an operator resolved with `ratify:tags`, and no proposal was ever ratified (339 of
  619 verified live items untagged on 2026-09-03);
- L4 signal candidates: `analyze-corpus.mjs --signals` wrote candidates as flags labelled "operator
  review only, never auto-adopted" (930 open after the 2026-09-03 corpus turn);
- source classifications: `apply-classifications.mjs` required `ratify:classification`.

A gate that cannot be worked at its volume is not a safety property; it is a stall. The derivations in
question are deterministic, $0, reversible through the guarded path with snapshots, and carry their own
evidence.

## Decision

1. A deterministic derivation whose evidence meets a documented confidence threshold is adopted
   automatically, through the same guarded writer the ratified path uses, merge-only, with the audit
   trail on the flag row it came from (`resolution_note = 'auto-adopted:<kind>:<confidence>'`,
   `resolved_by = <script>`) or, for edges, the row's `origin`/basis.
2. Thresholds, per module, from each module's own evidence: tags adopt at `derive-tags.mjs`'s `high`
   tier (keyword in the item's own title or instrument key); signal candidates adopt when
   `signal-confidence.mjs` scores them decisive (one structured shared citation, or ≥2 independent title
   entity tokens); classifications adopt `scope_modes`/`scope_verticals` at `classify-source.mjs`'s
   `high` and `expected_output` always; `scope_topics` and `jurisdictions` stay review-only.
3. Everything below threshold remains a flag, exactly as before: the residue is the only thing a human
   is asked to look at, and never as a precondition for the flywheel to turn.
4. Widening the derivation INPUT (sections, FACT claims, a bounded window of the captured source,
   `tag-input.mjs`) and the VOCABULARY (legal-text aliases traceable to existing tags, `tag-aliases.mjs`)
   is how yield is raised; the matcher and the vocabulary's tag set are unchanged (ADR-007, ADR-019,
   ADR-020, ADR-021 bindings kept).

## Consequences

- `tag-ratification --arg auto`, `analyze-corpus.mjs --signals` (apply), and
  `apply-classifications.mjs --auto-adopt` are the adoption surfaces; each is idempotent.
- The 930 open signal flags and the tag proposal flags drain on the next apply of each surface.
- Measured on the 2026-09-03 population batch: tag yield 16 → 72 of 178 record-grade items with the
  widened input and aliases; 106 still get nothing because their text names no vocabulary tag, which is
  honest and stays so.
- Supersedes the "NEVER silent auto-tagging; tag PROPOSALS go to operator ratification" rule quoted in
  the tag scripts' headers (2026-09-01); the headers record the change.
