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

