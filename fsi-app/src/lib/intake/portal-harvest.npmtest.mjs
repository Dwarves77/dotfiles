// @ts-check
// PROOF (B1 portal-harvest consumer). The seams the operator's rulings name:
//   1. persistPortalCandidates NEVER carries status / first_seen_at / disposition fields — a re-crawl
//      can refresh last_seen_at + anchor_text ONLY (dispositions survive re-crawls).
//   2. buildCandidateSeed maps classifier DISPLAY severity → DB form and PRESETS source_id from the
//      ledger row's parent portal (the source-link seam: a deep link is not in the registry, its portal is).
//   3. plan mode is READ-ONLY: dry verdicts only — zero ledger updates, zero staged_updates inserts.
//   4. entity gate: a portal/uncertain verdict is not_an_item — stamped rejected-with-reason in apply,
//      untouched in plan.
//   5. classify/fetch FAILURE is INCONCLUSIVE (fetchOk discipline) — the row stays 'candidate', never
//      a reject, even in apply mode.
//   6. exists short-circuit: an already-minted subject promotes the ledger row to the EXISTING item and
//      never re-enters the cycle (no staged row → no re-ground spend).
// jiti imports the TS module (@/ alias). Runs in the *.npmtest.mjs job (after npm ci).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { persistPortalCandidates, buildCandidateSeed, consumePortalCandidates } = await jiti.import("./portal-harvest.ts");

// ── fake supabase client ─────────────────────────────────────────────────────────────────────────────
// Serves: the ledger select chain (thenable builder), ledger .update().eq() (stamps captured), the mint
// chokepoint's probes (existsId drives the source_url idempotency probe), staged_updates inserts (captured
// — plan mode must never produce one), and portal_link_candidates upserts (payloads captured).
function fakeClient({ ledgerRows = [], existsId = null, sourcesRows = [{ id: "src-reg-1" }] } = {}) {
  const stamps = [];
  const stagedInserts = [];
  const upserts = [];
  return {
    stamps, stagedInserts, upserts,
    from(table) {
      const q = {
        _update: null,
        select() { return this; },
        order() { return this; },
        limit() { return this; },
        in() { return this; },
        eq(col, val) {
          if (this._update && col === "id") { stamps.push({ id: val, ...this._update }); return Promise.resolve({ error: null }); }
          return this;
        },
        update(payload) { this._update = payload; return this; },
        insert(row) {
          if (table === "staged_updates") { stagedInserts.push(row); return q; }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(payload, opts) {
          if (table === "portal_link_candidates") upserts.push({ payload, opts });
          return Promise.resolve({ error: null });
        },
        maybeSingle: async () => ({ data: table === "intelligence_items" && existsId ? { id: existsId } : null, error: null }),
        single: async () => ({ data: { id: "new-1" }, error: null }),
        then(res) {
          const data = table === "portal_link_candidates" ? ledgerRows
            : table === "sources" ? sourcesRows
            : []; // intelligence_items dedup corpus: empty
          return Promise.resolve({ data, error: null }).then(res);
        },
      };
      // sources registry probe uses .in(...).limit(1) then awaits — route limit to the thenable
      if (table === "sources") q.limit = () => Promise.resolve({ data: sourcesRows, error: null });
      return q;
    },
  };
}

const LEDGER_ROW = {
  id: "plc-1",
  url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32099R9999",
  anchor_text: "Regulation (EU) 2099/9999",
  source_id: "portal-src-1",
  sources: { name: "EUR-Lex", category: "regulatory", base_tier: 1 },
};

const CLS_DOC = {
  entity_verdict: "specific_document",
  item_type: "regulation",
  domain: 1,
  relevance: 88,
  severity: "ACTION REQUIRED",
  priority: "HIGH",
  urgency_tier: "elevated",
  topic_tags: ["emissions"],
  jurisdictions: ["EU"],
  title_candidate: "Regulation (EU) 2099/9999 on freight emissions",
  summary: "A binding regulation.",
  rationale: "specific instrument",
  cost_usd_estimated: 0.001,
  render_ms: 5,
};

const okFetch = async () => ({ text: "x".repeat(1000), transport: "direct" });
const classifyAs = (result) => async () => ({ ok: true, result });

// ── 1. the ONE ledger write-site semantics ───────────────────────────────────────────────────────────
test("persistPortalCandidates: payload refreshes last_seen_at/anchor_text ONLY — never status/first_seen_at/dispositions", async () => {
  const sb = fakeClient();
  const r = await persistPortalCandidates(sb, "portal-src-1", [{ url: "https://x/doc1", anchorText: "Doc 1" }]);
  assert.equal(r.upserted, 1);
  assert.equal(sb.upserts.length, 1);
  const { payload, opts } = sb.upserts[0];
  assert.deepEqual(Object.keys(payload).sort(), ["anchor_text", "last_seen_at", "source_id", "url"]);
  assert.equal(opts.onConflict, "url");
  for (const forbidden of ["status", "first_seen_at", "disposition_reason", "dispositioned_at", "item_id"]) {
    assert.equal(forbidden in payload, false, `re-crawl upsert must never carry ${forbidden}`);
  }
});

// ── 2. seed mapping: severity display→db + source_id preset ──────────────────────────────────────────
test("buildCandidateSeed: toDbSeverity mapping + source_id PRESET from the parent portal + relevance carried", () => {
  const seed = buildCandidateSeed(LEDGER_ROW, CLS_DOC);
  assert.equal(seed.severity, "action_required", "display 'ACTION REQUIRED' must map to db 'action_required'");
  assert.equal(seed.source_id, "portal-src-1", "the source-link seam: deep links preset the parent portal's source_id");
  assert.equal(seed.source_url, LEDGER_ROW.url);
  assert.equal(seed.relevance, 88, "relevance rides to the chokepoint (applyStagedUpdate strips it from the INSERT seed)");
  assert.equal(seed.item_type, "regulation");
});

// ── 3. plan mode is READ-ONLY ────────────────────────────────────────────────────────────────────────
test("plan: specific_document → would_mint; ZERO ledger updates, ZERO staged inserts", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
  });
  assert.equal(r.outcomes.length, 1);
  assert.equal(r.outcomes[0].disposition, "would_mint");
  assert.equal(sb.stamps.length, 0, "plan mode must not stamp the ledger");
  assert.equal(sb.stagedInserts.length, 0, "plan mode must not stage");
});

