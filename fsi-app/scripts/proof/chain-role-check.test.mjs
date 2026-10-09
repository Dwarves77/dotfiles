/** Tests for scripts/proof/chain-role-check.mjs and the CHAIN-5 workflow shape (lane CHAIN-5, 2026-10-09): the stack serves
 *  capture-worker, and the roles the replayed migrations create are asserted on the stack and the oracle. Databases are stubs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSqlComments, rolesCreatedBy, appliedFiles, checkRoles, runRoleCheck } from "./chain-role-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI = resolve(HERE, "..", "..");
const TEXT = readFileSync(resolve(FSI, "..", ".github", "workflows", "chain-proof.yml"), "utf8");
const CONFIG = readFileSync(resolve(FSI, "supabase", "config.toml"), "utf8");
const codeOf = (t) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const steps = () => TEXT.split(/^\s{6}- name: /m).slice(1).map((p) => ({ name: p.split("\n")[0], body: p }));

// ---- the scan ----------------------------------------------------------------------------------------------

test("rolesCreatedBy: finds bare, quoted and USER forms, inside a DO block too, and ignores comments", () => {
  const sql = [
    "-- CREATE ROLE ghost_line;",
    "/* CREATE ROLE ghost_block; */",
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN CREATE ROLE reconciler NOLOGIN NOSUPERUSER; END IF; END $$;",
    'create role "Quoted Role" nologin;',
    "CREATE USER app_user;",
    "ALTER ROLE other SET x = 1;",
  ].join("\n");
  assert.deepEqual(rolesCreatedBy(sql).sort(), ["Quoted Role", "app_user", "reconciler"]);
  assert.ok(!stripSqlComments(sql).includes("ghost"));
});

test("the committed tree: migration 118 creates the reconciler role and the scan finds it", () => {
  const dir = join(FSI, "supabase", "migrations");
  const found = new Set(readdirSync(dir).filter((f) => f.endsWith(".sql")).flatMap((f) => rolesCreatedBy(readFileSync(join(dir, f), "utf8"))));
  assert.ok(found.has("reconciler"));
});

test("appliedFiles: only applied migration files, never the stack prelude or a failed file", () => {
  const report = { files: [{ file: "(stack prelude: x)", status: "applied" }, { file: "001.sql", status: "applied" }, { file: "002.sql", status: "failed" }] };
  assert.deepEqual(appliedFiles(report), ["001.sql"]);
  assert.deepEqual(appliedFiles(null), []);
});

// ---- the check ---------------------------------------------------------------------------------------------

test("checkRoles: passes only when every created role is on both clusters", () => {
  assert.equal(checkRoles({ created: ["reconciler"], stackRoles: ["reconciler"], oracleRoles: ["reconciler"] }).ok, true);
});

test("ATTACK: a role missing from the oracle, or from the stack, is red and named; so is a scan that found no role at all", () => {
  const noOracle = checkRoles({ created: ["reconciler"], stackRoles: ["reconciler"], oracleRoles: [] });
  assert.equal(noOracle.ok, false);
  assert.deepEqual(noOracle.missing_on_oracle, ["reconciler"]);
  assert.match(noOracle.problems.join(), /role reconciler .* absent from the oracle cluster/);
  const noStack = checkRoles({ created: ["reconciler"], stackRoles: [], oracleRoles: ["reconciler"] });
  assert.match(noStack.problems.join(), /absent from the stack/);
  assert.match(checkRoles({ created: [], stackRoles: [], oracleRoles: [] }).problems.join(), /no CREATE ROLE statement was found/);
});

test("runRoleCheck: reads the applied files from the replay report, asks both clusters, and fails on an unreadable applied file", async () => {
  const files = { "118.sql": "DO $$ BEGIN CREATE ROLE reconciler NOLOGIN; END $$;", "001.sql": "SELECT 1;" };
  const readFile = (p) => { const f = p.split(/[\\/]/).pop(); if (!(f in files)) throw new Error("ENOENT"); return files[f]; };
  const report = { files: [{ file: "001.sql", status: "applied" }, { file: "118.sql", status: "applied" }] };
  const asked = [];
  const q = (held) => async (sql, params) => { asked.push(params[0]); return held.filter((r) => params[0].includes(r)).map((rolname) => ({ rolname })); };
  const ok = await runRoleCheck({ replayReport: report, migrationsDir: "/m", readFile, queryStack: q(["reconciler"]), queryOracle: q(["reconciler"]) });
  assert.equal(ok.ok, true);
  assert.deepEqual(asked[0], ["reconciler"]);
  assert.equal(ok.files_scanned, 2);
  const noOracle = await runRoleCheck({ replayReport: report, migrationsDir: "/m", readFile, queryStack: q(["reconciler"]), queryOracle: q([]) });
  assert.equal(noOracle.ok, false);
  const missingFile = await runRoleCheck({ replayReport: { files: [...report.files, { file: "999.sql", status: "applied" }] }, migrationsDir: "/m", readFile, queryStack: q(["reconciler"]), queryOracle: q(["reconciler"]) });
  assert.equal(missingFile.ok, false);
  assert.match(missingFile.problems.join(), /999\.sql could not be read/);
});

// ---- the workflow and the stack config ---------------------------------------------------------------------

test("CHAIN-5: edge_runtime is enabled in the stack config and the capture-worker function is placed in the stack directory BEFORE the stack starts", () => {
  assert.match(CONFIG, /^\[edge_runtime\]\r?\nenabled = true\r?$/m);
  const names = steps().map((n) => n.name);
  const place = names.findIndex((n) => /Place the capture-worker Edge Function in the stack directory/.test(n));
  const start = names.findIndex((n) => /Start the local stack/.test(n));
  assert.ok(place >= 0 && place < start, "the function directory is placed before the stack starts");
  const body = codeOf(steps()[place].body);
  assert.match(body, /cp -R fsi-app\/supabase\/functions\/capture-worker "\$CHAIN_PROOF_STACK\/supabase\/functions\/capture-worker"/);
  assert.match(body, /test -f "\$CHAIN_PROOF_STACK\/supabase\/functions\/capture-worker\/index\.ts"/);
  assert.match(body, /^\s+set -euo pipefail$/m);
  assert.ok(readFileSync(resolve(FSI, "supabase", "functions", "capture-worker", "index.ts"), "utf8").length > 0, "the function exists in the repository");
});

test("CHAIN-5: the role check runs after the oracle gate through the lane wrapper, with the local env sourced and the preflight first", () => {
  const names = steps().map((n) => n.name);
  const gate = names.findIndex((n) => /Schema oracle gate/.test(n));
  const role = names.findIndex((n) => /Assert the roles the replayed migrations create exist/.test(n));
  assert.ok(role > gate, "after the oracle gate");
  const b = codeOf(steps()[role].body);
  assert.ok(b.indexOf('. "$CHAIN_PROOF_ENV"') >= 0 && b.indexOf("preflight.mjs") > b.indexOf('. "$CHAIN_PROOF_ENV"'));
  assert.match(b, /run-lane-step\.mjs --name role-check --lane CHAIN-5 --script scripts\/proof\/chain-role-check\.mjs --out-dir "\$CP_OUT_DIR" -- --replay-report "\$CP_OUT_DIR\/replay-report\.json"/);
  assert.match(b, /^\s+set -euo pipefail$/m);
});
