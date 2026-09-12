// Run: node --test scripts/maintenance/resolve-cited-host-gate.test.mjs -- no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCitedUrls, planHostDecision, buildNullTierHostWrite, buildResolutionNote,
  planFlag, main, CITE, RESOLVED_BY, NULL_TIER_CREATED_BY,
} from "./resolve-cited-host-gate.mjs";
import { trimUrlPunctuation } from "./lib/flag-url-extract.mjs";
import { classTierForHost, permanentlyUnregisteredClass } from "../../src/lib/sources/host-authority.ts";

// ── trimUrlPunctuation ───────────────────────────────────────────────────────────────────────────────

test("trimUrlPunctuation: strips trailing sentence punctuation", () => {
  assert.equal(trimUrlPunctuation("https://example.org/page,"), "https://example.org/page");
  assert.equal(trimUrlPunctuation("https://example.org/page."), "https://example.org/page");
  assert.equal(trimUrlPunctuation("https://example.org/page:"), "https://example.org/page");
});

test("trimUrlPunctuation: strips an unbalanced trailing ')' left by the '(cited in ...)' wrapping", () => {
  assert.equal(trimUrlPunctuation("https://example.org/page)"), "https://example.org/page");
});

test("trimUrlPunctuation: keeps a balanced parenthetical inside the URL itself", () => {
  assert.equal(trimUrlPunctuation("https://en.wikipedia.org/wiki/Foo_(bar)"), "https://en.wikipedia.org/wiki/Foo_(bar)");
});

// ── extractCitedUrls ─────────────────────────────────────────────────────────────────────────────────

test("extractCitedUrls: reads from recommended_actions[].rationale first", () => {
  const flag = {
    description: "2 cited URL(s) on hosts unknown ...",
    recommended_actions: [
      { action: "register_source", rationale: "https://example.org/a (cited in section prose): verify the source is real" },
      { action: "register_source", rationale: "https://example.net/b (cited in new-sources table): verify the source is real" },
    ],
  };
  assert.deepEqual(extractCitedUrls(flag), ["https://example.org/a", "https://example.net/b"]);
});

test("extractCitedUrls: falls back to description when recommended_actions is empty", () => {
  const flag = {
    description: "1 cited URL(s) on hosts unknown to the item's fetched pool and the source registry -- NOT stubbed for criterion-2 (self-grounding gate): https://example.org/z",
    recommended_actions: [],
  };
  assert.deepEqual(extractCitedUrls(flag), ["https://example.org/z"]);
});

test("extractCitedUrls: deduplicates and preserves order", () => {
  const flag = {
    recommended_actions: [
      { rationale: "https://a.example/1 (cited in x): ..." },
      { rationale: "https://a.example/1 (cited in y): ..." },
      { rationale: "https://b.example/2 (cited in z): ..." },
    ],
  };
  assert.deepEqual(extractCitedUrls(flag), ["https://a.example/1", "https://b.example/2"]);
});

test("extractCitedUrls: empty/malformed flag returns []", () => {
  assert.deepEqual(extractCitedUrls({}), []);
  assert.deepEqual(extractCitedUrls({ recommended_actions: null, description: null }), []);
});

// ── planHostDecision ─────────────────────────────────────────────────────────────────────────────────

test("planHostDecision: a legal-primary host registers at tier 1 via the real classTierForHost", () => {
  const d = planHostDecision("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242", classTierForHost);
  assert.equal(d.host, "eur-lex.europa.eu");
  assert.equal(d.tier, 1);
  assert.equal(d.action, "register");
});

test("planHostDecision: an unrecognized host routes to the worklist (never a guessed tier)", () => {
  const d = planHostDecision("https://some-random-blog-nobody-classified.example/post", classTierForHost);
  assert.equal(d.tier, null);
  assert.equal(d.action, "worklist");
});

test("planHostDecision: injected classTierForHostFn is honored (unit-testable without the real class table)", () => {
  const fakeTier = () => 4;
  const d = planHostDecision("https://anything.example/x", fakeTier);
  assert.equal(d.tier, 4);
  assert.equal(d.action, "register");
});

