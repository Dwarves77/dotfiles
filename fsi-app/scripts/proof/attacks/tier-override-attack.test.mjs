// tier-override-attack.test.mjs -- lane PROOF-4 (2026-10-07). The automatic-writer attack on sources.tier_override,
// proven on a fake database and a fake runner: the control source (same evidence, no override) must move, the
// overridden source must not, and a writer that overwrites an override must produce a RED result. The fake applies
// the behaviour the real recompute-tiers.mjs is supposed to have; nothing is spawned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTierOverrideAttack } from "./tier-override-attack.mjs";

const ATTACK = { id: "tier-override-automatic-writer", invariant: "an automatic writer never writes over an admin tier override", expected: "override source unchanged, control source moved" };

function fakeDb({ ids = ["ctl", "ovr"], onRun } = {}) {
  const state = {
    ctl: { id: "ctl", base_tier: 4, effective_tier: 3, tier_override: null },
    ovr: { id: "ovr", base_tier: 5, effective_tier: 5, tier_override: null },
  };
  const calls = [];
  const client = {
    calls,
    state,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      const s = String(sql);
      if (/^SELECT id FROM public\.sources/.test(s)) return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
      if (/to_jsonb\(s\) AS snapshot/.test(s)) return { rows: params[0].map((id) => ({ id, snapshot: { ...state[id], __orig: true } })), rowCount: params[0].length };
      if (/SET base_tier = 4/.test(s)) {
        // the seeding statement: params = [controlId, overrideId]
        Object.assign(state[params[0]], { base_tier: 4, effective_tier: null, tier_override: null });
        Object.assign(state[params[1]], { base_tier: 4, effective_tier: null, tier_override: 2 });
        return { rows: [], rowCount: 2 };
      }
      if (/FROM public\.source_trust_events/.test(s)) return { rows: [{ n: onRun?.events ?? 0 }], rowCount: 1 };
      if (/SELECT id, base_tier, effective_tier, tier_override FROM public\.sources/.test(s)) return { rows: params[0].map((id) => ({ ...state[id] })), rowCount: params[0].length };
      if (/jsonb_populate_record/.test(s)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function fakeRunner(client, behaviour, summary = { counts: { override_held: 1, movements: 1 }, read_back: { override_skipped: 0 } }) {
  return (cmd, args) => {
    behaviour(client.state, args);
    return { status: behaviour.exit ?? 0, stdout: "", stderr: "", __summary: summary };
  };
}

const run = async (client, behaviour, over = {}) => {
  const summary = over.summary ?? { counts: { override_held: 1, movements: 1 }, read_back: { override_skipped: 0 } };
  return runTierOverrideAttack({
    attack: ATTACK,
    client,
    cwd: "/work/fsi-app",
    env: { CHAIN_PROOF_LOCAL: "1" },
    spawn: (cmd, args, opts) => {
      behaviour(client.state, args);
      return { status: over.exit ?? 0, stdout: "", stderr: "" };
    },
    readJson: () => summary,
    makeTempDir: () => "/tmp/proof4-tier",
    echo: () => {},
    ...over.deps,
  });
};

test("held: the control source moves, the overridden source is left exactly as it was, no event is written for it", async () => {
  const client = fakeDb();
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; });
  assert.equal(r.status, "pass", r.observed);
  assert.match(r.observed, /control moved/);
});

test("the runner is invoked in apply mode against recompute-tiers with an output directory", async () => {
  const client = fakeDb();
  let seen;
  await runTierOverrideAttack({
    attack: ATTACK, client, cwd: "/work/fsi-app", env: {},
    spawn: (cmd, args) => { seen = args; client.state.ctl.effective_tier = 5; return { status: 0, stdout: "", stderr: "" }; },
    readJson: () => ({ counts: { override_held: 1 }, read_back: {} }),
    makeTempDir: () => "/tmp/p4", echo: () => {},
  });
  assert.equal(seen[0], "scripts/maintenance/recompute-tiers.mjs");
  assert.ok(seen.includes("--mode") && seen[seen.indexOf("--mode") + 1] === "apply");
  assert.ok(seen.includes("--out"));
});

test("ATTACK ON THE ATTACKER: a writer that overwrites the override's effective_tier is RED", async () => {
  const client = fakeDb();
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; st.ovr.effective_tier = 6; });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /override source changed/);
});

test("ATTACK ON THE ATTACKER: a writer that clears or replaces tier_override itself is RED", async () => {
  const client = fakeDb();
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; st.ovr.tier_override = null; });
  assert.equal(r.status, "fail");
});

test("an audit event written for the overridden source is RED", async () => {
  const client = fakeDb({ onRun: { events: 1 } });
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /event/);
});

test("NOT EXERCISED: the control source did not move, so the evidence proves nothing and the attack is RED", async () => {
  const client = fakeDb();
  const r = await run(client, () => {});
  assert.equal(r.status, "fail");
  assert.match(r.observed, /not exercised/i);
});

test("NOT EXERCISED: the planner never saw the override (override_held 0) is RED", async () => {
  const client = fakeDb();
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; }, { summary: { counts: { override_held: 0 }, read_back: {} } });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /override_held/);
});

test("a recompute-tiers run that exits nonzero is RED", async () => {
  const client = fakeDb();
  const r = await run(client, (st) => { st.ctl.effective_tier = 5; }, { exit: 1 });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /exit=1/);
});

test("fewer than two usable sources is NOT EXERCISED and nothing is written", async () => {
  const client = fakeDb({ ids: ["only"] });
  const r = await run(client, () => {});
  assert.equal(r.status, "fail");
  assert.match(r.observed, /not exercised/i);
  assert.ok(!client.calls.some((c) => /SET base_tier = 4/.test(c.sql)));
});

test("the two sources are restored from their snapshots even when the attack fails", async () => {
  const client = fakeDb();
  await run(client, (st) => { st.ovr.effective_tier = 6; });
  const restores = client.calls.filter((c) => /jsonb_populate_record/.test(c.sql));
  assert.equal(restores.length, 2, "one restore per source");
});
