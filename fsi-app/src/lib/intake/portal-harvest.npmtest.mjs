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
function fakeClient({ ledgerRows = [], existsId = null, sourcesRows = [{ id: "src-reg-1" }], censusWorklistRows = null, censusWorklistErrors = false, rpcRows = null } = {}) {
  const stamps = [];
  const stagedInserts = [];
  const upserts = [];
  const orCalls = [];
  const notCalls = [];
  const rpcCalls = [];
  return {
    stamps, stagedInserts, upserts, orCalls, notCalls, rpcCalls,
    // Server-side census-exclusion RPC (migration 223). Default: "function missing" (PGRST202) so the
    // consumer falls back to the client-side exclusion path — the existing exclusion tests exercise that
    // fallback unchanged. Pass rpcRows to exercise the RPC-present path.
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve(
        rpcRows
          ? { data: rpcRows, error: null }
          : { data: null, error: { message: "Could not find the function public.next_uncensused_portal_candidates (PGRST202)" } }
      );
    },
    from(table) {
      const q = {
        _update: null,
        select() { return this; },
        order() { return this; },
        limit() { return this; },
        in() { return this; },
        or(filter) { orCalls.push({ table, filter }); return this; },
        not(col, op, val) { notCalls.push({ table, col, op, val }); return this; },
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
          const data =
            table === "portal_link_candidates" ? ledgerRows
            : table === "sources" ? sourcesRows
            : table === "census_worklist" ? (censusWorklistRows ?? [])
            : []; // intelligence_items dedup corpus: empty
          const error = table === "census_worklist" && censusWorklistErrors
            ? { message: 'relation "census_worklist" does not exist' }
            : null;
          return Promise.resolve({ data: error ? null : data, error }).then(res);
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
  first_seen_at: "2026-07-15T00:00:00.000Z",
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

// ── 7. keyset pagination (census walk, 2026-07-19) — plan-mode-only, read-only ──────────────────────────
test("after cursor: builds a keyset OR filter, never an offset", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    after: { firstSeenAt: "2026-07-10T00:00:00.000Z", id: "plc-0" },
  });
  assert.equal(sb.orCalls.length, 1);
  assert.equal(sb.orCalls[0].table, "portal_link_candidates");
  // ascending (default): strictly-greater-than the cursor, expressed as first_seen_at.gt OR (eq AND id.gt)
  assert.match(sb.orCalls[0].filter, /first_seen_at\.gt\.2026-07-10T00:00:00\.000Z/);
  assert.match(sb.orCalls[0].filter, /and\(first_seen_at\.eq\.2026-07-10T00:00:00\.000Z,id\.gt\.plc-0\)/);
});

test("after cursor: newestFirst flips gt to lt (same keyset shape, reverse order)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    newestFirst: true, after: { firstSeenAt: "2026-07-10T00:00:00.000Z", id: "plc-0" },
  });
  assert.match(sb.orCalls[0].filter, /first_seen_at\.lt\./);
  assert.match(sb.orCalls[0].filter, /id\.lt\.plc-0/);
});

test("no after: no OR filter applied (first chunk of a fresh walk)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
  });
  assert.equal(sb.orCalls.length, 0);
});

test("nextCursor: present (last row's keyset position) when the chunk is FULL (limit reached, more may remain)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 1, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
  });
  assert.deepEqual(r.nextCursor, { firstSeenAt: "2026-07-15T00:00:00.000Z", id: "plc-1" });
});

test("nextCursor: absent when the chunk is SHORT (fewer rows than limit — source exhausted here)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
  });
  assert.equal(r.nextCursor, undefined);
});

