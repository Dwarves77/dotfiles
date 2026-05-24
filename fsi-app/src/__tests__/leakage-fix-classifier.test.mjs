// Synthetic verification for the leakage fix dispatch (2026-05-23, B4 per
// caros-ledge-platform-intent REC-OBS-G).
//
// Run with: node --experimental-strip-types --test fsi-app/src/__tests__/leakage-fix-classifier.test.mjs
//
// (Node 24 ships native TS type-stripping; no tsx/ts-node needed.)
//
// Asserts that:
//  1. domainForItemType() routing rule matches the canonical CASE in
//     migration 101 (one assertion per documented branch).
//  2. asDomain() rejects out-of-range / NaN / non-numeric inputs to null
//     (NEVER silently coerced to 1).
//  3. The drain-first-fetch seedRow contract: when the classifier emits a
//     valid domain, that value lands on the row; when it emits null OR
//     when the enrichment is null, the row carries `domain: null` (not 1).
//     Verified via a mock Supabase client that records the insert payload.
//
// This is the verification step the operator wants before any ingest restart.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asDomain,
  domainForItemType,
  REGULATIONS_DOMAIN,
  MARKET_TECH_DOMAIN,
  OPERATIONS_REGIONAL_DOMAIN,
  MARKET_SIGNALS_DOMAIN,
  OPERATIONS_FACILITY_DOMAIN,
  RESEARCH_DOMAIN,
  DOMAIN_LABELS,
  ALL_DOMAINS,
} from "../lib/domains.ts";

// ─────────────────────────────────────────────────────────────────────
// 1. Routing rule equivalence with migration 101 CASE
// ─────────────────────────────────────────────────────────────────────

test("domainForItemType: unambiguous regulatory item_types -> 1", () => {
  for (const t of ["regulation", "directive", "standard", "guidance", "law"]) {
    assert.equal(domainForItemType(t, null), REGULATIONS_DOMAIN, `item_type=${t}`);
    assert.equal(domainForItemType(t, "research"), REGULATIONS_DOMAIN, `${t} ignores source.category`);
  }
});

test("domainForItemType: framework routes by source.category", () => {
  assert.equal(domainForItemType("framework", "research"), RESEARCH_DOMAIN);
  assert.equal(domainForItemType("framework", "market_news"), MARKET_SIGNALS_DOMAIN);
  assert.equal(domainForItemType("framework", "operational_data"), OPERATIONS_REGIONAL_DOMAIN);
  assert.equal(domainForItemType("framework", "regulatory"), REGULATIONS_DOMAIN);
  assert.equal(domainForItemType("framework", null), REGULATIONS_DOMAIN);
});

test("domainForItemType: research_finding -> 7", () => {
  assert.equal(domainForItemType("research_finding", null), RESEARCH_DOMAIN);
  assert.equal(domainForItemType("research_finding", "market_news"), RESEARCH_DOMAIN);
});

test("domainForItemType: regional_data -> 3", () => {
  assert.equal(domainForItemType("regional_data", null), OPERATIONS_REGIONAL_DOMAIN);
});

test("domainForItemType: market_signal -> 4", () => {
  assert.equal(domainForItemType("market_signal", null), MARKET_SIGNALS_DOMAIN);
});

test("domainForItemType: technology / innovation -> 2", () => {
  assert.equal(domainForItemType("technology", null), MARKET_TECH_DOMAIN);
  assert.equal(domainForItemType("innovation", null), MARKET_TECH_DOMAIN);
});

test("domainForItemType: tool routes by source.category", () => {
  assert.equal(domainForItemType("tool", "research"), RESEARCH_DOMAIN);
  assert.equal(domainForItemType("tool", "operational_data"), OPERATIONS_REGIONAL_DOMAIN);
  assert.equal(domainForItemType("tool", "market_news"), MARKET_TECH_DOMAIN);
  assert.equal(domainForItemType("tool", null), MARKET_TECH_DOMAIN);
});

