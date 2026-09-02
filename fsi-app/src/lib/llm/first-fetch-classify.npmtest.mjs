// PROOF (Lane SPEND, system-completion train, 2026-09-02): firstFetchClassify now routes its Haiku call
// through the spend chokepoint (spend-client.ts's spendMessage) instead of a raw, ticketless fetch to
// api.anthropic.com. Proves:
//   1. a ticket ({purpose:"first-fetch-classify", standingClass:"first-fetch-classify", sourceId, itemId:
//      null}) is set for the call and the PREVIOUS ticket is restored afterward.
//   2. exactly ONE agent_runs row is written per call, carrying model/cost/source_id/purpose.
//   3. the unlogged-telemetry invariant returns to 0 after the call.
//   4. an "error response" (a billable Haiku call whose output does not parse) still leaves its
//      agent_runs row — the classify-level {ok:false} is downstream of, not instead of, the spend write.
//   5. the classify JSON parsing / entity-gate / domain-routing behavior is unchanged.
//   6. the apiKey parameter still wins over ANTHROPIC_API_KEY.
//   7. the entity-gate error-body short-circuit makes NO API call and touches NO ticket (unchanged).
// jiti imports the TS module (@/ alias) + @supabase/supabase-js. Runs in the *.npmtest.mjs job (after npm ci).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const { firstFetchClassify } = await jiti.import("./first-fetch-classify.ts");
const { setSpendTicket, resetSpendTicket, currentSpendTicket, unloggedCallCount, assertLedgerDrained } =
  await jiti.import("./spend-client.ts");
const { __resetSpendForTest } = await jiti.import("./spend-guard.mjs");

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

function installFakeFetch(anthropicHandler) {
  const anthropicCalls = [];
  const supabaseInserts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.anthropic.com")) {
      anthropicCalls.push({ url: u, headers: init?.headers ?? {}, body: JSON.parse(init?.body ?? "{}") });
      return anthropicHandler(anthropicCalls[anthropicCalls.length - 1]);
    }
    supabaseInserts.push({ url: u, row: JSON.parse(init?.body ?? "{}") });
    return new Response(null, { status: 201, headers: { "content-type": "application/json" } });
  };
  return { anthropicCalls, supabaseInserts, restore: () => { globalThis.fetch = realFetch; } };
}

