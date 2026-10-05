# theme-briefs files: a session lane's theme-brief batch

Same family shape as `scripts/turns/record-briefs/` and `scripts/turns/ledger-verdicts/`: a committed batch
file a session lane authors offline, a pure validator (`schema.mjs`) that checks it end to end before
anything is written, an apply step, and a harness family. A theme is a cluster of connected items across
pages. Its brief is where the system says what the connection means over the long term and what follows from
it for a reader of each page. Free only: briefs are authored in a session by sub-agents from the exported
bundle, never by a metered API call.

## The flow

1. **Export** (read only): `node scripts/turns/export-themes-for-briefs.mjs --out-dir <dir>`, or dispatch
   `.github/workflows/theme-briefs.yml` with `action=export`. It lists every theme that has no brief, a
   stale brief (member hash drifted) or a brief that only a drifted theme id orphaned (`needs: "superseded"`,
   with `supersedes_theme_id`), and writes ONE bundle file per run. A theme whose own brief is current is
   skipped.
2. **Author** a batch from the bundle (below) and commit it as
   `scripts/turns/theme-briefs/batches/theme-briefs-NNN.json`, zero padded, incrementing. Committed because
   a `workflow_dispatch` checks out `origin`; a file under a gitignored path never reaches it.
3. **Apply**: `node scripts/turns/apply-theme-briefs.mjs --briefs <file> [--execute]`, or the workflow with
   `action=apply`, `mode=dry|apply`, `briefs_file=scripts/turns/theme-briefs/batches/theme-briefs-NNN.json`
   (fsi-app relative). Dry by default. `--fixture <corpus.json>` runs either CLI over an in-memory corpus
   (`fixtures/corpus.fixture.json`) with no database.

`generate-theme-brief.mjs --theme <id>` prints the same bundle for one theme and `--write <file>` routes a
single payload through the same validator and writer (a payload carrying `sections` gets the full validator;
a legacy `brief_md` payload still works with the member hash check).

## The bundle (what the author reads)

Per theme: `theme_id`, `member_hash`, `needs`, `supersedes_theme_id`, `prior_brief` (title and date only),
`surfaces`, `convergence`, `pivots`, `dominant_signals`, `gaps` (what `gaps.mjs` computes for the theme), and
`members`, each with `id`, `title`, `item_type`, `surface`, `jurisdictions`, `priority`, `summary`, `claims`
(grounded FACT claims: `claim_id`, `kind`, `claim_text`, `source_id`) and `forward_events` (`event_id`,
`event_date`, `date_precision`, `event_kind`, `obligation_text`, `source_span`, `confidence`); plus
`intra_theme_edges` with their full `basis`. A character budget applies per theme (`--char-budget`, default
60000). What it omits is counted in the theme's `truncation` block (members, claims, forward events, edges
omitted, and the omitted members by title); a member the budget omitted cannot be cited.

## The batch

```json
{
  "batch": "theme-briefs-001",
  "generated_at": "2026-10-04T00:00:00Z",
  "authored_by": "session-lane",
  "entries": [
    {
      "theme_id": "<theme id from the bundle>",
      "member_hash": "<ECHO the bundle's member_hash; never compute or invent one>",
      "title": "<a title, 160 characters at most>",
      "sections": {
        "connection": "<markdown>",
        "meaning": "<markdown>",
        "ramifications": "### Regulations\n<markdown>\n\n### Market Intel\n<markdown>",
        "watch": "<markdown>",
        "gaps": "<markdown, or an empty string when the bundle lists no gaps>"
      },
      "claims": [
        { "section": "watch", "text": "<exact text as it appears in that section>", "member_id": "<member id>", "claim_ids": ["<claim id or forward event id>"] }
      ]
    }
  ]
}
```

`theme-briefs-000.fixture.json` under `fixtures/` is a worked example over the fixture corpus; it proves the
loader and is not a real brief.

### Sections, in this order

- `connection`: what links these items, naming the shared instruments, entities, scenarios or objects from
  the bundle's edge basis. Not "both address sustainability".
- `meaning`: what the connection means over the long term.
- `ramifications`: one `### <Surface>` subsection per surface present in the theme (`Regulations`,
  `Market Intel`, `Research`, `Operations`), saying what follows for a reader of that page. A surface not in
  the theme has no subsection.
- `watch`: the dated forward events from members that will move this theme, each with its date and the
  member it comes from, and what would change the reading.
