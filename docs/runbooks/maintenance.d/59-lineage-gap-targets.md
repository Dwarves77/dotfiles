## 59. `lineage-gap-targets`

**New this runbook, lane s2a-typed-edges, 2026-10-04.**

**Purpose**: consume the `lineage-gap:absent-parent` integrity_flags namespace. The linker
(`planLinkWrites`, `src/lib/entities/entity-resolve.mjs`) opens one such flag per item whenever its text
says it implements, amends or depends on an instrument that resolves to no held item. Nothing read those
flags, so each stayed open whether or not its parent was later acquired. This step turns the open flags into
a discovery target list and resolves the ones whose parents are now held. No flag waits on a person.

**Logic** (pure planner `planLineageGapTargets` in `src/lib/entities/lineage-backfill.mjs`; the held check
uses the linker's own resolver):
1. read every open `lineage-gap:absent-parent` flag and the non-archived corpus;
2. parent still absent: a target `{identifier, relationship, citing_item_id, flag_id}`;
3. every named parent now held: the flag is resolvable (apply resolves it, `resolution_note` names the held
   parent item ids; `relink_item_ids` lists the citing items so the linker's next pass writes the typed edge);
4. a flag with no subject or no parseable parent is residue with its reason, never dropped.

**Dispatch**: no `--arg`, no ruling gate, no schedule. `mode=dry` (default) reads and plans, writes nothing
to the database; `mode=apply` resolves flags through `scripts/lib/db.mjs` (`guardedUpdateByIds`). A
`workflow_run`-chained firing is not applicable (this step is dispatch only). The target list is an artifact,
not a database write, so it is produced in both modes.

**Artifact / read back**: `lineage-gap-targets/lineage-gap-targets.json` (`targets`, `resolvable`,
`relink_item_ids`, `residue`) and `summary.json` `counts` (`open_flags`, `targets`,
`distinct_missing_identifiers`, `would_resolve`, `residue`; in apply `write`, plus `read_back.remaining_open`).
Exit code 1 when fewer flags updated than planned.

**Idempotency**: a resolved flag drops out of the next run's read; a second run changes nothing.

---