function haikuJsonResponse(obj, { inputTokens = 500, outputTokens = 60 } = {}) {
  return async () =>
    new Response(
      JSON.stringify({ usage: { input_tokens: inputTokens, output_tokens: outputTokens }, content: [{ type: "text", text: JSON.stringify(obj) }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

function haikuRawTextResponse(text, { inputTokens = 500, outputTokens = 60 } = {}) {
  return async () =>
    new Response(
      JSON.stringify({ usage: { input_tokens: inputTokens, output_tokens: outputTokens }, content: [{ type: "text", text }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

const INPUT = {
  source_id: "src-eur-lex-1",
  source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32099R9999",
  source_name: "EUR-Lex",
  source_tier: 1,
  source_category: "regulatory",
  text: "x".repeat(500),
};

const HAIKU_DOC_JSON = {
  entity_verdict: "specific_document",
  item_type: "regulation",
  domain: 1,
  surface_tags: ["regulations"],
  relevance: 88,
  severity: "ACTION REQUIRED",
  priority: "HIGH",
  urgency_tier: "elevated",
  topic_tags: ["emissions"],
  jurisdictions: ["EU"],
  title_candidate: "Regulation (EU) 2099/9999 on freight emissions",
  summary: "A binding regulation.",
  rationale: "specific instrument",
};

test.beforeEach(() => {
  __resetSpendForTest();
  resetSpendTicket();
});

// ── 1 + 2 + 3: ticket set + restored, one agent_runs row, unlogged returns to 0 ─────────────────────────
test("firstFetchClassify: sets the first-fetch-classify ticket for the call, restores the PRIOR ticket after, writes ONE agent_runs row, drains the ledger", async () => {
  const { supabaseInserts, restore } = installFakeFetch(haikuJsonResponse(HAIKU_DOC_JSON));
  try {
    setSpendTicket({ purpose: "outer-caller-ticket" }); // simulate a caller mid-pipeline
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, true);

    assert.equal(supabaseInserts.length, 1, "exactly one agent_runs row for this call");
    const row = supabaseInserts[0].row;
    assert.equal(row.model, "claude-haiku-4-5-20251001");
    assert.equal(row.source_id, "src-eur-lex-1", "invariant I1: sourceId reaches agent_runs.source_id");
    assert.equal(row.intelligence_item_id, null, "no item exists yet at first-fetch — never item-anonymous AND source-anonymous, but itemId is deliberately null here");
    assert.ok(row.cost_usd_estimated > 0);
    assert.equal(row.errors[0].telemetry.purpose, "first-fetch-classify");

    assert.equal(currentSpendTicket().purpose, "outer-caller-ticket", "the caller's ticket must be restored after the call");
    assert.equal(unloggedCallCount(), 0);
    assert.doesNotThrow(() => assertLedgerDrained());
  } finally {
    restore();
  }
});

test("firstFetchClassify: with no prior ticket set, restores to the legacy default (never leaves the classify ticket active)", async () => {
  const { restore } = installFakeFetch(haikuJsonResponse(HAIKU_DOC_JSON));
  try {
    await firstFetchClassify(INPUT, "test-api-key");
    assert.notEqual(currentSpendTicket().purpose, "first-fetch-classify", "the classify ticket must not leak past the call");
  } finally {
    restore();
  }
});

// ── 4: a business-logic "error response" (unparseable Haiku output) STILL logs the spend ────────────────
test("firstFetchClassify: unparseable Haiku output is ok:false, but the BILLABLE call still leaves its agent_runs row", async () => {
  const { supabaseInserts, restore } = installFakeFetch(haikuRawTextResponse("this is not json at all"));
  try {
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, false);
    assert.match(result.error, /did not contain a JSON object/);
    assert.equal(supabaseInserts.length, 1, "the call WAS billed (200 + usage) — it must still be logged even though classify itself judged the output unusable");
    assert.equal(unloggedCallCount(), 0);
  } finally {
    restore();
  }
});

// ── 5: classify JSON parsing / entity-gate / domain routing behavior is unchanged ────────────────────────
test("firstFetchClassify: classify shape unchanged — specific_document maps item_type/domain/surface_tags/etc. verbatim", async () => {
  const { restore } = installFakeFetch(haikuJsonResponse(HAIKU_DOC_JSON, { inputTokens: 700, outputTokens: 90 }));
  try {
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, true);
    assert.equal(result.result.entity_verdict, "specific_document");
    assert.equal(result.result.item_type, "regulation");
    assert.equal(result.result.domain, 1);
    assert.deepEqual(result.result.surface_tags, ["regulations"]);
    assert.equal(result.result.relevance, 88);
    assert.equal(result.result.title_candidate, "Regulation (EU) 2099/9999 on freight emissions");
    assert.ok(result.result.cost_usd_estimated > 0, "cost_usd_estimated is the chokepoint's real cost, not a stub 0");
    assert.equal(result.result.input_tokens, 700, "additive field: raw usage carried through");
    assert.equal(result.result.output_tokens, 90);
  } finally {
    restore();
  }
});

test("firstFetchClassify: omitted item_type on entity_verdict=specific_document is honestly 'uncertain' (line-191 fix unchanged)", async () => {
  const { restore } = installFakeFetch(haikuJsonResponse({ ...HAIKU_DOC_JSON, item_type: undefined }));
  try {
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, true);
    assert.equal(result.result.entity_verdict, "uncertain");
    assert.equal(result.result.item_type, null);
  } finally {
    restore();
  }
});

test("firstFetchClassify: portal verdict → item_type null, domain null (unchanged)", async () => {
  const portal = { ...HAIKU_DOC_JSON, entity_verdict: "portal", item_type: undefined, domain: undefined, surface_tags: [] };
  const { restore } = installFakeFetch(haikuJsonResponse(portal));
  try {
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, true);
    assert.equal(result.result.entity_verdict, "portal");
    assert.equal(result.result.item_type, null);
    assert.equal(result.result.domain, null);
  } finally {
    restore();
  }
});

// ── 6: apiKey parameter still wins over ANTHROPIC_API_KEY ────────────────────────────────────────────────
test("firstFetchClassify: the apiKey parameter WINS over ANTHROPIC_API_KEY (spend-client honours the injected key)", async () => {
  const prevEnv = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "env-key-should-lose";
  const { anthropicCalls, restore } = installFakeFetch(haikuJsonResponse(HAIKU_DOC_JSON));
  try {
    await firstFetchClassify(INPUT, "injected-key-should-win");
    assert.equal(anthropicCalls[0].headers["x-api-key"], "injected-key-should-win");
  } finally {
    restore();
    if (prevEnv === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevEnv;
  }
});

// ── 7: entity-gate error-body short-circuit makes NO API call and touches NO ticket ──────────────────────
test("firstFetchClassify: error-body pre-gate short-circuits BEFORE any spend — no fetch, no ticket touched, no agent_runs row", async () => {
  const { anthropicCalls, supabaseInserts, restore } = installFakeFetch(haikuJsonResponse(HAIKU_DOC_JSON));
  try {
    setSpendTicket({ purpose: "outer-caller-ticket" });
    const result = await firstFetchClassify({ ...INPUT, text: "x" }, "test-api-key"); // <60ch -> isErrorBody
    assert.equal(result.ok, true);
    assert.equal(result.result.entity_verdict, "uncertain");
    assert.equal(anthropicCalls.length, 0, "no Haiku call for a pre-gated error body");
    assert.equal(supabaseInserts.length, 0, "no spend, no ledger row");
    assert.equal(currentSpendTicket().purpose, "outer-caller-ticket", "the caller's ticket must be untouched");
    assert.equal(unloggedCallCount(), 0);
  } finally {
    restore();
  }
});

// ── network / HTTP failure is still INCONCLUSIVE (ok:false), never a thrown exception ────────────────────
test("firstFetchClassify: a non-2xx Haiku response is INCONCLUSIVE (ok:false), not a thrown exception; nothing left unlogged", async () => {
  const { supabaseInserts, restore } = installFakeFetch(
    async () => new Response(JSON.stringify({ error: { type: "rate_limit_error", message: "slow down" } }), { status: 429 }),
  );
  try {
    const result = await firstFetchClassify(INPUT, "test-api-key");
    assert.equal(result.ok, false);
    assert.match(result.error, /429|rate_limit|slow down/i);
    assert.equal(supabaseInserts.length, 0, "an HTTP-level failure was never billed — no row expected");
    assert.equal(unloggedCallCount(), 0);
  } finally {
    restore();
  }
});
