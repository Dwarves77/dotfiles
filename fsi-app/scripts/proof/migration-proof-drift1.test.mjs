/** DRIFT-1 (2026-10-10): the migration-proof job applies the two schema reconciliation migrations (384, 385) a SECOND time and fails unless the stack's
 *  whole canonical catalog is byte for byte unchanged. This file pins that step (present, after the pending apply, preflighted, loopback target only,
 *  compares with cmp, never uploads the catalog) with a mutation attack for each way it could be weakened, and pins the --out catalog file the step uses. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogOnly } from "./schema-diff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXT = readFileSync(resolve(HERE, "..", "..", "..", ".github", "workflows", "migration-proof.yml"), "utf8").replace(/\r\n/g, "\n");

const steps = (text) => text.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));

/** Everything wrong with the double-apply step of a workflow text; [] when nothing is. */
export function verify(text) {
  const bad = [];
  const all = steps(text);
  const i = all.findIndex((s) => /second time/.test(s.name));
  if (i < 0) return ["the second-apply step is absent"];
  const s = all[i];
  const pending = all.findIndex((x) => /Apply every pending migration/.test(x.name));
  if (!(pending >= 0 && i > pending)) bad.push("it does not run after the pending apply");
  if (!/if: steps\.scope\.outputs\.touched == 'true'/.test(s.body)) bad.push("not gated on the touched decision");
  const src = s.body.indexOf('. "$MP_ENV"');
  const pre = s.body.indexOf("scripts/proof/preflight.mjs");
  const first = s.body.indexOf("schema-diff.mjs");
  if (!(src >= 0 && pre > src && first > pre)) bad.push("it does not source the env and preflight before it reads the database");
  if (!/set -o pipefail/.test(s.body)) bad.push("no pipefail");
  for (const f of ["384_schema_drift_reconcile_production_only.sql", "385_schema_drift_repair_replay_only_indexes.sql"]) {
    if (!s.body.includes(f)) bad.push(`${f} is not applied twice`);
  }
  if (!/psql "\$PROOF_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "\$f"/.test(s.body)) bad.push("the second apply is not a stop-on-error single-transaction psql run against PROOF_DB_URL");
  if ((s.body.match(/--catalog-only --db-url "\$PROOF_DB_URL" --out "\$RUNNER_TEMP\/catalog-(before|after)\.json"/g) ?? []).length !== 2) bad.push("the catalog is not read before and after");
  if (!/cmp "\$RUNNER_TEMP\/catalog-before\.json" "\$RUNNER_TEMP\/catalog-after\.json"/.test(s.body)) bad.push("the two reads are not compared with cmp");
  if (s.body.indexOf("catalog-before.json") > s.body.indexOf("-f \"$f\"")) bad.push("the before-read comes after the apply");
  if (/MP_OUT_DIR[^\n]*catalog-(before|after)/.test(s.body)) bad.push("a catalog file is written into the uploaded directory");
  if (/continue-on-error/.test(s.body)) bad.push("continue-on-error");
  return bad;
}

test("the migration-proof workflow carries the second-apply step, correctly placed and gated", () => {
  assert.deepEqual(verify(TEXT), []);
});

test("ATTACK: the verifier is red against each way the step could be weakened", () => {
  const cut = (re, to = "") => TEXT.replace(re, to);
  assert.match(verify(cut(/ {6}- name: Apply the schema reconciliation migrations a second time[\s\S]*?(?= {6}- name: Upload)/)).join(";"), /absent/);
  assert.match(verify(cut(/cmp "\$RUNNER_TEMP\/catalog-before\.json" "\$RUNNER_TEMP\/catalog-after\.json"\n/)).join(";"), /cmp/);
  assert.match(verify(cut(/ --single-transaction -f "\$f"/, ' -f "$f"')).join(";"), /single-transaction/);
  assert.match(verify(cut(/384_schema_drift_reconcile_production_only\.sql /, "")).join(";"), /384_schema_drift_reconcile_production_only\.sql is not applied twice/);
  assert.match(verify(cut(/(second time[^\n]*\n)\s+if: steps\.scope\.outputs\.touched == 'true'\n/, "$1")).join(";"), /touched/);
  assert.match(verify(cut(/\$RUNNER_TEMP\/catalog-after\.json"\n {10}cmp/, '$MP_OUT_DIR/catalog-after.json"\n          cmp')).join(";"), /cmp|uploaded|read before and after/);
});

test("catalogOnly hands back the catalog it read (the --out file is that catalog), and nothing on failure", () => {
  const catalog = { tables: { t: "r" } };
  const ok = catalogOnly("x", () => ({ catalog, error: null }));
  assert.equal(ok.status, 0);
  assert.deepEqual(ok.catalog, catalog);
  const bad = catalogOnly("x", () => ({ catalog: null, error: { code: null, message: "m" } }));
  assert.equal(bad.status, 1);
  assert.equal(bad.catalog, undefined);
});

test("sortedCatalog: two reads that hold the same objects in a different physical order serialise identically, a changed definition does not (cmp compares text)", async () => {
  const { sortedCatalog } = await import("./schema-diff.mjs");
  const a = { tables: { b: "rtff", a: "rtff" }, policies: {} };
  const b = { tables: { a: "rtff", b: "rtff" }, policies: {} };
  assert.notEqual(JSON.stringify(a), JSON.stringify(b), "the raw order differs");
  assert.equal(JSON.stringify(sortedCatalog(a)), JSON.stringify(sortedCatalog(b)));
  assert.notEqual(JSON.stringify(sortedCatalog(a)), JSON.stringify(sortedCatalog({ tables: { a: "rtff", b: "rtft" }, policies: {} })));
  assert.deepEqual(sortedCatalog(null), {});
});