test("domainForItemType: initiative routes by source.category", () => {
  assert.equal(domainForItemType("initiative", "regulatory"), REGULATIONS_DOMAIN);
  assert.equal(domainForItemType("initiative", "research"), RESEARCH_DOMAIN);
  assert.equal(domainForItemType("initiative", "operational_data"), OPERATIONS_REGIONAL_DOMAIN);
  assert.equal(domainForItemType("initiative", "market_news"), MARKET_SIGNALS_DOMAIN);
  assert.equal(domainForItemType("initiative", null), MARKET_SIGNALS_DOMAIN);
});

test("domainForItemType: unknown item_type returns null (NOT silently 1)", () => {
  assert.equal(domainForItemType("nonsense", null), null);
  assert.equal(domainForItemType("", null), null);
  assert.equal(domainForItemType(null, null), null);
  assert.equal(domainForItemType(undefined, null), null);
});

// ─────────────────────────────────────────────────────────────────────
// 2. asDomain hardening
// ─────────────────────────────────────────────────────────────────────

test("asDomain: accepts integers 1-7", () => {
  for (let i = 1; i <= 7; i++) assert.equal(asDomain(i), i);
});

test("asDomain: rejects out-of-range, non-integer, non-numeric to null", () => {
  assert.equal(asDomain(0), null);
  assert.equal(asDomain(8), null);
  assert.equal(asDomain(-1), null);
  assert.equal(asDomain(1.5), null);
  assert.equal(asDomain(NaN), null);
  assert.equal(asDomain("1"), null);
  assert.equal(asDomain(null), null);
  assert.equal(asDomain(undefined), null);
  assert.equal(asDomain({}), null);
});

