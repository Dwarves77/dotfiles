## 45. `resolve-signals`

**Purpose**: drain the `flywheel-signal:*` `integrity_flags` backlog -- Part 7 task 7.2 (1,098 open
`flywheel-signal:shared_title_entity` rows measured 2026-09-12). `analyze-corpus.mjs`'s own `--signals`
pass only runs inside `corpus-turn.yml`, and even there its pre-7.2 behavior never closed a candidate that
kept reproducing the SAME undecided verdict every run (the "already open, unchanged" bucket in its
dedup-before-insert convention). This step is the standalone dispatch runtime for the SAME decision path
(never a second copy): `detectSignalCandidates` (`src/lib/connections/signal-candidates.mjs`),
`planSignalAdoption` / `planSignalFlagResolutions` / `buildPreResolvedSignalFlagRow`
(`src/lib/connections/signal-confidence.mjs`), all imported unmodified.

**Upstream**: `scripts/maintenance/resolve-signals.mjs`. Recomputes every signal candidate fresh over the
live verified/non-archived corpus + the full `item_cross_references` edge set, then, per open flag:
`decisive` (its candidate now classifies decisive -- the edge is written via `write-edges.mjs`, and the
flag closes with the `auto-adopted:signal:<kind>:<weight>` note); `undecided` (still below the decisive
threshold -- closes with `resolution_note` `"below the decisive threshold, no edge; score=<s> (<reason>)"`,
per ADR-030's "a decision of 'no action, and why' is a valid close"); `stale` (the pair no longer
reproduces at all -- item archived/unverified since; closes with the pre-existing "no longer detected"
wording). A brand-new candidate with no existing flag row yet is inserted ALREADY RESOLVED
(`status='resolved'` at insert) so a fresh finding never sits open even momentarily.

**Ruling**: ADR-030 rider / task 7.2. Not gated by a separate `arg` token; apply needs no `arg`.

**Dispatch**: `mode=dry` reports the full disposition split (`counts.dispositions.decisive` /
`.undecided` / `.stale`), the would-adopt edge count, and a 20-row sample per outcome
(`counts.sample_decisive` / `counts.sample_undecided`) -- writes nothing. `mode=apply` writes the
decisive edges, resolves every open flag with its disposition, and inserts any brand-new
already-resolved rows.

**Artifact / read back**: `summary.json`'s `counts.dispositions` and `read_back.remaining_open` --
confirm against `SELECT count(*) FROM integrity_flags WHERE status='open' AND created_by LIKE
'flywheel-signal:%'` (0 expected after a clean apply, per the population report's open-flags-by-family
entry).

**Resolution-note format**: this step's `resolution_note` is plain text (not the shared
`decision-note.mjs` DECISIONS_JSON grammar `tag-ratification`/`apply-classifications` use below) --
one candidate maps to exactly one flag 1:1 (no multi-proposal decomposition needed), so a single
human-readable line already carries everything an admin view needs.
