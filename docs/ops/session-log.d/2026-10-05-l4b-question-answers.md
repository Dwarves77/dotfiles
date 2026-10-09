# 2026-10-05 L4-B: questions get answered, an answer becomes the first inference

Lane l4b-question-answers (ADR-044 decision 1 and 3). Fixtures only, nothing applied, no database, no network.

## Accomplished

- `src/lib/sources/seek-more.mjs`: `queryHeldPools(question, deps)` (the real step 1 of `seekAnswerForQuestion`,
  own item then connected items, only items with a usable capture are hits) and `heldPoolHash(hits)` (the shared
  pool-identity hash over item plus url). `seekAnswerForQuestion` changed by one local alias; its priced branch is
  untouched and still has no caller.
- `src/lib/propagation/methods/infer-from-question.ts`: `registerFirstInference` and `buildFirstInferenceInput`
  (the first write: origin derived, method `infer-from-question@v1`, `computed_by` = `question-answers:<batch>`,
  `trigger_question_ref` set, `inputs` empty), `computeInferFromQuestion` now returns `reopenQuestionRef`, and
  `reopenQuestionForRecompute` re-opens the originating question with the generator's own flag row and the same
  dedup rule. Not called by `drain.ts` (outside this lane).
- `scripts/turns/export-questions-for-answers.mjs`, `scripts/turns/apply-question-answers.mjs`,
  `scripts/turns/question-answers/` (README, schema, data, artifact, fixture-deps, fixtures, test): the export,
  the batch contract, the validator and the apply step. 43 tests in the lane's test file, plus 5 added to the
  seek-more test and 8 to the infer-from-question test.
- Harness family `question-answers` (family.json, FAMILY.md, pending marker), meta-harness and inaccessible-triage
  pending markers, `.github/workflows/question-answers.yml` (dispatch only, chained-dry-guard step, not chained),
  runbook step `docs/runbooks/maintenance.d/60-question-answers.md`, one row in
  `fsi-app/docs/inventories/shared-dataset-ownership.md`.

## Read and reused

- Reused: the theme-briefs pattern end to end (workflow, artifact shape, fixture database `theme-briefs/fixture-deps.mjs`,
  `CLAIM_COLUMNS` and `EVENT_COLUMNS`, `figureTokens`), `record-facts.mjs` `assertVerbatim` (the record-briefs span
  check), `source-pool-hash.mjs` `hashSourcePool`, `usableCapturesOrdered`, `surfaceOf`, `flag-namespaces.mjs`,
  `PRODUCT_QUESTIONS`, `generateTriggerQuestions` and `triggerQuestionFlagRow` (imported, not copied),
  `register_inference_record` (migration 339) through `registerInferenceRecord`, `guardedUpdateByIds`.
- Read: the code register sections Q1 to Q3 and Q6 to Q8, ADR-044 text, ADR-016/024/025/036/039/041/042,
  the analysis-construction skill, `seek-more.mjs`, `trigger-questions.mjs`, `constants.mjs`, migrations 338 and 339,
  `lineage-gap-targets.mjs` and its runbook step, `lineage-backfill.mjs`, `entity-resolve.mjs` `planLinkWrites`,
  `link-items.ts`, `gaps.mjs`, `drain.ts` Pass 2b, the integrity_flags DDL (048, 050).

## Decisions

- Migration 352 is NOT needed: `integrity_flags` already has `recommended_actions` jsonb, `status`, `resolved_*` and
  `resolution_note`; the unanswerable outcome is a `recommended_actions` element
  `{action: "unanswerable_from_holdings", rationale: <need>, pool_hash, batch, recorded_at}`.
- `pool_hash` covers the held pool of the question's item AND its connected items (at most 8, typed edges first), so
  new holdings on a connected item re-list a question too.
- Method key stays `infer-from-question@v1`: the key only selects the recompute function, whose semantics are unchanged.
- The derivation edges for an answer are empty: `derivation_edges_from_table_allowed` (migration 339) does not admit
  `intelligence_items` or `section_claim_provenance`; the cited ids travel in `cited_item_ids`.
- CONFIRMED only when every sentence of the answer is quoted from an evidence span; limits are in the README.
- "Sourced only from Community" is `intelligence_items.origin_class` of `community` or `community-corroborated`.

## Coordinator rulings of 2026-10-05, built in the same PR

- Holdings-need targets: `HOLDINGS_NEED_NAMESPACE` (`holdings-need:`) in `flag-namespaces.mjs`. The existing gap-target
  mechanism could not carry a free-text need (its target is an instrument identifier resolved against the corpus, its
  flag is one open row per item per namespace so a question flag would suppress the item's real lineage gap, its
  parser reads a fixed rationale sentence), so the target has its own namespace: one open flag per question
  subject_ref, the need, item id, surface, product question and pool_hash in the `find-source` action, closed by rule
  when the question is answered, refreshed in place when re-asked.
- Consumer: `scripts/research/research-walker.mjs` reads open targets (`readHoldingsNeeds`, at most 10 per run) and
  searches OpenAlex (free, keyless, free-text `search`) once per need; results enter the walker's existing register,
  rate and dry-run mint path. It cannot find a regulator form or schedule (research literature only). The other free
  runtimes (`run-source-sweep.mjs`, `register-walk.mjs`, `feed-walk.mjs`, `seek-more.mjs` `generateCandidates`) take
  feeds, registers or instrument identifiers, not a need in words. Missing input for non-research needs: a
  web-search runtime.
- `drain.ts` Pass 2b calls `reopenQuestionForRecompute` (`buildReopenDeps` in `infer-from-question.ts`, which carries
  the `SHARED-WRITER: integrity_flags` marker); `DrainResult.questionsReopened`; best effort, a failure is a recorded
  drain error and never undoes the recompute. The L4-A `processedEvents` return is untouched.
- Invalidation: no migration. The apply records the `pool_hash` on the question flag's close-out (an
  `answered_from_holdings` element); the export re-lists an answered question whose hash differs, marked
  `reanswer_after_new_holdings` with `prior_inference_id`; the apply of a re-answer writes the new inference with
  `supersedes` and re-closes the flag. Derivation edges to items are not admitted (migration 339).
- README states what CONFIRMED proves (every sentence quoted verbatim from a source span) and does not (that the
  quote answers the question; that judgement is the session lane's).

## NOT done, and open items

- No workflow chaining. Where it should chain: after the propagation drain raises or re-opens questions, and after
  population-turn raises them at mint (the generator is a population-turn flywheel step). [WORK: PLAN-2]
- No real answer authored; no batch under `batches/`. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
