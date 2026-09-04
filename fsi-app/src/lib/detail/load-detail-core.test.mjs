// Structural proof for src/lib/detail/load-detail-core.ts (perf lane,
// 2026-09-03) — the shared "load a detail page" shape all four
// (/regulations|market|operations|research)/[slug]/page.tsx files call
// through load-detail.ts.
//
// Tests load-detail-CORE, not load-detail.ts: load-detail.ts value-imports
// next/cache (unstable_cache), which `node --test` cannot resolve outside
// Next's own bundler (the `next` package ships no package.json "exports" map
// for the bare specifier `next/cache`, confirmed empirically) — so nothing
// that imports it can run under plain node, npm deps installed or not.
// load-detail-core.ts is the split specifically to make this file possible:
// it imports next/*'s TYPES only (`import type`, fully erased by Node's
// built-in type-stripping — never resolved at runtime) and takes every
// Next/Supabase-bound VALUE through the required `deps` parameter. This file
// is therefore a plain, portable *.test.mjs (no *.npmtest.mjs / npm-ci CI
// step needed) — it joins run-test-suite.sh's directory glob for
// fsi-app/src/lib/detail/*.test.mjs like any other module test.
//
// No real Supabase, no real Next request scope: every Next-bound dependency
// is a stub passed through `deps` — this is a proof about loadDetailCore's
// OWN control flow (concurrency, cache reuse, viewer isolation), not an
// integration test against a database.
import test from "node:test";
import assert from "node:assert/strict";
import { loadDetailCore, buildClaimTierMap, fetchClaimTierMap } from "./load-detail-core.ts";

/** Thin call-shape helper: fills in cacheKeyParts/cacheTags from
 *  surface+id the same way load-detail.ts's real wrapper does
 *  (itemTag(id) + surfaceDetailTag(surface)), so each test only states
 *  what it's actually varying. */