// ── buildNullTierHostWrite ───────────────────────────────────────────────────────────────────────────

test("buildNullTierHostWrite: no existing flag -> insert, with a fresh aggregate", () => {
  const w = buildNullTierHostWrite(null, "unknown-host.example", "item-1", "https://unknown-host.example/page", null);
  assert.equal(w.op, "insert");
  assert.equal(w.row.created_by, NULL_TIER_CREATED_BY);
  assert.equal(w.row.subject_ref, "unknown-host.example");
  assert.equal(w.row.status, "open");
  assert.deepEqual(w.row.recommended_actions[0].aggregate.perItemFacts, { "item-1": 1 });
});

test("buildNullTierHostWrite: existing flag -> update, merging the aggregate (idempotent per item)", () => {
  const existing = {
    id: "flag-9",
    recommended_actions: [{ aggregate: { perItemFacts: { "item-0": 3 }, sampleSpans: ["https://unknown-host.example/other"] } }],
  };
  const w = buildNullTierHostWrite(existing, "unknown-host.example", "item-1", "https://unknown-host.example/page", null);
  assert.equal(w.op, "update");
  assert.equal(w.id, "flag-9");
  assert.deepEqual(w.patch.recommended_actions[0].aggregate.perItemFacts, { "item-0": 3, "item-1": 1 });
});

test("buildNullTierHostWrite: a ruled aggregator/platform host gets the re-attribution wording, never register_source", () => {
  const w = buildNullTierHostWrite(null, "policycommons.net", "item-1", "https://policycommons.net/x", "aggregator");
  assert.equal(w.row.recommended_actions[0].action, "reattribute_to_publisher");
});

// ── buildResolutionNote ──────────────────────────────────────────────────────────────────────────────

test("buildResolutionNote: composes a readable summary across mixed outcomes", () => {
  const note = buildResolutionNote([
    { host: "eur-lex.europa.eu", action: "register", tier: 1 },
    { host: "unknown.example", action: "worklist", permanentClass: null },
  ]);
  assert.match(note, /eur-lex\.europa\.eu -> registered at tier 1/);
  assert.match(note, /unknown\.example -> routed to null-tier-host worklist/);
});

test("buildResolutionNote: empty outcomes names the no-URL case", () => {
  assert.match(buildResolutionNote([]), /no URL could be extracted/);
});

// ── planFlag ─────────────────────────────────────────────────────────────────────────────────────────

test("planFlag: end-to-end pure plan over one flag with a mixed host set", () => {
  const flag = {
    id: "flag-1",
    subject_ref: "item-42",
    recommended_actions: [
      { rationale: "https://eur-lex.europa.eu/x (cited in prose): verify" },
      { rationale: "https://totally-unclassified.example/y (cited in prose): verify" },
    ],
  };
  const plan = planFlag(flag, classTierForHost);
  assert.equal(plan.flagId, "flag-1");
  assert.equal(plan.itemId, "item-42");
  assert.equal(plan.urls.length, 2);
  assert.equal(plan.decisions[0].action, "register");
  assert.equal(plan.decisions[1].action, "worklist");
});

// ── main() orchestration, fake deps ─────────────────────────────────────────────────────────────────

function fakeDeps({ flags, nullTierFlags = {} } = {}) {
  const calls = [];
  const registered = [];
  const nullTierWrites = [];
  const resolved = [];
  return {
    calls, registered, nullTierWrites, resolved,
    classTierForHost,
    readOpenFlags: async () => flags,
    registerHost: async (url, tier) => {
      calls.push(["registerHost", url, tier]);
      registered.push({ url, tier });
      return { source_id: `src-${registered.length}`, created: true, host: new URL(url).host };
    },
    readNullTierFlag: async (host) => {
      calls.push(["readNullTierFlag", host]);
      return nullTierFlags[host] ?? null;
    },
    insertNullTierFlag: async (row) => {
      calls.push(["insertNullTierFlag", row.subject_ref]);
      nullTierWrites.push({ op: "insert", row });
    },
    updateNullTierFlag: async (id, patch) => {
      calls.push(["updateNullTierFlag", id]);
      nullTierWrites.push({ op: "update", id, patch });
    },
    resolveFlag: async (id, note) => {
      calls.push(["resolveFlag", id]);
      resolved.push({ id, note });
      return { updated: 1, snapshot: "snap" };
    },
  };
}

