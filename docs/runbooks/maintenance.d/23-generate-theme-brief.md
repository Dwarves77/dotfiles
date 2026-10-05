## 23. `generate-theme-brief`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1; F25 allowlist entry removed).
Written from `scripts/connections/generate-theme-brief.mjs`'s own header. **CORRECTS a stale claim in
`docs/inventories/shared-dataset-ownership.md`**: that document previously listed `theme_briefs` as
having two writers (this script and `src/lib/research/theme-brief.mjs`) with an open "supersession
TO-VERIFY" - reading `theme-brief.mjs` end to end (this lane, 2026-09-05) shows it is READ-ONLY (its own
header: "This module never writes, never clusters, never calls an LLM") and carries zero write calls; the
document is corrected accordingly. `theme_briefs` (migration 266) had exactly one real writer all along -
this script - and it was simply never given a dispatch root.

**Purpose**: assembles a theme's brief input bundle (`--theme <id>`: member items, intra-theme edges,
forward events, `member_hash`) for a human or in-session agent to author brief prose from ($0, no LLM
call inside this script), then validates and persists an authored payload (`--write <file>`) into
`theme_briefs` via the guarded path - check-then-branch insert/update (no `guardedUpsert` exists;
`theme_id` is PRIMARY KEY). Refuses a `--write` whose `member_hash` no longer matches the theme's LIVE
membership (staleness detected at write time, never silently accepted).

**What it does NOT do**: never calls an LLM, never invents brief prose - the prose is supplied by the
`--write` payload's author.

**Upstream**: `src/lib/connections/brief-staleness.mjs` (`computeMemberHash` - the ONE hash-recipe home,
imported here, never re-implemented).

**Ruling**: none by token - U6 (flywheel build plan 2026-08-10) is the standing design; this is its only
writer.

**Dispatch**: `arg` IS REQUIRED (both modes, `|| true`-equivalent graceful skip on blank) and takes one of
two forms: `theme:<connection_themes-id>` (assemble + print that theme's bundle - read-only in both
modes) or `write:<path-to-authored-payload>` (validate against live membership; `mode=apply` adds
`--execute` to persist via `guardedInsert`/`guardedUpdate`, `mode=dry` only validates + reports).

**Artifact / read back**: this step's own console output (no `cli.mjs`/`summary.json`). Confirm against
`SELECT theme_id, title, member_hash, generated_by, generated_at FROM theme_briefs ORDER BY generated_at
DESC`. **Live evidence already exists**: 9 rows, all `generated_by='session-executor'` (this script's own
`validateAgainstLiveMembers` value), dated 2026-08-21 - a prior session already ran `--write ...
--execute` through the guarded path before this dispatch route existed; this step gives that proven write
path a CI home, it does not newly prove it works.

---

### Batch flow (lane S3-C, 2026-10-04)

**The step above stays as the single-theme dispatch.** Lane S3-C added the batch pattern beside it, the same
shape as record briefs (export, committed batch with a validator, apply, harness family). Free only: briefs
are authored in a session by sub-agents from the exported bundle, never by a metered API call. Contract:
`scripts/turns/theme-briefs/README.md`; workflow: `.github/workflows/theme-briefs.yml`
(`workflow_dispatch` only, inputs `action` export or apply, `mode` dry or apply, `briefs_file`).

1. **Export** (`action=export`, read only): `scripts/turns/export-themes-for-briefs.mjs` lists every theme
   with no brief, a stale brief, or only an orphaned brief under a drifted theme id (`superseded`, with
   `supersedes_theme_id`), and uploads one bundle file as the workflow artifact. Per member it carries the
   summary, grounded claims and forward events; per theme the gaps `gaps.mjs` computes and the intra-theme
   edges with their full basis. A per-theme character budget reports what it omitted.
2. **Author** a batch from the bundle and commit it as
   `scripts/turns/theme-briefs/batches/theme-briefs-NNN.json` (five sections, a claim list, a title, the
   echoed `member_hash`).
3. **Apply** (`action=apply`): `scripts/turns/apply-theme-briefs.mjs` validates every entry against live
   membership and live claims (whole-entry refusals, listed in the run artifact), and with `mode=apply`
   writes `theme_briefs` through the guarded path and reads each row back. `generated_by` is the batch name.
   Migration 351 adds the nullable `sections`, `claims` and `member_ids` columns; until it is applied the
   writer stores `brief_md` only.

`--theme` and `--write` on `generate-theme-brief.mjs` now run on the same reads, validator and writer (a
payload carrying `sections` gets the full validator; a legacy `brief_md` payload keeps the member hash check
and `generated_by='session-executor'`). `apply-theme-briefs.mjs` is the one writer of `theme_briefs`.

**Brief continuity.** A theme id is its smallest member id; `resolveBriefForTheme`
(`src/lib/connections/brief-staleness.mjs`) finds the brief under the theme's own id, else the best
overlapping prior brief (stored `member_ids`, `theme-delta.mjs`'s overlap threshold), else a prior id named
by the latest run's `theme_delta` lineage, and serves anything not under its own id as STALE.

**Artifact / read back**: harness family `theme-briefs` (`scripts/harness-runs/theme-briefs/`), one artifact
per run, `config.action` export or apply, landed into `harness_runs` by the workflow's last step.

---