function call(surface, id, rest) {
  return {
    surface,
    id,
    cacheKeyParts: ["detail-item-scoped", surface, id],
    cacheTags: [`item:${id}`, `${surface}-detail`],
    ...rest,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** In-memory stand-in for unstable_cache, matching loadDetail's real call shape:
 *  cacheWrap(keyParts, tags, fn) -> () => Promise<T>, memoized by keyParts. */
function makeMemoCache() {
  const store = new Map();
  let calls = 0;
  const wrap = (keyParts, _tags, fn) => {
    const key = keyParts.join("::");
    return async () => {
      if (store.has(key)) return store.get(key);
      calls++;
      const result = await fn();
      store.set(key, result);
      return result;
    };
  };
  wrap.callCount = () => calls;
  return wrap;
}

const baseDetail = {
  resource: { id: "item-a", title: "Item A" },
  connections: [],
  supersessions: [],
  relevanceInput: { title: "Item A" },
  changelog: [],
  dispute: null,
  canonicalSurface: "regulations",
};

test("loadDetailCore returns notFound when canonicalSurface does not match the route surface", async () => {
  const result = await loadDetailCore(
    call("market", "item-a", {
      loadItemScoped: async () => ({}),
      deps: {
        fetchItem: async () => baseDetail, // canonicalSurface: "regulations"
        fetchSections: async () => [],
        getRelevance: async () => null,
        createServiceClient: () => ({}),
        resolveOrgId: async () => null,
        cacheWrap: makeMemoCache(),
      },
    })
  );
  assert.deepEqual(result, { notFound: true });
});

test("loadDetailCore returns notFound when the item does not exist", async () => {
  const result = await loadDetailCore(
    call("regulations", "missing", {
      loadItemScoped: async () => ({}),
      deps: {
        fetchItem: async () => null,
        fetchSections: async () => [],
        getRelevance: async () => null,
        createServiceClient: () => ({}),
        resolveOrgId: async () => null,
        cacheWrap: makeMemoCache(),
      },
    })
  );
  assert.deepEqual(result, { notFound: true });
});

test("(a) sections, item-scoped, and viewer-scoped all start before any one resolves (Promise.all, not sequential awaits)", async () => {
  const events = [];

  const result = await loadDetailCore(
    call("regulations", "item-a", {
      loadItemScoped: async () => {
        events.push("start:itemScoped");
        await sleep(15);
        events.push("end:itemScoped");
        return { related: ["r1"] };
      },
      loadViewerScoped: async () => {
        events.push("start:viewerScoped");
        await sleep(15);
        events.push("end:viewerScoped");
        return { ownerName: "Alice" };
      },
      deps: {
        fetchItem: async () => baseDetail,
        fetchSections: async () => {
          events.push("start:sections");
          await sleep(15);
          events.push("end:sections");
          return [];
        },
        getRelevance: async () => null,
        createServiceClient: () => ({}),
        resolveOrgId: async () => "org-a",
        cacheWrap: makeMemoCache(),
      },
    })
  );

  assert.equal(result.notFound, false);
  const starts = events.filter((e) => e.startsWith("start:"));
  const firstEnd = events.findIndex((e) => e.startsWith("end:"));
  // All three "start:" events must appear before the FIRST "end:" event —
  // if load-detail sequentially awaited them, the second stage could not
  // have logged its start until the first stage's end had already run.
  const startsBeforeFirstEnd = events.slice(0, firstEnd).filter((e) => e.startsWith("start:"));
  assert.equal(starts.length, 3, `expected 3 starts, saw: ${events.join(",")}`);
  assert.equal(
    startsBeforeFirstEnd.length,
    3,
    `expected all 3 stages started before the first one ended, saw: ${events.join(",")}`
  );
});

test("(no org/user key) the item-scoped ctx carries no viewer identity", async () => {
  let capturedCtxKeys = null;
  await loadDetailCore(
    call("regulations", "item-a", {
      loadItemScoped: async (ctx) => {
        capturedCtxKeys = Object.keys(ctx).sort();
        return {};
      },
      deps: {
        fetchItem: async () => baseDetail,
        fetchSections: async () => [],
        getRelevance: async () => null,
        createServiceClient: () => ({}),
        resolveOrgId: async () => "org-a",
        cacheWrap: makeMemoCache(),
      },
    })
  );
  assert.deepEqual(capturedCtxKeys, ["connections", "resource", "supabase", "supersessions"]);
  assert.ok(
    !capturedCtxKeys.some((k) => /org|user|viewer/i.test(k)),
    "item-scoped ctx must not carry an org/user/viewer-shaped key"
  );
});

test("(includeRelevance) defaults to false: deps.getRelevance is never called, and relevance resolves to null", async () => {
  let getRelevanceCalls = 0;
  const result = await loadDetailCore(
    call("regulations", "item-a", {
      loadItemScoped: async () => ({}),
      deps: {
        fetchItem: async () => baseDetail,
        fetchSections: async () => [],
        getRelevance: async () => {
          getRelevanceCalls++;
          return { band: "should-never-be-seen" };
        },
        createServiceClient: () => ({}),
        resolveOrgId: async () => "org-a",
        cacheWrap: makeMemoCache(),
      },
      // includeRelevance omitted — this is the production shape: all four detail page.tsx call
      // sites opt out after PERF-10 (2026-09-04). See LoadDetailCoreConfig.includeRelevance's own
      // header in load-detail-core.ts for why this default is what fixes the single most universal
      // cause of all four detail routes building `ƒ` (Dynamic) at build time.
    })
  );
  assert.equal(getRelevanceCalls, 0, "deps.getRelevance must not be called when includeRelevance is omitted/false");
  assert.equal(result.notFound, false);
  assert.equal(result.relevance, null);
});

test("(includeRelevance) when explicitly true, deps.getRelevance runs and its result reaches result.relevance (the pre-PERF-10 shape, preserved for callers that opt in)", async () => {
  let getRelevanceCalls = 0;
  const result = await loadDetailCore(
    call("regulations", "item-a", {
      includeRelevance: true,
      loadItemScoped: async () => ({}),
      deps: {
        fetchItem: async () => baseDetail,
        fetchSections: async () => [],
        getRelevance: async () => {
          getRelevanceCalls++;
          return { band: "relevant" };
        },
        createServiceClient: () => ({}),
        resolveOrgId: async () => "org-a",
        cacheWrap: makeMemoCache(),
      },
    })
  );
  assert.equal(getRelevanceCalls, 1);
  assert.equal(result.notFound, false);
  assert.deepEqual(result.relevance, { band: "relevant" });
});

test("(b)+(c) a second call for the same slug under a different viewer does not re-run the item-scoped set, and never receives the first viewer's org-scoped fields", async () => {
  let itemScopedCalls = 0;
  const cacheWrap = makeMemoCache();

  async function callAs(viewerOrgId, ownerName) {
    return loadDetailCore(
      call("regulations", "item-a", {
        // PERF-10 (2026-09-04): includeRelevance defaults to false now (see this file's own
        // includeRelevance tests above) — this test's own point is viewer isolation of relevance
        // ACROSS a cache hit, which needs deps.getRelevance to actually run, so it opts in explicitly
        // rather than relying on the old always-on default.
        includeRelevance: true,
        loadItemScoped: async () => {
          itemScopedCalls++;
          return { relatedTitles: ["Cross-referenced Reg"] };
        },
        loadViewerScoped: async ({ orgId }) => {
          assert.equal(orgId, viewerOrgId, "loadViewerScoped must receive THIS call's orgId, not a cached one");
          return { ownerName };
        },
        deps: {
          fetchItem: async () => baseDetail,
          fetchSections: async () => [],
          getRelevance: async () => (viewerOrgId ? { band: `relevant-to-${viewerOrgId}` } : null),
          createServiceClient: () => ({}),
          resolveOrgId: async () => viewerOrgId,
          cacheWrap,
        },
      })
    );
  }

  const viewerA = await callAs("org-a", "Alice");
  const viewerB = await callAs("org-b", "Bob");

  assert.equal(itemScopedCalls, 1, "the item-scoped (org-independent) set must run once, not once per viewer");
  assert.deepEqual(viewerA.itemScoped, viewerB.itemScoped, "both viewers see the identical cached item-scoped payload");

  // (c): viewer B must never see viewer A's org-scoped fields, and vice versa.
  assert.equal(viewerA.viewerScoped.ownerName, "Alice");
  assert.equal(viewerB.viewerScoped.ownerName, "Bob");
  assert.notEqual(viewerA.viewerScoped.ownerName, viewerB.viewerScoped.ownerName);
  assert.equal(viewerA.relevance.band, "relevant-to-org-a");
  assert.equal(viewerB.relevance.band, "relevant-to-org-b");
});

test("loadItemScoped never runs when the service client is unavailable (soft-fail, matching prior page.tsx try/catch posture)", async () => {
  let called = false;
  const result = await loadDetailCore(
    call("regulations", "item-a", {
      loadItemScoped: async () => {
        called = true;
        return { related: [] };
      },
      deps: {
        fetchItem: async () => baseDetail,
        fetchSections: async () => [],
        getRelevance: async () => null,
        createServiceClient: () => null, // unconfigured
        resolveOrgId: async () => null,
        cacheWrap: makeMemoCache(),
      },
    })
  );
  assert.equal(result.notFound, false);
  assert.equal(called, false);
  assert.equal(result.itemScoped, null);
});

// ── TIER-CHIP lane (2026-09-04): buildClaimTierMap / fetchClaimTierMap ─────────────────────────────

test("buildClaimTierMap: COALESCE(tier_override, base_tier) — tier_override wins when both are set", () => {
  const map = buildClaimTierMap([
    { claim_text: "[effective_date] ... «a»", sources: { name: "EUR-Lex", url: "https://x", base_tier: 4, tier_override: 2 } },
  ]);
  assert.equal(map["[effective_date] ... «a»"].tier, 2);
  assert.equal(map["[effective_date] ... «a»"].sourceName, "EUR-Lex");
});

test("buildClaimTierMap: base_tier used when tier_override is null", () => {
  const map = buildClaimTierMap([
    { claim_text: "[due_date] ... «b»", sources: { name: "Trade Press", url: null, base_tier: 5, tier_override: null } },
  ]);
  assert.equal(map["[due_date] ... «b»"].tier, 5);
});

test("buildClaimTierMap: sources null (no resolved source_id — a GAP row, or a FACT the query still returned with a null join) — tier null, never a guess", () => {
  const map = buildClaimTierMap([{ claim_text: "[penalty_summary] ... «c»", sources: null }]);
  assert.equal(map["[penalty_summary] ... «c»"].tier, null);
  assert.equal(map["[penalty_summary] ... «c»"].sourceName, null);
});

test("buildClaimTierMap: source resolved but carries neither base_tier nor tier_override — tier null (matches migration 141's source_tier_null case)", () => {
  const map = buildClaimTierMap([
    { claim_text: "[jurisdictional_scope] ... «d»", sources: { name: "Unrated Registry Row", url: null, base_tier: null, tier_override: null } },
  ]);
  assert.equal(map["[jurisdictional_scope] ... «d»"].tier, null);
  assert.equal(map["[jurisdictional_scope] ... «d»"].sourceName, "Unrated Registry Row");
});

test("buildClaimTierMap: PostgREST array-shaped embed (defensive, same idiom as supabase-server.ts's fetchResearchPipelineRows) resolves the same as an object", () => {
  const map = buildClaimTierMap([
    { claim_text: "[title] ... «e»", sources: [{ name: "EUR-Lex", url: "https://x", base_tier: 2, tier_override: null }] },
  ]);
  assert.equal(map["[title] ... «e»"].tier, 2);
});

test("buildClaimTierMap: null/undefined/empty rows — empty map, never throws", () => {
  assert.deepEqual(buildClaimTierMap(null), {});
  assert.deepEqual(buildClaimTierMap(undefined), {});
  assert.deepEqual(buildClaimTierMap([]), {});
});

test("buildClaimTierMap: multiple distinct claims coexist in one map, keyed independently", () => {
  const map = buildClaimTierMap([
    { claim_text: "[a] one", sources: { name: "S1", url: null, base_tier: 1, tier_override: null } },
    { claim_text: "[b] two", sources: { name: "S2", url: null, base_tier: 6, tier_override: null } },
  ]);
  assert.equal(map["[a] one"].tier, 1);
  assert.equal(map["[b] two"].tier, 6);
});

test("fetchClaimTierMap: a Supabase error resolves to {} (soft-fail, never throws) — matches every other item-scoped read's soft-fail posture", async () => {
  const supabaseStub = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        then(resolve) {
          resolve({ data: null, error: { message: "boom" } });
        },
      };
    },
  };
  const map = await fetchClaimTierMap(supabaseStub, "item-uuid");
  assert.deepEqual(map, {});
});

test("fetchClaimTierMap: a thrown query (network failure) resolves to {} rather than propagating", async () => {
  const supabaseStub = {
    from() {
      throw new Error("network down");
    },
  };
  const map = await fetchClaimTierMap(supabaseStub, "item-uuid");
  assert.deepEqual(map, {});
});

test("fetchClaimTierMap: a successful query builds the map from the joined rows", async () => {
  const supabaseStub = {
    from(table) {
      assert.equal(table, "section_claim_provenance");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        then(resolve) {
          resolve({
            data: [{ claim_text: "[effective_date] ... «a»", sources: { name: "EUR-Lex", url: "https://x", base_tier: 2, tier_override: null } }],
            error: null,
          });
        },
      };
    },
  };
  const map = await fetchClaimTierMap(supabaseStub, "item-uuid");
  assert.equal(map["[effective_date] ... «a»"].tier, 2);
  assert.equal(map["[effective_date] ... «a»"].sourceName, "EUR-Lex");
});
