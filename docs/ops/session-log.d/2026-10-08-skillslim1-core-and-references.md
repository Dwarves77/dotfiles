# 2026-10-08 SKILL-SLIM-1 (skillslim1-core-and-references): a gate-demanded skill load costs its core

## Accomplished

- Each of the six gate-demanded skills (`GOVERNED` in `skill-map.mjs`) now has a SKILL.md that is a core of at most 12,000
  bytes: frontmatter unchanged (`when_to_load` included), the binding sections stated in full, and a "Reference index"
  block (right after the title) naming each reference file with one line on when to read it. Every other section moved
  verbatim, unreworded, to `fsi-app/.claude/skills/<skill>/references/<slug>.md`.
- Bytes, before to after (SKILL.md only; references are read on demand):

| skill | before | core after | references |
|---|---|---|---|
| remediation-discipline | 166,101 | 11,799 | 10 files, 156,918 |
| environmental-policy-and-innovation | 81,745 | 11,953 | 7 files |
| caros-ledge-platform-intent | 46,687 | 11,012 | 5 files |
| source-credibility-model | 43,380 | 11,928 | 7 files |
| analysis-construction-spec | 34,133 | 10,750 | 6 files |
| sprint-followups-discipline | 32,948 | 11,918 | 5 files |

  Total a full set of gate loads now bills 69,360 bytes of cores against 404,994 before.
- Conservation proven on all six against the pre-split blob (`git show 023d47588:<path>`): 0 pre-split non-blank lines
  lost; the only added lines are the index block (2 lines plus one per reference file).
- Size guard, index check, conservation proof, governing-docs check and the meta-gate aggregate check are in
  `fsi-app/.discipline/skill-slim.test.mjs` (auto-discovered by `git ls-files`, run by the suite), each with an attack test.
- Coordinator ruling 2: every moved section the pre-split file marked binding, mandatory or ruled (25 sections, found by a
  marker over the heading and its first five lines) has a core line `BINDING: references/<file>.md, read before <trigger> (section: <key>)`;
  the skill-slim test asserts each one and attacks a removed and a mis-filed line.
- Coordinator ruling 1 (rule 022 false positive): `fsi-app/.discipline/lib/context.mjs` `buildIntroduced` spent every removal that
  an in-hunk pairing consumed, so a line moved across files whose source had been paired with an unrelated added line (the
  Research Analysis contract line) read as newly written. A removal paired with identical text or a genuine edit
  (token similarity at or above 0.5, EDIT_SIMILARITY) is still spent; any other paired removal is a second pool that credits a
  moved line in a DIFFERENT file only (same-file behavior unchanged, `context.range.test.mjs` still holds). Two tests added to `context.test.mjs`, red on the old code, green
  on the new, plus the guard that a genuinely new glyph line (and a second copy of a moved line) still fails.
- The gate, `skill-map.mjs`, `skill-token.mjs`, rules, hooks and workflows are untouched.

## Consumers enumerated BEFORE editing (item 1)

Gate side (SKILL.md path or existence only, no section text read; unchanged and still correct): `pretooluse-skill-gate.mjs`,
`skill-token.mjs` (the path must end `/.claude/skills/<slug>/SKILL.md`), `skill-map.mjs`, `skill-contract-map.mjs`
(PINNED_MANIFEST skillPath existence, slug listing by directory), `skill-drift-gate.test.mjs`, `memory-gate.test.mjs`,
`pretooluse-honest-forms.test.mjs`, `skill-token.test.mjs`.

Readers of the skill TEXT, changed:
- `governance/invariant-coverage.mjs`: reads each skill via `SKILL_FILES` and checks every invariant `anchor` (156
  invariants) and the normative-marker count against the merge-base. Both now read the aggregate (core plus tracked
  `references/*.md`), HEAD side from the tracked set and merge-base side via `git ls-tree`. Before this change the
  meta-gate on the split tree reported 134 ANCHOR DRIFT and 6 MARKER DRIFT; after, PASS (156 invariants, 63 doctrines).
