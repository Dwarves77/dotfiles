// 368_drop_dead_schema.test.mjs -- static proof of migration 368 (lane DEAD-2, dead schema), by parsing the
// SQL file directly: no database, no SQL parser dependency. Same discipline as
// 349_external_data_only.test.mjs. It proves the migration drops exactly the DEAD class of the dead-code
// census (categories 5 and 6) and nothing else, that the one function it must redefine is the committed
// migration 335 definition minus exactly the three dropped columns, that the objects classified OWED,
// HISTORY, UNSURE or LIVE are never touched, and that the file carries its operator-review header.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const RAW = readFileSync(
  fileURLToPath(new URL("./368_drop_dead_schema.sql", import.meta.url)),
  "utf8",
);
const RAW_335 = readFileSync(
  fileURLToPath(new URL("./335_drop_placeholder_community_layer.sql", import.meta.url)),
  "utf8",
);

/** The executable SQL: every `--` line comment removed. */
const stripComments = (s) =>
  s
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
const SQL = stripComments(RAW);

// The DEAD class, by table (census categories 5 and 6; evidence per line in the migration header).
const DEAD_VIEWS = ["acquisition_backlog_v"];
const DEAD_COLUMNS = {
  intelligence_items: ["linked_forum_thread_ids", "linked_vendor_ids", "linked_regulation_ids"],
  sources: ["last_scanned", "last_content_fetched_at"],
};
const ALL_DEAD_COLUMNS = Object.values(DEAD_COLUMNS).flat();

// Everything classified something other than DEAD. None may appear in a DROP or ALTER statement.
const KEPT_OBJECTS = [
  // OWED
  "intelligence_summaries", "statutory_computations", "sensitive_field_policy", "aggregate_query_log",
  "census_rollup_by_surface", "propagation_queue_depth", "derived_values_admissible",
  "licence_clear_sources", "emission_factor_candidates",
  // HISTORY
  "bulk_imports", "intelligence_item_versions", "system_state_flag_audit", "disposition_ledger",
  "coverage_gap_census_findings", "corpus_census",
  // UNSURE
  "estimated_values", "community_topics", "community_topic_groups",
  // LIVE (refuted as dead)
  "mutation_leases", "data_sources", "sector_contexts",
];
const KEPT_COLUMNS = [
  // OWED (the three api_* columns by operator ruling 2026-10-08: reserved for the post-build API source path)
  "resolved_into_id", "observed_correctness_count", "classification_confidence", "classification_rationale",
  "api_endpoint_url", "api_auth_method", "api_response_format",
  // HISTORY (region_tags 15 rows and last_intelligence_item_at 659 rows kept by the same ruling)
  "assigned_at", "txid", "hidden_reason", "provenance_verified_at", "classification_assigned_at", "derived_at",
  "region_tags", "last_intelligence_item_at",
  // UNSURE
  "verified_by",
  // LIVE
  "search_tsv", "spotchecked",
];

const HEADER = RAW.slice(0, RAW.search(/^BEGIN;/m));

test("header: subject line, applied status as the map says, DATA-DELETING marker, census citation", () => {
  assert.match(RAW, /^-- subject: Migration 368 /);
  assert.deepEqual(headerProblems(RAW, "368_drop_dead_schema.sql"), []);
  assert.match(RAW, /DATA-DELETING: operator review required/);
  assert.match(RAW, /dead-code-census-2026-10-08/);
});

test("header: a '-- rows at review time:' block precedes BEGIN and names every touched object", () => {
  const first = RAW.search(/^BEGIN;/m);
  const marker = RAW.indexOf("-- rows at review time:");
  assert.ok(marker >= 0 && first >= 0 && marker < first, "rows block must precede BEGIN");
  const block = RAW.slice(marker, first);
  for (const name of [...DEAD_VIEWS, ...Object.keys(DEAD_COLUMNS), ...ALL_DEAD_COLUMNS]) {
    assert.ok(block.includes(name), `rows block must name ${name}`);
  }
});

test("header: every dropped object has its own evidence line citing a census category", () => {
  for (const name of [...DEAD_VIEWS, ...ALL_DEAD_COLUMNS]) {
    const line = HEADER.split("\n").find((l) => new RegExp(`^--   EVIDENCE (\\w+\\.)?${name}:`).test(l));
    assert.ok(line, `header needs an '--   EVIDENCE ${name}:' line`);
    assert.match(line, /census (category|cat\.) ?[56]/i, `${name} evidence must cite census category 5 or 6`);
  }
});

