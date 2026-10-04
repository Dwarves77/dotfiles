## 46a. `enumerate-unclassified-hosts`

**Purpose**: defect D14 item 2 (docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12). Lists every host
of the pending `provisional_sources` rows and the `sources` rows with `status='provisional'` that rule
(a) (`existingTierForHost`, an existing active institution) and rule (b) (`classTierForHost`, the SC-13
class table -- including D14's own government-label / legal-publisher extension) still do not resolve
-- the residue D14 item 1 could not close deterministically. Per host: the row's own stored `name`,
`discovered_via`, the citing item's title where the search log names one, and the row count. The
coordinator rules host classes from this list (a doctrine act, per SC-13 -- never delegated to a model,
never auto-registered); a host not ruled with certainty stays worklisted. This step's own run
(34728958591, 628 hosts) fed the D14 residue ruling above (2026-09-13): a re-run of this step now threads
each row's `name` into rule (b) too, so the genuine residue narrows to hosts with NO stored name at all
(the `company` class resolves every other named host) plus the pre-existing permanently-unregistered
class (an aggregator or hosting platform, unrelated to whether a name exists -- see `host-authority-d14-
residue-ruling.npmtest.mjs`'s table-driven sweep for the exact split).

**READ-ONLY.** This step has NO apply branch and writes NOTHING to the database, ever, regardless of
the `mode` input -- `scripts/maintenance/enumerate-unclassified-hosts.mjs`'s own `main()` accepts `mode`
only for parity with the shared `runCli` contract every MAINT step uses and always reports
`summary.mode: "dry"`. It is wired into `.github/workflows/maintenance.yml`'s step choice list as
`enumerate-unclassified-hosts`; the live run needs DB credentials the executor lane that built this step
does not have, so the coordinator runs it (dry input or apply input, either way it behaves identically).

**Upstream**: reuses, never a second copy: `existingTierForHost`
(`scripts/maintenance/canonical-autoverify.mjs`, rule a) and `classTierForHost`
(`src/lib/sources/host-authority.ts`, rule b) -- the SAME two functions
`resolve-provisional-sources.mjs` consumes, so this step's residue is defined as exactly what that
step's own rule a/b would leave unresolved. `hostOf` (`scripts/lib/db.mjs`) is the same host-extraction
helper every script in this family uses. The citing-item-title join reads `agent_run_searches`
(`result_url`, `intelligence_item_id`) -- the only live table recording which item's agent run surfaced
a given URL, since neither `provisional_sources` nor `sources` carries an item reference of its own --
joined to `intelligence_items.title`.

**Output -- artifact only, never the repo** (standing rule 5): `unclassified-hosts.json` (full per-host
detail: host, row_count, tables, names, discovered_via, citing_item_titles) and `unclassified-hosts.md`
(the same data as a Markdown table) written directly to this run's own `$OUT_ROOT/enumerate-unclassified-
hosts/`, alongside the standard `summary.json` (counts only) every MAINT step's `runCli` writes.

**Dispatch**: no `--arg`; not ruling-gated. `node scripts/maintenance/enumerate-unclassified-hosts.mjs
--mode dry --out <dir>` (mode is accepted, ignored). Read the two artifact files off the run's uploaded
artifact (`maintenance-enumerate-unclassified-hosts-<run-id>`, `actions/upload-artifact`), never off a
repo path -- nothing this step writes is committed.

**Artifact / read back**: `summary.json`'s `counts.{pending_provisional_sources,sources_provisional,
unresolved_rows,unresolved_hosts}` -- confirm against `SELECT count(*) FROM provisional_sources WHERE
status IN ('pending_review','needs_more_data')` and `SELECT count(*) FROM sources WHERE
status='provisional'` for the two upstream totals; `unresolved_hosts` is the length of the
`unclassified-hosts.json` array this step also writes.

---