// census_worklist real shape (introspected 2026-07-19 via pg_catalog — no committed migration, no doc):
// keys on (source_id, document_url), completion marked by non-null dryrun_disposition, NO run-id column.
test("censusExclusion: server-side RPC (migration 223) — candidates come from the RPC, NO client census read (no ~435-row NOT IN overflow)", async () => {
  const RPC_ROW = {
    id: "plc-rpc-1", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32099R0001",
    anchor_text: "Regulation (EU) 2099/1", source_id: "portal-src-1", first_seen_at: "2026-07-16T00:00:00.000Z",
    source_name: "EUR-Lex", source_category: "regulatory", source_base_tier: 1,
  };
  const sb = fakeClient({ rpcRows: [RPC_ROW] });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 25, sourceId: "portal-src-1", newestFirst: false,
    after: { firstSeenAt: "2026-07-15T00:00:00.000Z", id: "plc-0" },
    fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    censusExclusion: { table: "census_worklist" },
  });
  // the RPC was called with the source scope + keyset cursor threaded through
  assert.equal(sb.rpcCalls.length, 1);
  assert.equal(sb.rpcCalls[0].name, "next_uncensused_portal_candidates");
  assert.deepEqual(sb.rpcCalls[0].args, { p_source_id: "portal-src-1", p_limit: 25, p_newest: false, p_after_first_seen: "2026-07-15T00:00:00.000Z", p_after_id: "plc-0" });
  // NO client-side census_worklist read happened (the whole point — no NOT IN list to overflow)
  assert.equal(sb.notCalls.find((c) => c.table === "census_worklist"), undefined, "server-side RPC must not do the client census read");
  assert.equal(sb.notCalls.find((c) => c.table === "portal_link_candidates"), undefined, "server-side RPC must not build the client NOT IN list");
  // the RPC's flat row was mapped back to a LedgerCandidate and processed
  assert.equal(r.discovered, 1, "the RPC row was consumed");
});

test("censusExclusion: RPC absent (pre-migration) → falls back to the client NOT IN path, does not throw", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW], censusWorklistRows: [{ document_url: "https://x/old-1" }] });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    censusExclusion: { table: "census_worklist" },
  });
  assert.equal(sb.rpcCalls.length, 1, "the RPC was attempted first");
  const ledgerNot = sb.notCalls.find((c) => c.table === "portal_link_candidates");
  assert.ok(ledgerNot, "fell back to the client NOT IN exclusion");
  assert.match(ledgerNot.val, /old-1/);
  assert.equal(r.discovered, 1);
});

test("censusExclusion: dispositioned rows → excludes candidates by URL via .not(url, in, ...)", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW], censusWorklistRows: [{ document_url: "https://x/old-1" }, { document_url: "https://x/old-2" }] });
  await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    censusExclusion: { table: "census_worklist" },
  });
  // the census read filters to completed rows: .not(dryrun_disposition, is, null) on census_worklist
  const censusNot = sb.notCalls.find((c) => c.table === "census_worklist");
  assert.ok(censusNot, "must read only DISPOSITIONED census rows");
  assert.equal(censusNot.col, "dryrun_disposition");
  assert.equal(censusNot.op, "is");
  assert.equal(censusNot.val, null);
  // the ledger query excludes by URL, not id (the census table has no candidate-id, it matches on URL)
  const ledgerNot = sb.notCalls.find((c) => c.table === "portal_link_candidates");
  assert.ok(ledgerNot, "must exclude already-dispositioned candidates from the ledger read");
  assert.equal(ledgerNot.col, "url");
  assert.equal(ledgerNot.op, "in");
  assert.match(ledgerNot.val, /old-1/);
  assert.match(ledgerNot.val, /old-2/);
});

test("censusExclusion: table/column absent → fails CLOSED to no exclusion, does not throw", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW], censusWorklistErrors: true });
  const r = await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    censusExclusion: { table: "census_worklist" },
  });
  const ledgerNot = sb.notCalls.find((c) => c.table === "portal_link_candidates");
  assert.equal(ledgerNot, undefined, "no ledger exclusion filter when the census lookup errors");
  assert.equal(r.outcomes.length, 1, "the consume itself still proceeds normally (cursor-only fallback)");
});

test("censusExclusion: table exists but nothing dispositioned yet → no ledger exclusion", async () => {
  const sb = fakeClient({ ledgerRows: [LEDGER_ROW], censusWorklistRows: [] });
  await consumePortalCandidates(sb, {
    mode: "plan", limit: 10, fetchDoc: okFetch, classify: classifyAs(CLS_DOC), anthropicKey: "test",
    censusExclusion: { table: "census_worklist" },
  });
  const ledgerNot = sb.notCalls.find((c) => c.table === "portal_link_candidates");
  assert.equal(ledgerNot, undefined);
});
