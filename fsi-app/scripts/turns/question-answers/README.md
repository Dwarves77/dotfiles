# question-answers files: a session lane's answers to open questions

Same family shape as `scripts/turns/theme-briefs/` and `scripts/turns/record-briefs/`: a committed batch file a
session lane authors offline, a pure validator (`schema.mjs`) that checks it end to end before anything is
written, an apply step, and a harness family. Free only: answers are authored in a session by sub-agents from
the exported bundle, never by a metered API call (ADR-044).

A question is an open integrity flag under the `question:` namespace, written by the trigger generator (one per
item, surface and product question). An answer is written as an inference record: never a fact, always carrying
its status token, its cited items and its confidence, shown to customers labelled as an inference.

## The flow

1. **Export** (read only): `node scripts/turns/export-questions-for-answers.mjs --out-dir <dir>`, or dispatch
   `.github/workflows/question-answers.yml` with `action=export`. It lists every open question whose own item
   is citable, and writes ONE bundle file per run.
2. **Author** a batch from the bundle (below) and commit it as
   `scripts/turns/question-answers/batches/question-answers-NNN.json`, zero padded, incrementing.
3. **Apply**: `node scripts/turns/apply-question-answers.mjs --answers <file> [--execute]`, or the workflow with
   `action=apply`, `mode=dry|apply`, `answers_file=scripts/turns/question-answers/batches/question-answers-NNN.json`
   (fsi-app relative). Dry by default. `--fixture <corpus.json>` runs either CLI over an in-memory corpus
   (`fixtures/corpus.fixture.json`) with no database.

## The bundle (what the author reads)

Per question: `subject_ref`, `pool_hash`, `item_id`, `surface`, `product_question`, `question`,
`event_context`, `needs` (`unanswered`, or `reasked_after_new_holdings` with `prior_outcome`) and `items`: the
question's own item (`relation: "self"`) then the items connected to it by a cross-reference edge
(`relation: "connected"`), each with `title`, `item_type`, `surface`, `jurisdictions`, `summary`, its `edge`
(relationship, origin, score, basis signals), grounded FACT `claims` (`claim_id`, `kind`, `claim_text`,
`source_id`), `forward_events`, and the held `pool` (`url`, `text`, `chars_total`, `chars_included`).

**Reach.** At most 8 connected items per question, typed relationships first, then higher score. An item that
is archived, not verified or sourced only from Community (ADR-041) is never exported and never citable.

**Budget.** `--char-budget` (default 60000) per question: structure takes up to 40 percent, the rest is shared
pool text, half for the own item and half across the connected items. What it omits is counted in the
question's `truncation` block (items, claims, forward events, pool characters); text cut by the budget cannot be
quoted from the bundle.

**`pool_hash`** is the sha256 identity of the held pool of the question's item and its connected items
(`heldPoolHash`, `src/lib/sources/seek-more.mjs`). Echo it; never compute it.

## The batch

```json
{
  "batch": "question-answers-001",
  "generated_at": "2026-10-05T00:00:00Z",
  "authored_by": "session-lane",
  "entries": [
    {
      "subject_ref": "<from the bundle>",
      "pool_hash": "<ECHO the bundle's pool_hash>",
      "outcome": "answered",
      "answer": "<the claim text>",
      "status_token": "HYPOTHESIS",
      "confidence": 0.6,
      "cited_item_ids": ["<item id>", "<item id>"],
      "evidence": [
        { "item_id": "<item id>", "claim_ids": ["<claim id>"], "source_span": "<verbatim text of that item's pool>" }
      ]
    },
    {
      "subject_ref": "<from the bundle>",
      "pool_hash": "<ECHO>",
      "outcome": "unanswerable_from_holdings",
      "missing": "<in plain words: what kind of source, about what, would answer it>"
    }
  ]
}
```

`fixtures/question-answers-000.fixture.json` is a worked example over the fixture corpus; it proves the loader
and is not a real answer.