// ── 4. entity gate ───────────────────────────────────────────────────────────────────────────────────
test("entity gate: portal verdict → not_an_item; plan leaves the row, apply stamps rejected-with-reason", async () => {
  const portalCls = { ...CLS_DOC, entity_verdict: "portal", item_type: null, rationale: "institution landing page" };
  const planSb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const plan = await consumePortalCandidates(planSb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(portalCls), anthropicKey: "test",
  });
  assert.equal(plan.outcomes[0].disposition, "not_an_item");
  assert.equal(planSb.stamps.length, 0);

  const applySb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const apply = await consumePortalCandidates(applySb, {
    mode: "apply", limit: 10, fetchDoc: okFetch, classify: classifyAs(portalCls), anthropicKey: "test",
    now: () => "2026-07-19T00:00:00.000Z",
  });
  assert.equal(apply.outcomes[0].disposition, "not_an_item");
  assert.equal(applySb.stamps.length, 1);
  assert.equal(applySb.stamps[0].status, "rejected");
  assert.match(applySb.stamps[0].disposition_reason, /entity-gate: portal/);
  assert.equal(applySb.stamps[0].dispositioned_at, "2026-07-19T00:00:00.000Z");
  assert.equal(applySb.stamps[0].item_id, null);
});

// ── 5. inconclusive is not a reject ──────────────────────────────────────────────────────────────────
test("classify failure → skipped, row untouched even in apply (fetchOk: inconclusive ≠ reject)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "apply", limit: 10, fetchDoc: okFetch, classify: async () => ({ ok: false, error: "Haiku 429" }), anthropicKey: "test",
  });
  assert.equal(r.outcomes[0].disposition, "skipped");
  assert.match(r.outcomes[0].reason, /classify failed/);
  assert.equal(sb.stamps.length, 0, "an inconclusive row must stay 'candidate' for retry");
});

test("thin fetch (<200ch) → skipped, untouched", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "apply", limit: 10, fetchDoc: async () => ({ text: "stub" }), classify: classifyAs(CLS_DOC), anthropicKey: "test",
  });
  assert.equal(r.outcomes[0].disposition, "skipped");
  assert.match(r.outcomes[0].reason, /inconclusive/);
  assert.equal(sb.stamps.length, 0);
});

// ── 6. exists short-circuit: no re-ground ────────────────────────────────────────────────────────────
test("exists: already-minted subject → ledger promoted to the EXISTING item; NO staged row (no re-ground)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW], existsId: "item-already-1" });
  const r = await consumePortalCandidates(sb, {
    mode: "apply", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    now: () => "2026-07-19T00:00:00.000Z",
  });
  assert.equal(r.outcomes[0].disposition, "exists");
  assert.equal(r.outcomes[0].itemId, "item-already-1");
  assert.equal(sb.stamps.length, 1);
  assert.equal(sb.stamps[0].status, "promoted");
  assert.equal(sb.stamps[0].item_id, "item-already-1");
  assert.match(sb.stamps[0].disposition_reason, /no re-ground/);
  assert.equal(sb.stagedInserts.length, 0, "an existing subject must never re-enter the cycle (spend guard)");
});