- `governance/doctrine-contradiction.mjs`: `DOCTRINE_FILES` (human-gate sweep, also read by `docs-only-range.mjs`) now
  includes every `references/*.md`, derived from the tree, never a hand list.
- `governance/docs-only-range.mjs`: `GOVERNING_PATTERNS` gains `.claude/skills/<slug>/references/<file>.md`, so a change to a
  reference is never docs-only (also covered through `DOCTRINE_FILES`).
- `src/lib/agent/skill-prompt-parity.test.mjs`: the Fields block now reads
  `environmental-policy-and-innovation/references/storage-and-field-emission.md`; the 16 rules stay in the core.

Citation comments, changed to the reference path (comment text only): `src/lib/agent/formats/{market,operations,operations-matrix,research,technology,regulation}.ts`,
`src/lib/agent/{contract-version.mjs,system-prompt.ts,parse-output.ts}`, `src/lib/domains.ts`,
`src/lib/sources/bias-tag-pipeline.mjs`, `src/lib/credibility/bias-display.mjs`,
`src/app/api/admin/{canonical-sources,sources}/recommend-classification/route.ts`,
`scripts/maintenance/institution-canonicalize.mjs` (header comment only).

## Read and reused

Read: `docs/dispatches/lane-common-contract.md` headings, `skill-map.mjs`, `skill-contract-map.mjs`, the head of
`docs-only-range.mjs`, `doctrine-contradiction.mjs`, `invariants.mjs` and `invariant-coverage.mjs` (skill-reading and
marker-floor code), `skill-prompt-parity.test.mjs`, the six skills' heading maps, and the new cores of remediation-discipline,
environmental-policy-and-innovation, analysis-construction-spec (which also satisfied the gate for the governance and agent
edits) and the head of source-credibility-model.
Reused: `gitFileAtBase` and the `git ls-tree` pattern already in `invariant-coverage.mjs`, `auditInvariants` for the
aggregate attack test, `isDocsOnlyPath`, the existing `DOCTRINE_FILES` consumers, test auto-discovery.

## Decisions (made by rule, none waits on anyone)

- "Binding rules stated in full" within a hard 12,000-byte core: the core carries each skill's governing principle and the
  rules the gate demand exists for (remediation: purpose, the class-over-instance statement, recognition criteria,
  investigation discipline, when it does not apply; env-policy: Core Lens, Integrity Rule, the 16 Rules; platform-intent: Value
  Delivery Check, scope test and the five contracts; source-credibility: model, tier criteria, override rules; analysis-
  construction-spec: construction method, grounding models, Context and No-Vacuum rules; sprint-followups: Core Rule, protocol,
  inventory consistency, load confirmation). Sections that did not fit moved whole, with a one-line trigger in the index.
- A section is never split from its own text, except a `###` child moves with its own text apart from a `##` parent (the
  heading travels with the child).
- Conservation is strict against a pinned base commit (no pre-split line lost, multiplicity included). A later deliberate edit
  of a pre-split line records the old line in `ACKNOWLEDGED_LINE_CHANGES` in the test file. Additions are free.

## NOT done

- Binding sections that did not fit the core now live in references and cost a read when their trigger fires. Notably:
  environmental-policy-and-innovation "The Workspace-Anchored Rule (mandatory, never violated)" (references/workspace-anchoring-and-lenses.md),
  remediation-discipline category rules 1 to 58 (references/categories-*.md; each is also enforced by its named RD invariant),
  platform-intent "Authority Grant" and "Anti-Patterns". Coordinator may want the gate to name a reference per path later. [WORK: RULES-X-1]
- Docs under `docs/` that cite "SKILL.md section N" were not rewritten (outside the write set). Source comments that cite [WORK: DOCS-5]
  a SKILL.md section which stayed in the core were left as they are.
- `.claude/skills/ledger/SKILL.md` (14,294 bytes) is not gate-demanded and was left. [NOT-WORK: fact, no action]

## Open items

- None blocking. CI result is recorded in the PR. [NOT-WORK: fact, no action]