test("runs in one transaction", () => {
  assert.equal((SQL.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.ok(SQL.indexOf("BEGIN;") < SQL.indexOf("COMMIT;"));
});

test("drops exactly the DEAD view, with plain DROP (no CASCADE anywhere)", () => {
  const views = [...SQL.matchAll(/^DROP VIEW IF EXISTS public\.(\w+);/gm)].map((m) => m[1]);
  assert.deepEqual(views, DEAD_VIEWS);
  assert.equal((SQL.match(/^DROP VIEW/gm) ?? []).length, DEAD_VIEWS.length);
  assert.doesNotMatch(SQL, /CASCADE/i);
});

test("drops no table and no function other than the one it recreates", () => {
  assert.doesNotMatch(SQL, /DROP TABLE/i);
  const fns = [...SQL.matchAll(/^DROP FUNCTION IF EXISTS public\.(\w+)\(([^)]*)\);/gm)];
  assert.equal(fns.length, 1);
  assert.equal(fns[0][1], "_workspace_active_items");
  assert.equal(fns[0][2], "uuid");
  assert.doesNotMatch(SQL, /DROP (TRIGGER|POLICY|INDEX|CONSTRAINT|SCHEMA|TYPE)/i);
});

test("drops exactly the DEAD columns of exactly two tables, one ALTER statement per table", () => {
  const alters = [...SQL.matchAll(/^ALTER TABLE public\.(\w+)\s*\n((?:\s+DROP COLUMN IF EXISTS \w+,?\n?)+);/gm)];
  const got = {};
  for (const m of alters) {
    got[m[1]] = [...m[2].matchAll(/DROP COLUMN IF EXISTS (\w+)/g)].map((c) => c[1]);
  }
  assert.deepEqual(Object.keys(got).sort(), Object.keys(DEAD_COLUMNS).sort());
  for (const [t, cols] of Object.entries(DEAD_COLUMNS)) {
    assert.deepEqual([...got[t]].sort(), [...cols].sort(), `${t} dropped column set`);
  }
  assert.equal((SQL.match(/^ALTER TABLE/gm) ?? []).length, Object.keys(DEAD_COLUMNS).length);
  assert.doesNotMatch(SQL, /DROP COLUMN(?! IF EXISTS)/i);
});

test("no row is deleted or updated by this migration (schema only)", () => {
  assert.doesNotMatch(SQL, /^\s*(DELETE FROM|UPDATE |INSERT INTO|TRUNCATE)/im);
});

test("never drops or alters an object classified OWED, HISTORY, UNSURE or LIVE", () => {
  const dropStatements = [
    ...(SQL.match(/^DROP [^;]+;/gm) ?? []),
    ...(SQL.match(/^ALTER TABLE[^;]+;/gm) ?? []),
  ].join("\n");
  for (const k of [...KEPT_OBJECTS, ...KEPT_COLUMNS]) {
    assert.doesNotMatch(dropStatements, new RegExp(`\\b${k}\\b`), `${k} must not be dropped or altered`);
  }
});

test("the redefined _workspace_active_items is migration 335's definition minus exactly the three dropped columns", () => {
  const fnRe = /CREATE FUNCTION public\._workspace_active_items\(p_org_id uuid\)[\s\S]*?\$function\$;/;
  const mine = fnRe.exec(SQL);
  const theirs = fnRe.exec(stripComments(RAW_335));
  assert.ok(mine, "368 must recreate _workspace_active_items");
  assert.ok(theirs, "335 must define _workspace_active_items");

  let expected = theirs[0];
  expected = expected.replace(
    "linked_forum_thread_ids uuid[], linked_vendor_ids uuid[], linked_regulation_ids uuid[], ",
    "",
  );
  expected = expected.replace(
    "    ii.linked_forum_thread_ids, ii.linked_vendor_ids,\n    ii.linked_regulation_ids, ii.region_tags, ii.topic_tags, ii.vertical_tags,\n",
    "    ii.region_tags, ii.topic_tags, ii.vertical_tags,\n",
  );
  assert.equal(mine[0], expected, "368's function must equal 335's minus exactly the three columns");

  for (const c of DEAD_COLUMNS.intelligence_items) {
    assert.ok(theirs[0].includes(c), `335's function carried ${c}`);
    assert.ok(!mine[0].includes(c), `368's function must not carry ${c}`);
  }
  for (const keep of ["region_tags", "hidden_reason", "topic_tags", "vertical_tags", "item_grade", "requirement_trajectory", "effective_priority"]) {
    assert.ok(mine[0].includes(keep), `${keep} must survive in the function`);
  }
  for (const prop of ["SECURITY DEFINER", "STABLE", "SET search_path TO 'public', 'extensions', 'pg_temp'", "_assert_org_membership", "provenance_status = 'verified'"]) {
    assert.ok(mine[0].includes(prop), `${prop} must be preserved`);
  }
});

test("restores the live EXECUTE grants on the recreated function, after the CREATE", () => {
  const create = SQL.indexOf("CREATE FUNCTION public._workspace_active_items");
  const grant = SQL.indexOf("GRANT EXECUTE ON FUNCTION public._workspace_active_items(uuid) TO anon, authenticated, service_role;");
  assert.ok(create >= 0 && grant > create);
});

test("order: the view goes first; the function is redefined before the columns it returns are dropped", () => {
  const view = SQL.indexOf("DROP VIEW IF EXISTS public.acquisition_backlog_v;");
  const dropFn = SQL.indexOf("DROP FUNCTION IF EXISTS public._workspace_active_items(uuid);");
  const create = SQL.indexOf("CREATE FUNCTION public._workspace_active_items");
  const cols = SQL.indexOf("ALTER TABLE public.intelligence_items");
  assert.ok(view >= 0 && view < dropFn && dropFn < create && create < cols);
});

test("pre-check runs before any drop and aborts unless the three dropped array columns are empty on every row", () => {
  const pre = /DO \$\$([\s\S]*?)END \$\$;/.exec(SQL);
  assert.ok(pre, "pre-check DO block not found");
  assert.ok(SQL.indexOf(pre[0]) < SQL.indexOf("DROP VIEW"), "pre-check must run before any drop");
  for (const c of DEAD_COLUMNS.intelligence_items) {
    assert.ok(pre[1].includes(c), `pre-check must test ${c}`);
  }
  assert.match(pre[1], /cardinality\(/);
  assert.match(pre[1], /RAISE EXCEPTION 'ABORT:/);
});

test("post-check asserts the view and all five columns are gone and every kept neighbour survives", () => {
  const blocks = [...SQL.matchAll(/DO \$\$([\s\S]*?)END \$\$;/g)];
  const post = blocks[blocks.length - 1];
  assert.ok(post && blocks.length >= 2, "post-check DO block not found");
  assert.ok(SQL.indexOf(post[0]) > SQL.indexOf("ALTER TABLE public.sources"), "post-check must run after the drops");
  assert.ok(post[1].includes("acquisition_backlog_v"));
  for (const c of ALL_DEAD_COLUMNS) assert.ok(post[1].includes(`'${c}'`), `post-check must name ${c}`);
  for (const keep of ["coverage_gap_candidates", "spotchecked", "search_tsv", "hidden_reason", "census_rollup_by_surface", "region_tags", "last_intelligence_item_at", "api_endpoint_url", "api_auth_method", "api_response_format"]) {
    assert.ok(post[1].includes(keep), `post-check must assert ${keep} survives`);
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.ok(post[1].includes(`'${role}'`), `post-check must assert EXECUTE for ${role}`);
  }
  assert.match(post[1], /RAISE EXCEPTION 'ABORT:/);
});

test("the three sources.api_* columns are kept and commented with the operator-supplied reserved wording, verbatim", () => {
  const WORDING =
    "reserved for API-fed sources: when a source publishes an API for pulling its data, the endpoint, auth method and response format are registered here and the API is preferred over page walking (operator ruling 2026-10-08, post-build capability)";
  const comments = [...SQL.matchAll(/^COMMENT ON COLUMN public\.sources\.(\w+) IS\s*\n\s*'([^']*)';/gm)];
  assert.deepEqual(comments.map((m) => m[1]).sort(), ["api_auth_method", "api_endpoint_url", "api_response_format"]);
  for (const m of comments) assert.equal(m[2], WORDING, `${m[1]} comment wording`);
  assert.equal((SQL.match(/^COMMENT ON/gm) ?? []).length, 3, "no other COMMENT statement");
  assert.ok(SQL.indexOf("COMMENT ON COLUMN") > SQL.indexOf("ALTER TABLE public.sources"), "comments come after the drops");
});

test("rows-at-review-time block records the operator-supplied read counts", () => {
  const block = RAW.slice(RAW.indexOf("-- rows at review time:"), RAW.search(/^BEGIN;/m));
  assert.match(block, /last_scanned[^\n]*190/);
  assert.match(block, /2026-05-19/);
  assert.match(block, /last_content_fetched_at[^\n]*non-null: 8/);
  assert.equal((block.match(/non-empty: 0 /g) ?? []).length, 3);
  assert.doesNotMatch(block, /<FILL>/, "all counts supplied, no placeholder left");
});

test("rule 022: no dash glyphs or section sign in the migration", () => {
  const banned = new RegExp("[" + String.fromCharCode(0x2013, 0x2014, 0x00a7) + "]");
  assert.doesNotMatch(RAW, banned);
});
