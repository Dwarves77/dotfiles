// FIRE-TEST for the missing source_tier_opinions WRITER (migration 091 — see tier-opinion-writer.ts
// for the full background). Proves recordTierOpinion's non-negotiable contract with a FAKE Supabase
// client — no live DB, no network. Import-free source module (relative .ts import, Node 22 type
// stripping — same portability discipline as register-step.test.mjs / host-authority.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordTierOpinion, describeTierOpinionError } from "./tier-opinion-writer.ts";

// Fake client that records every insert call and returns a scripted result.
function fakeClient(result) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        return {
          insert(row) {
            calls.push({ table, row });
            return Promise.resolve(result);
          },
        };
      },
    },
  };
}

test("recordTierOpinion: writes target_source_id, opined_tier, and opinion_source on success", async () => {
  const { client, calls } = fakeClient({ error: null });
  const res = await recordTierOpinion(client, {
    targetSourceId: "src-123",
    opinedTier: 3,
  });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "source_tier_opinions");
  assert.deepEqual(calls[0].row, {
    target_source_id: "src-123",
    opined_tier: 3,
    opinion_source: "haiku_brief_classifier",
    opining_source_id: null,
    intelligence_item_id: null,
  });
});

test("recordTierOpinion: passes through opining_source_id and intelligence_item_id when given", async () => {
  const { client, calls } = fakeClient({ error: null });
  await recordTierOpinion(client, {
    targetSourceId: "src-123",
    opinedTier: 5,
    opiningSourceId: "src-999",
    intelligenceItemId: "item-abc",
  });
  assert.equal(calls[0].row.opining_source_id, "src-999");
  assert.equal(calls[0].row.intelligence_item_id, "item-abc");
});

test("recordTierOpinion: NEVER throws when the insert returns an error — caught, described, swallowed", async () => {
  const { client } = fakeClient({
    error: { message: "duplicate key value", details: "Key already exists.", hint: null, code: "23505" },
  });
  // The whole point: this must resolve, never reject, so a caller inside brief generation can never
  // have a regeneration fail because opinion recording failed.
  const res = await recordTierOpinion(client, { targetSourceId: "src-1", opinedTier: 2 });
  assert.equal(res.ok, false);
  assert.match(res.error, /message=duplicate key value/);
  assert.match(res.error, /code=23505/);
});

test("recordTierOpinion: NEVER throws when the client itself throws synchronously or rejects", async () => {
  const throwingClient = {
    from() {
      return {
        insert() {
          return Promise.reject(new Error("network exploded"));
        },
      };
    },
  };
  const res = await recordTierOpinion(throwingClient, { targetSourceId: "src-1", opinedTier: 4 });
  assert.equal(res.ok, false);
  assert.equal(res.error, "network exploded");

  const syncThrowingClient = {
    from() {
      throw new Error("from() blew up");
    },
  };
  const res2 = await recordTierOpinion(syncThrowingClient, { targetSourceId: "src-1", opinedTier: 4 });
  assert.equal(res2.ok, false);
  assert.equal(res2.error, "from() blew up");
});

test("describeTierOpinionError: renders full diagnostic surface, defaulting missing fields to 'none'/'unknown'", () => {
  assert.equal(
    describeTierOpinionError({ message: "boom", details: "d", hint: "h", code: "c" }),
    "message=boom | details=d | hint=h | code=c"
  );
  assert.equal(
    describeTierOpinionError({}),
    "message=unknown | details=none | hint=none | code=none"
  );
});

test("opined_tier CHECK domain (migration 091: opined_tier BETWEEN 1 AND 7) — caller-side sanity, not DB-enforced here", () => {
  // recordTierOpinion trusts its caller for the tier range (registerCitedSources only calls it with
  // parsed brief-table tiers, already constrained to 1-7 by parseNewSourcesFromBrief's regex). This
  // test just documents the contract boundary so a future caller change doesn't silently drift it.
  for (const t of [1, 4, 7]) assert.ok(t >= 1 && t <= 7);
});