const FLAG_A = {
  id: "flag-a", subject_ref: "item-1",
  recommended_actions: [{ rationale: "https://eur-lex.europa.eu/a (cited in prose): verify" }],
};
const FLAG_B = {
  id: "flag-b", subject_ref: "item-2",
  recommended_actions: [{ rationale: "https://unclassified-host.example/b (cited in prose): verify" }],
};
const FLAG_NO_URL = { id: "flag-c", subject_ref: "item-3", description: "no url here at all", recommended_actions: [] };

test("main: dry mode plans register + worklist outcomes and writes nothing", async () => {
  const deps = fakeDeps({ flags: [FLAG_A, FLAG_B, FLAG_NO_URL] });
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.mode, "dry");
  assert.equal(r.counts.open_flags, 3);
  assert.equal(r.counts.would_register_or_registered, 1);
  assert.equal(r.counts.would_worklist_or_worklisted, 1);
  assert.equal(r.counts.flags_with_no_extractable_url, 1);
  assert.equal(deps.calls.length, 0, "dry mode must never write");
});

test("main: apply mode registers the classifiable host and resolves its flag", async () => {
  const deps = fakeDeps({ flags: [FLAG_A] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(deps.registered.length, 1);
  assert.equal(deps.registered[0].tier, 1);
  assert.equal(deps.resolved.length, 1);
  assert.equal(deps.resolved[0].id, "flag-a");
  assert.match(deps.resolved[0].note, /registered at tier 1/);
});

test("main: apply mode routes an unclassifiable host to the null-tier-host worklist (insert, no prior flag)", async () => {
  const deps = fakeDeps({ flags: [FLAG_B] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(deps.registered.length, 0);
  assert.equal(deps.nullTierWrites.length, 1);
  assert.equal(deps.nullTierWrites[0].op, "insert");
  assert.equal(deps.nullTierWrites[0].row.subject_ref, "unclassified-host.example");
  assert.match(deps.resolved[0].note, /routed to null-tier-host worklist/);
});

test("main: apply mode UPDATES an existing null-tier-host flag rather than inserting a duplicate", async () => {
  const deps = fakeDeps({
    flags: [FLAG_B],
    nullTierFlags: {
      "unclassified-host.example": {
        id: "existing-null-tier-flag",
        recommended_actions: [{ aggregate: { perItemFacts: { "item-0": 2 }, sampleSpans: [] } }],
      },
    },
  });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(deps.nullTierWrites.length, 1);
  assert.equal(deps.nullTierWrites[0].op, "update");
  assert.equal(deps.nullTierWrites[0].id, "existing-null-tier-flag");
});

test("main: apply mode with no extractable URL neither writes nor resolves that flag", async () => {
  const deps = fakeDeps({ flags: [FLAG_NO_URL] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 0);
  assert.equal(deps.resolved.length, 0);
});

test("constants: resolved_by / null-tier created_by / cite are present", () => {
  assert.equal(RESOLVED_BY, "resolve-cited-host-gate");
  assert.equal(NULL_TIER_CREATED_BY, "null-tier-host");
  assert.ok(CITE.skill && CITE.reason);
});

test("permanentlyUnregisteredClass sanity (imported for this test file's own fixture, not the module under test)", () => {
  assert.equal(permanentlyUnregisteredClass("law.justia.com"), "aggregator");
  assert.equal(permanentlyUnregisteredClass("citizenspace.com"), "platform");
});
