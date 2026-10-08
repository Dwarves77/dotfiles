## 65. `needs-search`

**New this runbook, lane G5-SEARCH, 2026-10-07 (buildout plan Stage 5, last clause).** Not a `maintenance.yml` step:
it has its own dispatch workflow, `.github/workflows/needs-search.yml` (`workflow_dispatch`, plus a push trigger on
the batch path that the chained dry guard holds dry while build mode is live; no schedule, not chained), because the
export writes a bundle file and the apply reads a committed batch, the same shape as `question-answers.yml`.

**Purpose**: the system raises source needs by rule and used to wait for a person to find the URL. A need is an open
`term-need:*`, `holdings-need:*`, `flywheel-gap:*` or `lineage-gap:absent-parent` flag. The export lists them; a
session lane finds the authoritative URL for each and commits a batch; the apply registers the source at its
class-table tier, creates the row the need kind calls for, and resolves the need flag. No model call, no search
call in code, no operator review step.

**Logic**:
1. `action=export` runs `scripts/turns/export-needs-for-search.mjs` (read only). Per open need: its kind, the need in
   words, context, age, what the found URL feeds, and what satisfies it. Skipped: a flag with no usable need, a
   lineage flag whose parents are all held, a need an earlier apply already served.
2. A session lane (or the judgement drain, kind `needs-search`) authors
   `scripts/turns/needs-search/batches/needs-search-NNN.json` (contract: `scripts/turns/needs-search/README.md`) and
   commits it.
3. `action=apply` runs `scripts/turns/apply-need-urls.mjs --batch <file>`. Every entry is validated whole (open
   need, http(s) url without credentials, host rated by the class table by host alone or placed by a
   `host_verdict` in the host-verdicts entry format, no tier field); a refused entry is residue with its reasons and
   never blocks the others. With `mode=apply` (`--execute`): `registerSource` at the class-table tier, then a
   `census_worklist` row (term-need, holdings-need, flywheel-gap) through `ensureCensusRow` or a
   `portal_link_candidates` row (lineage-gap), then the need flag resolved with a marker note.

**Dispatch**: `gh workflow run needs-search.yml -f action=export`, or
`-f action=apply -f mode=dry -f batch_file=scripts/turns/needs-search/batches/needs-search-001.json` (fsi-app
relative). `mode=dry` is the default and writes nothing. No data population before every build layer is complete
(operator ruling 2026-10-04): the first real dispatch is the coordinator's. The committed `needs-search-001.json` is
a fixture proof input; against the live database it is refused whole as unknown needs.

**Artifact / read back**: family `needs-search` (`scripts/harness-runs/needs-search/`), landed into `harness_runs` by
the workflow's last step. Export metrics: open needs by kind, listed, skipped by reason. Apply metrics: valid,
refused, already applied, sources registered or reused, census rows and portal candidates created, flags resolved.
Read back an apply with
`SELECT status, resolved_by, resolution_note FROM integrity_flags WHERE resolved_by = 'apply-need-urls'`, the rows
with `SELECT id, source_id, document_url, created_by FROM census_worklist WHERE created_by LIKE 'flywheel-ratified:%'`
and `SELECT url, source_id, status FROM portal_link_candidates ORDER BY first_seen_at DESC`.

**Idempotency**: a second apply of the same entry writes nothing (reported as already applied); a crash after the
source or the row but before the flag is resolved only finishes the remaining steps on the next run.

---
