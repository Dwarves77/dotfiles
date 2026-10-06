// commit-tier-change (lane G7-TIER, 2026-10-05): the admin base_tier write refuses a source that carries a
// tier_override. An override is the admin's explicit tier ruling; this endpoint must never write base_tier
// underneath it. The refusal is a 409 that names the override and the route that reverts it. Fixture only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { commitSeededTierChange } = await jiti.import("./logic.ts");

function fakeClient(rows) {
  const writes = [];
  const from = () => {
    const st = { verb: "select", payload: null, id: null, guardNull: false };
    const b = {
      select() { return b; },
      update(p) { st.verb = "update"; st.payload = p; return b; },
      eq(_c, v) { st.id = v; return b; },
      is(c, v) { if (c === "tier_override" && v === null) st.guardNull = true; return b; },
      maybeSingle() { const r = rows.find((x) => x.id === st.id); return Promise.resolve({ data: r ? { ...r } : null, error: null }); },
      then(res, rej) {
        const hit = rows.filter((r) => r.id === st.id && (!st.guardNull || r.tier_override == null));
        for (const r of hit) Object.assign(r, st.payload);
        writes.push({ id: st.id, payload: st.payload, guarded: st.guardNull });
        return Promise.resolve({ data: hit, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { from, writes };
}

test("a source without an override takes the operator base_tier", async () => {
  const rows = [{ id: "s1", base_tier: 4, tier_override: null }];
  const r = await commitSeededTierChange(fakeClient(rows), "s1", 2);
  assert.equal(r.status, 200);
  assert.equal(rows[0].base_tier, 2);
  assert.equal(r.body.prior_tier, 4);
});

test("ATTACK: a source with a tier_override is refused with 409, naming the override and the revert route; base_tier is untouched", async () => {
  const rows = [{ id: "s1", base_tier: 4, tier_override: 1 }];
  const client = fakeClient(rows);
  const r = await commitSeededTierChange(client, "s1", 2);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /tier_override/);
  assert.match(r.body.error, /\/api\/admin\/sources\/s1\/tier-override/);
  assert.equal(rows[0].base_tier, 4, "stored base_tier unchanged");
  assert.equal(client.writes.length, 0, "no write attempted");
});

test("ATTACK (race): an override set after the read is refused by the UPDATE itself, reported as 409, base_tier untouched", async () => {
  const rows = [{ id: "s1", base_tier: 4, tier_override: null }];
  const client = fakeClient(rows);
  const realFrom = client.from;
  let reads = 0;
  client.from = () => {
    const b = realFrom();
    const ms = b.maybeSingle;
    b.maybeSingle = () => ms().then((x) => { if (++reads === 1) rows[0].tier_override = 3; return x; });
    return b;
  };
  const r = await commitSeededTierChange(client, "s1", 2);
  assert.equal(r.status, 409);
  assert.equal(rows[0].base_tier, 4);
});

test("an unknown source is a 404", async () => {
  assert.equal((await commitSeededTierChange(fakeClient([]), "nope", 2)).status, 404);
});
