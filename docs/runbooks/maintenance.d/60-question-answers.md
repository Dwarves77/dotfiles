## 60. `question-answers`

**New this runbook, lane L4-B, 2026-10-05 (ADR-044).** Not a `maintenance.yml` step: it has its own dispatch
workflow, `.github/workflows/question-answers.yml` (no schedule; chained since lane CHAIN-4, 2026-10-08: a `workflow_run` edge off "Population turn" and "Propagation drain", loop hops 14 and 15, which runs `action=export` only and is forced dry while build mode holds; `apply` stays on push of a committed batch or hand dispatch), because
the export writes a bundle file and the apply reads a committed batch, the same shape as `theme-briefs.yml`.

**Purpose**: the system asks itself what a change means, answers from what it already holds, and writes the
answer down as a labelled inference. A question is an open `question:` flag (the trigger generator's rows). The
export lists the ones held source text could still answer; a session lane authors a batch; the apply step
validates it and writes the first `inference_records` row, or records that holdings cannot answer. No model
call, no search call, no operator review step.

**Logic**:
1. `action=export` runs `scripts/turns/export-questions-for-answers.mjs` (read only). Per open question: the
   question, event context, a `pool_hash`, and for the question's item and up to 8 connected items (typed edges
   first) the claims, forward events and held pool text under a character budget with honest truncation counts.
   Skipped: a question whose own item is archived, unverified or Community-only; an unanswerable one whose
   held pool is unchanged (listed again, as `reasked_after_new_holdings`, when the pool hash changes).
2. A session lane authors `scripts/turns/question-answers/batches/question-answers-NNN.json` (contract:
   `scripts/turns/question-answers/README.md`) and commits it.
3. `action=apply` runs `scripts/turns/apply-question-answers.mjs --answers <file>`. Every entry is validated
   whole (open question, live `pool_hash`, verbatim spans, claim ids, citable items, ceilings, the CONFIRMED
   quotation rule); a refused entry is residue with its reasons and never blocks the others. With `mode=apply`
   (`--execute`): an answered question writes ONE inference (`origin_class` derived, `trigger_question_ref` the
   question's subject_ref, method `infer-from-question@v1`) then closes the flag naming the inference id; an
   unanswerable one records `unanswerable_from_holdings` on the flag, which stays open.

**Dispatch**: `gh workflow run question-answers.yml -f action=export`, or
`-f action=apply -f mode=dry -f answers_file=scripts/turns/question-answers/batches/question-answers-001.json`
(fsi-app relative). `mode=dry` is the default and writes nothing. No data population before every build layer is
complete (operator ruling 2026-10-04): the first real dispatch is the coordinator's.

**Artifact / read back**: family `question-answers` (`scripts/harness-runs/question-answers/`), landed into
`harness_runs` by the workflow's last step. Export metrics: open questions, listed, skipped by reason,
omitted by the budget. Apply metrics: valid, refused, already applied, inferences written, questions closed,
outcomes recorded, search targets raised (0 by design, see below). Read back an apply with
`SELECT inference_id, trigger_question_ref, status_token, confidence FROM inference_records ORDER BY computed_at DESC`
and the flag with `SELECT status, resolution_note FROM integrity_flags WHERE created_by LIKE 'question:%'`.

**Idempotency**: a second apply of the same entry writes nothing (reported as already applied); an inference
written but its flag not closed after a crash only closes the flag; a re-opened question answered again writes a
new inference that supersedes the prior one.

**Search targets**: an unanswerable question raises ONE open `holdings-need:<product question>` flag (its own
namespace, distinct from `lineage-gap:`, one open row per question subject_ref, the need in words and its item,
surface and product question in the `find-source` action), closed by rule when the question is answered. The free
runtime that reads them is `scripts/research/research-walker.mjs` (`--holdings-needs`, bounded, dry by default;
OpenAlex works search). See the README for what it cannot do.

**Invalidation**: the close-out of an answered question records the `pool_hash` it answered against; the export
lists the question again as a re-answer when the held pool differs, and the apply writes the new inference with
`supersedes` set to the prior one. `drain.ts` Pass 2b also re-opens the question of a recomputed inference
(`reopenQuestionForRecompute`).

---