- **answered**: `answer` is the claim text (1500 characters at most). `status_token` is `HYPOTHESIS` or
  `CONFIRMED` (below). `confidence` is a number from 0 to 1. Every `evidence.source_span` (20 to 600
  characters) is a verbatim substring (case-insensitive, `record-facts.mjs` `assertVerbatim`, the function the
  record-briefs validator uses) of the held pool text of THAT item. Every `claim_ids` entry is a grounded FACT
  claim of that item. `cited_item_ids` equals the set of evidence item ids. At most 8 evidence records.
- **unanswerable_from_holdings**: `missing` says in plain words what holding would answer the question (600
  characters at most). No `answer`, `status_token`, `confidence`, `cited_item_ids` or `evidence`.
- Cite items by title in prose, never by id.

### The CONFIRMED rule, and its limits

`CONFIRMED` is allowed only when EVERY sentence of the answer is a quotation: after whitespace collapse and
lower-casing, the sentence is a substring of at least one evidence `source_span`. The spans are already proven
verbatim in the held pool, so the answer is then the source's own words. Anything else is `HYPOTHESIS`. Limits,
stated plainly: a quotation proves the words are the source's, not that they answer the question or that the
source is right; a paraphrase is never `CONFIRMED` however faithful; a model never self-labels `CONFIRMED`
(CLAUDE.md rule 14), the validator does.

### The uncited-figure check, and its limits

Every number and every acronym of three or more capitals in the answer (`theme-briefs/schema.mjs`
`figureTokens`) must appear in an evidence span, the question text or a cited item's title. Limits: a fact
written without digits and without an acronym is not detected; coverage is by token, not by meaning.

## `validateQuestionAnswersFile(json, ctx)` and its refusals

A structural problem (not an object, a `batch` not named `question-answers-...`, `authored_by` not
`"session-lane"`, `entries` not an array) fails the whole file closed. Every other refusal is per entry: the
entry is refused whole and never partially applied, its reasons are recorded as residue, and it never blocks the
valid entries beside it (no human gate). The refusals:

1. an unknown subject_ref, or a question that is no longer open;
2. the question's own item archived, unverified or Community-only;
3. a `pool_hash` that does not match the live held pool;
4. an `outcome` that is neither answered nor unanswerable;
5. a span that is not verbatim in the cited item's pool text, a span under 20 or over 600 characters;
6. a claim id that is not a grounded FACT claim of the cited item;
7. a cited item that is archived, not verified, sourced only from Community, or not in the export's reach;
8. an answered entry with no evidence, `cited_item_ids` that differ from the evidence item ids or repeat one;
9. confidence outside 0 to 1, a status token other than `HYPOTHESIS` or `CONFIRMED`;
10. an unanswerable entry with an answer, evidence, a token, a confidence or cited ids, or with no `missing`;
11. an id (a uuid) in the answer or `missing`, an uncited figure, a length ceiling;
12. `CONFIRMED` without the quotation rule;
13. a duplicate subject_ref in one batch.

The validator checks spans against the live held pool of the cited item, which is a superset of the text the
bundle showed when the budget cut it: a verbatim span from cut text passes. That is a stated limit.

## Apply

Dry by default. With `--execute`: an answered entry writes ONE inference (`register_inference_record`, origin
`derived`, method `infer-from-question@v1`, `computed_by` = `question-answers:<batch>`,
`trigger_question_ref` = the subject_ref, cited item ids in `cited_item_ids`; no derivation edges, because
intelligence items and their claims are not in the edge table's allowlist, migration 339) and closes the
question flag through the guarded writer (`resolution_note` names the inference id, the batch, the token and
the pool hash). An unanswerable entry records `unanswerable_from_holdings` on the flag's `recommended_actions`
(with the `pool_hash`, the batch and the plain-words need); the flag stays open and the export skips it until
the held pool changes. Each write is read back. A second apply is a no-op. The run artifact reports inferences
written, questions closed, outcomes recorded and search targets raised. Source search targets for unanswerable
questions are NOT raised (the existing gap-target mechanism cannot carry a free-text need); see the apply
script's header and runbook step 60.