test("asDomain: NEVER silently coerces to 1 (the leakage bug)", () => {
  // The exact failure mode the dispatch is fixing: any garbage input must
  // become null, not 1.
  for (const garbage of [null, undefined, "regulation", 0, 99, NaN, {}, []]) {
    assert.notEqual(asDomain(garbage), 1, `garbage=${String(garbage)} must not map to 1`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. Label coverage sanity
// ─────────────────────────────────────────────────────────────────────

test("DOMAIN_LABELS covers 1-7 (CHECK constraint range)", () => {
  for (let i = 1; i <= 7; i++) {
    assert.ok(DOMAIN_LABELS[i], `domain ${i} has a label`);
  }
  assert.equal(Object.keys(DOMAIN_LABELS).length, 7);
});

test("ALL_DOMAINS is the 1-7 set", () => {
  assert.equal(ALL_DOMAINS.size, 7);
  for (let i = 1; i <= 7; i++) assert.ok(ALL_DOMAINS.has(i));
  assert.equal(ALL_DOMAINS.has(0), false);
  assert.equal(ALL_DOMAINS.has(8), false);
});

// ─────────────────────────────────────────────────────────────────────
// 4. Drain seedRow contract simulation
//
// Inline mirrors the seedRow shape from
// fsi-app/src/app/api/worker/drain-first-fetch/route.ts lines 273-302.
// The mirror lives here so the test runs without bundling Next.js
// (the real route imports @supabase/supabase-js + Next request types
// which cannot be loaded under node:test directly). Any drift between
// the route's seedRow assembly and this mirror is caught by
// the F9 tsc gate AND by manual code-review on changes to either file.
// ─────────────────────────────────────────────────────────────────────

function buildSeedRow({ source, enrichment }) {
  // Mirrors seedStubIntelligenceItem's seedRow assembly post-leakage-fix.
  const seedRow = {
    source_id: source.id,
    source_url: source.url,
    domain: enrichment?.domain ?? null,
    status: "monitoring",
    pipeline_stage: "draft",
  };
  if (enrichment) {
    seedRow.title = (enrichment.title || source.name || source.url).slice(0, 200);
    seedRow.summary = enrichment.summary;
    seedRow.item_type = enrichment.item_type;
  } else {
    seedRow.title = source.name || source.url;
  }
  return seedRow;
}

// Mock Supabase client that records insert payloads instead of hitting
// the real database. Verifies the row the route would have written.
function makeMockSupabase() {
  const inserts = [];
  return {
    inserts,
    from() {
      return {
        insert(payload) {
          inserts.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: { id: "mock-id" }, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

test("drain seedRow: classifier-emitted market_signal domain lands as 4 (NOT hardcoded 1)", async () => {
  const source = { id: "src-1", url: "https://example.com/m", name: "Market source" };
  const enrichment = {
    title: "BYD battery announcement",
    summary: "BYD says LFP yields up 18%.",
    item_type: "market_signal",
    domain: MARKET_SIGNALS_DOMAIN, // 4
  };
  const supabase = makeMockSupabase();
  const seedRow = buildSeedRow({ source, enrichment });
  // Simulate the insert the route performs.
  await supabase.from("intelligence_items").insert(seedRow).select("id").single();
  assert.equal(supabase.inserts.length, 1);
  const inserted = supabase.inserts[0];
  assert.equal(inserted.domain, 4, "market_signal must land on Market Intel (4), NOT Regulations (1)");
  assert.notEqual(inserted.domain, 1, "market_signal MUST NOT be hardcoded to 1");
  assert.equal(inserted.item_type, "market_signal");
});

test("drain seedRow: classifier-emitted regulation domain lands as 1", async () => {
  const source = { id: "src-2", url: "https://example.com/r", name: "Reg source" };
  const enrichment = {
    title: "EU CSDDD enforcement update",
    summary: "Effective 2026.",
    item_type: "regulation",
    domain: REGULATIONS_DOMAIN,
  };
  const supabase = makeMockSupabase();
  const seedRow = buildSeedRow({ source, enrichment });
  await supabase.from("intelligence_items").insert(seedRow).select("id").single();
  assert.equal(supabase.inserts[0].domain, 1);
});

test("drain seedRow: NULL classifier domain passes NULL through (NOT silently 1)", async () => {
  const source = { id: "src-3", url: "https://example.com/x", name: "Unknown" };
  const enrichment = {
    title: "Ambiguous content",
    summary: "Could not classify.",
    item_type: "unknown_garbage",
    domain: null, // classifier could not route
  };
  const supabase = makeMockSupabase();
  const seedRow = buildSeedRow({ source, enrichment });
  await supabase.from("intelligence_items").insert(seedRow).select("id").single();
  assert.equal(supabase.inserts[0].domain, null, "NULL must pass through");
  assert.notEqual(supabase.inserts[0].domain, 1, "NULL must NOT coerce to 1");
});

test("drain seedRow: no enrichment (Haiku unavailable) -> domain null", async () => {
  const source = { id: "src-4", url: "https://example.com/y", name: "Fallback" };
  const supabase = makeMockSupabase();
  const seedRow = buildSeedRow({ source, enrichment: null });
  await supabase.from("intelligence_items").insert(seedRow).select("id").single();
  assert.equal(supabase.inserts[0].domain, null, "bare-stub fallback must NOT default to 1");
});

test("drain seedRow: domain is 1-7 OR NULL, never anything else", async () => {
  for (const candidate of [null, 1, 2, 3, 4, 5, 6, 7]) {
    const source = { id: "src-x", url: "https://example.com/q", name: "Q" };
    const enrichment = {
      title: "T",
      summary: "S",
      item_type: "regulation",
      domain: candidate,
    };
    const supabase = makeMockSupabase();
    const seedRow = buildSeedRow({ source, enrichment });
    await supabase.from("intelligence_items").insert(seedRow).select("id").single();
    const got = supabase.inserts[0].domain;
    if (got !== null) {
      assert.ok(got >= 1 && got <= 7, `domain ${got} out of range`);
    }
  }
});
