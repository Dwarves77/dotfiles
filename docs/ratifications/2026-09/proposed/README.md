# Proposed rulings, 2026-09-05 — NOT yet ruled

**Every decision in this folder is a Haiku-generated PROPOSAL. None of them has been ruled by
the operator. `decision` is `null` in every `*.ruling.json` group until the operator sets it.**
This folder exists so the operator can review and rule on paper (or in a spreadsheet/table)
without needing a live session, and so the next coordinator session does not have to
regenerate the digests from scratch to know what is waiting.

This folder is a child of `docs/ratifications/2026-09/README.md`, which is the canonical
explanation of the review-queue mechanism itself (what a queue is, what `recommended_decision`
means, how a digest is built, how an apply script works, the `--apply` + `--ruling` contract).
**Read that file first.** This README only explains what is specific to the `proposed/`
subfolder: that the decisions here are Haiku's, not the operator's, and how a Haiku proposal
differs from the queue's own deterministic recommendation.

## What is in this folder

Four ratification queues, one `<queue>.ruling.json` file each, generated 2026-09-05T03:00Z by
lane `haiku-rulings.js` (two Haiku agents; see
`docs/dispatches/lane-briefs/2026-09-05/README.md`):

| File | Queue | Groups | Total rows |
|---|---|---:|---:|
| `portal-links.ruling.json` | portal-links | 301 | 57,469 |
| `provisional-sources.ruling.json` | provisional-sources | 6 | 911 |
| `canonical-candidates.ruling.json` | canonical-candidates | 23 | (see file; per-group `count`) |
| `coverage-gaps.ruling.json` | coverage-gaps | 37 | (see file; per-group `count`) |

Each group in a `.ruling.json` file carries, alongside the row ids:

- `recommended_decision` — the queue's own deterministic rule (from the digest builder,
  `fsi-app/scripts/review/build-review-digests.mjs`), computed from measurable signals only
  (link pattern, officialness tier, reach state, evidence completeness). Never a guess.
- `proposed_decision` / `proposed_rationale` — Haiku's own read of the same evidence, drafted
  by this folder's lane so the operator has a starting position to accept, edit, or overrule.
- `decision` / `rationale` — **`null` in every group in every file.** This is the field the
  operator (or an `apply-*.mjs --apply` run acting on the operator's ruling) fills in. A row
  with `decision: null` has not been ruled and must never be treated as approved.

`RULINGS-1-summary.md` (portal-links) and `RULINGS-2-summary.md` (provisional-sources,
canonical-candidates, coverage-gaps combined — see its own `## Queue:` headers) are
human-readable tables over the same data: one row per group, with a `Recommended` column
(the deterministic rule), a `Proposed` column (Haiku's decision), and a `⚠️ DISAGREE` marker
wherever the two differ. **114 of portal-links' 301 groups and 32 of the other three queues'
groups carry the marker** — that is where the operator's attention is most needed, since
agreement between Haiku and the deterministic rule is the uninteresting case.

## How these get applied — nothing here is live yet

Applying a ruling is a two-step, human-in-the-loop process; nothing in this folder writes to
the database by itself:

1. **The operator rules.** For each group (or each `⚠️ DISAGREE` row first, then the rest),
   the operator sets `decision` to one of the queue's real dispositions (queue-specific — see
   the parent README's per-queue section: e.g. portal-links is `link` / `drop`,
   provisional-sources is `confirm` / `retire` / `keep` / `uncertain`, etc.) and optionally a
   `rationale`. This can be done by editing the `.ruling.json` file directly, or by any other
   record of the operator's decision that a coordinator later transcribes into the file — the
   file format is what the apply script reads, not the only way the operator may communicate
   a ruling.
2. **The coordinator applies.** Each queue has its own apply script under
   `fsi-app/scripts/review/`:

   - `apply-portal-links.mjs`
   - `apply-provisional-sources.mjs`
   - `apply-canonical-candidates.mjs`
   - `apply-coverage-gaps.mjs`

   Each is dry-by-default and requires **both** `--ruling <path to the ruled file>` **and**
   `--apply` to write anything; without `--apply` it only reports what it would do. Every
   write goes through the guarded path (`db.mjs`'s `guardedUpdateByIds`, per-row, with a
   read-back to confirm), never a blanket UPDATE. Per the parent README, these four scripts
   are also wired into `.github/workflows/maintenance.yml` as steps named
   `review-apply-portal-links`, `review-apply-provisional-sources`,
   `review-apply-canonical-candidates`, and `review-apply-coverage-gaps` — so the coordinator
   can run one via a `workflow_dispatch` of "Maintenance" with that step selected, once a
   ruled file exists, rather than needing local write credentials.

A group whose `decision` is still `null` when an apply script runs is skipped, not defaulted
to anything — silence is never treated as a ruling.

## Where this sits in the loop

This is the review-queue half of the corpus discipline, not the mint/enrich/propagate loop
itself (see `docs/ops/handoff-2026-09-05.md` §2 for that loop). Ratification queues exist so
that decisions with no fully deterministic answer (should this portal link be followed or
dropped; should this provisional source be confirmed) still get made once, cheaply, and
reversibly, instead of either blocking the pipeline on a human for every row or letting an
unreviewed guess become permanent. Haiku's proposals in this folder exist only to save the
operator's reading time; they carry no authority until the operator (or someone acting on an
explicit operator instruction) sets `decision`.
