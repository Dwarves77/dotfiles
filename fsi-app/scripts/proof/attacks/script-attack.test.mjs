// script-attack.test.mjs -- lane PROOF-4 (2026-10-07). The runner for the existing adversarial audits (called, never
// copied): exit code, required verdict lines, forbidden verdict lines, and the attack on the attacker (an audit that
// exits 0 but did not exercise its attack must be RED). No child process is started: spawn is injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScriptAttack, extractDoBlock, runSqlBlockAttack } from "./script-attack.mjs";

const attack = () => ({
  id: "provenance-guard",
  invariant: "a forged escalation to verified is denied",
  expected: "every attack denied",
  kind: "script",
  script: "scripts/verify/prov-guard-adversarial-audit.mjs",
  expect_exit: 0,
  require: [
    { label: "A denied", pattern: "^\\s*PASS\\s+A forged-GUC" },
    { label: "B denied", pattern: "^\\s*PASS\\s+B direct" },
    { label: "E derivation path", pattern: "^\\s*(PASS|SKIP)\\s+E derivation" },
  ],
  forbid: [{ label: "any FAIL or ERROR", pattern: "^\\s*(FAIL|ERROR)\\b" }],
});

const spawnReturning = (result) => {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return result;
  };
  fn.calls = calls;
  return fn;
};

const GOOD = [
  "-------- #43 provenance-verified binding, adversarial proof --------",
  "  PASS  A forged-GUC quarantined->verified DENIED",
  "  PASS  B direct unverified->verified DENIED",
  "  SKIP  E derivation path reaches verified (depth>=2) ALLOWED  -- no item currently validates clean",
  "",
  "PROV-GUARD ADVERSARIAL GREEN: every attack denied.",
].join("\n");

test("a green audit passes: exit 0, every required line present, no forbidden line", () => {
  const spawn = spawnReturning({ status: 0, stdout: GOOD, stderr: "" });
  const out = [];
  const r = runScriptAttack({ attack: attack(), spawn, cwd: "/work/fsi-app", env: { X: "1" }, echo: (s) => out.push(s) });
  assert.equal(r.status, "pass");
  assert.equal(spawn.calls[0].args[0], "scripts/verify/prov-guard-adversarial-audit.mjs");
  assert.equal(spawn.calls[0].opts.cwd, "/work/fsi-app");
  assert.deepEqual(spawn.calls[0].opts.env, { X: "1" });
  assert.ok(out.join("").includes("PASS  A forged-GUC"), "the audit output is echoed to the job log");
});

test("ATTACK ON THE ATTACKER: exit 0 with the attack SKIPPED (not exercised) is RED", () => {
  const skipped = GOOD.replace("  PASS  A forged-GUC quarantined->verified DENIED", "  SKIP  A forged-GUC quarantined->verified DENIED  -- no quarantined rows");
  const r = runScriptAttack({ attack: attack(), spawn: spawnReturning({ status: 0, stdout: skipped, stderr: "" }), cwd: ".", env: {}, echo: () => {} });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /A denied/);
});

test("a FAIL line fails the attack even when the exit code is 0", () => {
  const r = runScriptAttack({
    attack: attack(),
    spawn: spawnReturning({ status: 0, stdout: GOOD + "\n  FAIL  C on-conflict-do-update escalation DENIED\n", stderr: "" }),
    cwd: ".", env: {}, echo: () => {},
  });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /any FAIL or ERROR/);
});

test("exit 1 (the audit found a leak) and exit 2 (it could not verify) both fail", () => {
  for (const status of [1, 2]) {
    const r = runScriptAttack({ attack: attack(), spawn: spawnReturning({ status, stdout: GOOD, stderr: "" }), cwd: ".", env: {}, echo: () => {} });
    assert.equal(r.status, "fail", `exit ${status}`);
    assert.match(r.observed, new RegExp(`exit=${status}`));
  }
});

test("a spawn error fails the attack", () => {
  const r = runScriptAttack({ attack: attack(), spawn: spawnReturning({ status: null, error: new Error("ENOENT"), stdout: "", stderr: "" }), cwd: ".", env: {}, echo: () => {} });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /could not start/);
});

test("the report carries pattern labels and counts, never the audit's raw output", () => {
  const sentinel = "ROW-TEXT-FROM-A-REAL-ITEM";
  const r = runScriptAttack({
    attack: attack(),
    spawn: spawnReturning({ status: 0, stdout: GOOD + `\n  note: ${sentinel}\n`, stderr: "" }),
    cwd: ".", env: {}, echo: () => {},
  });
  assert.ok(!JSON.stringify(r).includes(sentinel));
});

const BLOCK_FILE = [
  "-- header",
  "BEGIN;",
  "DO $selfcheck$",
  "BEGIN",
  "  RAISE NOTICE 'inner';",
  "END",
  "$selfcheck$;",
  "COMMIT;",
].join("\n");

test("extractDoBlock: takes the marked DO block and nothing around it; a missing marker throws", () => {
  const block = extractDoBlock(BLOCK_FILE, "DO $selfcheck$", "$selfcheck$;");
  assert.ok(block.startsWith("DO $selfcheck$"));
  assert.ok(block.endsWith("$selfcheck$;"));
  assert.ok(!block.includes("COMMIT"));
  assert.throws(() => extractDoBlock(BLOCK_FILE, "DO $nope$", "$selfcheck$;"), /nope/);
});

function noticeClient({ error = null, notices = [] } = {}) {
  const handlers = [];
  const calls = [];
  return {
    calls,
    on(ev, fn) { if (ev === "notice") handlers.push(fn); },
    removeListener() { handlers.length = 0; },
    async query(sql) {
      calls.push(String(sql));
      if (String(sql).startsWith("DO ") ) {
        if (error) throw error;
        for (const n of notices) handlers.forEach((h) => h({ message: n }));
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const blockAttack = () => ({
  id: "corrections-selfcheck",
  invariant: "every correction target kind is preserved",
  expected: "the migration self-check passes on loaded data",
  kind: "sql-block",
  file: "supabase/migrations/356_item_corrections.sql",
  start_marker: "DO $selfcheck$",
  end_marker: "$selfcheck$;",
  require_notice: "356 self-check passed",
});

test("sql-block: the migration self-check re-run passes when it raises nothing and reports its pass notice; skips are counted", async () => {
  const client = noticeClient({ notices: ["356 self-check: no intelligence_item_sections row, section_text step skipped", "356 self-check passed (fixtures rolled back)"] });
  const r = await runSqlBlockAttack({ client, attack: blockAttack(), readFile: () => BLOCK_FILE });
  assert.equal(r.status, "pass");
  assert.match(r.observed, /1 step\(s\) skipped/);
  assert.equal(client.calls[0], "BEGIN");
  assert.equal(client.calls.at(-1), "ROLLBACK");
});

test("sql-block: an exception from the block (a correction layer defect) is RED", async () => {
  const err = Object.assign(new Error("356 self-check FAILED: a tag add did not survive a machine write"), { code: "P0001" });
  const r = await runSqlBlockAttack({ client: noticeClient({ error: err }), attack: blockAttack(), readFile: () => BLOCK_FILE });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /P0001/);
});

test("sql-block: no error but no pass notice (the block did not reach its end) is RED", async () => {
  const r = await runSqlBlockAttack({ client: noticeClient({ notices: [] }), attack: blockAttack(), readFile: () => BLOCK_FILE });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /pass notice/);
});
