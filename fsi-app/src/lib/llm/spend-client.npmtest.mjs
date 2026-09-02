// PROOF (Lane SPEND, system-completion train, 2026-09-02): spendMessage — the non-streaming twin of
// spendStream/spendSearch, added so first-fetch-classify's Haiku call routes through the spend chokepoint
// instead of a raw ticketless fetch. Same guard sequence (assertTicket -> assertBudget -> guardPricedLine),
// same telemetry sequence (account() -> recordSpendCall() -> markCallLogged()) as every other spend-client
// function. jiti imports the TS module (@/ alias) + @supabase/supabase-js. Runs in the *.npmtest.mjs job
// (after npm ci).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const { spendMessage, setSpendTicket, resetSpendTicket, unloggedCallCount, assertLedgerDrained } =
  await jiti.import("./spend-client.ts");
const { __resetSpendForTest } = await jiti.import("./spend-guard.mjs");

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

// ── fake global fetch: routes Anthropic messages calls vs the Supabase agent_runs REST insert ──────────
function installFakeFetch({ anthropicHandler }) {
  const anthropicCalls = [];
  const supabaseInserts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.anthropic.com")) {
      anthropicCalls.push({ url: u, headers: init?.headers ?? {}, body: JSON.parse(init?.body ?? "{}") });
      return anthropicHandler(anthropicCalls[anthropicCalls.length - 1]);
    }
    // Supabase REST (postgrest) — agent_runs insert. Capture the row, respond 201 empty (return=minimal).
    supabaseInserts.push({ url: u, row: JSON.parse(init?.body ?? "{}") });
    return new Response(null, { status: 201, headers: { "content-type": "application/json" } });
  };
  return { anthropicCalls, supabaseInserts, restore: () => { globalThis.fetch = realFetch; } };
}

function anthropicOk({ inputTokens = 100, outputTokens = 20, text = "hello" } = {}) {
  return async () =>
    new Response(JSON.stringify({ usage: { input_tokens: inputTokens, output_tokens: outputTokens }, content: [{ type: "text", text }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

function anthropicFail(status, message) {
  return async () =>
    new Response(JSON.stringify({ error: { type: "overloaded_error", message } }), {
      status,
      headers: { "content-type": "application/json" },
    });
}

test.beforeEach(() => {
  __resetSpendForTest();
  resetSpendTicket();
});

test("spendMessage: ticketless call THROWS SPEND_TICKET_REQUIRED, no fetch made", async () => {
  const { anthropicCalls, restore } = installFakeFetch({ anthropicHandler: anthropicOk() });
  try {
    await assert.rejects(
      () => spendMessage({ system: "s", user: "u", model: "claude-haiku-4-5-20251001" }, null),
      /SPEND_TICKET_REQUIRED/,
    );
    assert.equal(anthropicCalls.length, 0, "a ticketless call must never reach the network");
  } finally {
    restore();
  }
});

test("spendMessage: happy path — accounts, writes ONE agent_runs row (model/cost/source_id/purpose), marks logged", async () => {
  const { supabaseInserts, restore } = installFakeFetch({ anthropicHandler: anthropicOk({ inputTokens: 200, outputTokens: 40 }) });
  try {
    const ticket = { purpose: "spend-client-test", sourceId: "src-abc", itemId: null };
    const r = await spendMessage({ system: "s", user: "u", model: "claude-haiku-4-5-20251001" }, ticket);
    assert.equal(r.usage.input_tokens, 200);
    assert.equal(r.usage.output_tokens, 40);
    assert.ok(r.cost > 0, "a real cost must be computed from usage");
    assert.equal(supabaseInserts.length, 1, "exactly one agent_runs row per call");
    const row = supabaseInserts[0].row;
    assert.equal(row.model, "claude-haiku-4-5-20251001");
    assert.equal(row.source_id, "src-abc");
    assert.equal(row.intelligence_item_id, null);
    assert.ok(row.cost_usd_estimated > 0);
    assert.equal(row.errors[0].telemetry.purpose, "spend-client-test");
    assert.equal(unloggedCallCount(), 0, "the ledger row landed — nothing left unlogged");
    assert.doesNotThrow(() => assertLedgerDrained());
  } finally {
    restore();
  }
});

test("spendMessage: apiKey option WINS over ANTHROPIC_API_KEY env", async () => {
  const prevEnv = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "env-key-should-lose";
  const { anthropicCalls, restore } = installFakeFetch({ anthropicHandler: anthropicOk() });
  try {
    await spendMessage(
      { system: "s", user: "u", model: "claude-haiku-4-5-20251001", apiKey: "injected-key-should-win" },
      { purpose: "apikey-precedence-test" },
    );
    assert.equal(anthropicCalls[0].headers["x-api-key"], "injected-key-should-win");
  } finally {
    restore();
    if (prevEnv === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevEnv;
  }
});

test("spendMessage: a non-2xx Haiku response THROWS and leaves NOTHING unlogged (no tokens were billed)", async () => {
  const { supabaseInserts, restore } = installFakeFetch({ anthropicHandler: anthropicFail(529, "overloaded") });
  try {
    await assert.rejects(
      () => spendMessage({ system: "s", user: "u", model: "claude-haiku-4-5-20251001" }, { purpose: "http-fail-test" }),
      /ANTHROPIC_TRANSIENT|overloaded/,
    );
    assert.equal(supabaseInserts.length, 0, "no agent_runs row for a call that was never billed");
    assert.equal(unloggedCallCount(), 0, "account() never ran, so nothing is owed a ledger row");
  } finally {
    restore();
  }
});