- `gaps`: what the theme lacks, from the bundle's gap list; an empty string when none.

`brief_md` is the title and the sections rendered in that order under fixed headings (`# <title>`,
`## Connection`, `## What it means`, `## Ramifications`, `## Watch`, `## Gaps`; an empty gaps section is
omitted).

### Claims and labels

Every factual statement in the sections is listed in `claims[]` with `{section, text, member_id, claim_ids}`.
`claim_ids` are grounded (FACT) claim ids of that member from the bundle; in the `watch` section a forward
event id of that member is also accepted, because a forward event is itself a verbatim, grounded extraction.
Anything that is not a cited fact is written as analysis, in a paragraph or list item that opens with a label
the skills prescribe: `*Analytical inference:*`, `*Operational implication:*` or `*Legal Confirmation
Required:*`. Cite members by title, never by id.

## `validateThemeBriefsFile(json, ctx)` and its refusals

A structural problem (not an object, a `batch` not named `theme-briefs-...`, `authored_by` not
`"session-lane"`, `entries` not an array) fails the whole file closed. Every other refusal is per entry:
the entry is refused whole and never partially applied, its reasons are returned and recorded as residue, and
it never blocks the valid entries beside it (no human gate). The refusals:

1. unknown theme (no live `connection_themes` row);
2. `member_hash` not matching the live membership;
3. a missing or empty required section (`connection`, `meaning`, `ramifications`, `watch`), a missing `gaps`
   key, an unknown section key, and `gaps` empty while the bundle lists gaps for the theme;
4. a ramifications subsection for a surface the theme does not span, a spanned surface with none, an empty
   or unknown subsection, text before the first subsection, a duplicate heading;
5. a claim whose `member_id` is not a live member, or whose `claim_ids` are not grounded claims of that
   member (an ANALYSIS claim is not grounded);
6. a claim text that does not appear in its section;
7. a figure outside any listed claim or labelled analysis paragraph (the check below);
8. an id (a uuid) anywhere in a section or the title: members are cited by title;
9. a length ceiling: title 160 characters; sections `connection` 2000, `meaning` 2500, `ramifications` 5000,
   `watch` 3000, `gaps` 1500;
10. a duplicate `theme_id` in one batch.

No dash glyph rule lives here: that is discipline rule 022's job, not the validator's.

### The uncited-figure check, and its limits

The narrowest honest version. In each section, a "figure" is a number (which includes every year and date) or
an acronym of three or more capitals (the lexical stand-in for a named instrument or body). A figure is
accepted when it sits inside a listed claim's text, inside a labelled analysis paragraph or list item, inside
a heading line, inside a member title (a title citation), inside a verbatim bundle gap description, or when
the token is one the bundle's own intra-theme edge basis names (the shared scenarios and objects the author
is told to name). Anything else is refused. Limits, stated plainly:

- a fact written without digits and without an acronym (a spelled-out instrument, "the second phase") is NOT
  detected;
- a two-letter acronym is not detected, and a figure appearing in the edge basis anywhere in the theme is
  accepted anywhere in the sections;
- coverage is by text position: it proves a figure sits inside a listed claim's text, not that the claim is
  true. Truth is held by the `claim_ids` check (the cited claims are real grounded claims of that member),
  not by reading the prose;
- a labelled analysis paragraph is exempt by design: the label is the author's declaration that it is analysis.

## Apply

Writes `theme_briefs` through the guarded path (`guardedInsert` for a new theme, `guardedUpdate` for an
existing one, which snapshots the prior row), then reads each row back and fails the run when the stored
`member_hash` or `generated_by` is not what was written. `generated_by` records the batch name. When
migration 351 is applied the row also stores `sections`, `claims` and `member_ids` (the membership the brief
was written for); the writer probes once and writes the base columns only when they are absent.

## Brief continuity

A theme id is its smallest member id, so membership drift can move the id and orphan a brief.
`resolveBriefForTheme` (`src/lib/connections/brief-staleness.mjs`, used by the Research reader and the
export) finds the brief stored under the theme's own id, else the best overlapping prior brief (stored
`member_ids` overlapping the live members at or above `theme-delta.mjs`'s threshold), else, for a brief
written before migration 351, a prior id named by the latest run's `theme_delta` lineage. A brief found any
way but its own id is served as stale, never as current, with `supersedes_theme_id` set.
