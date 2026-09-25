// ID-REDIRECT proof (lane REG-REDIRECT, 2026-09-24).
//
// Discovered by run-test-suite.sh (every tracked *.test.mjs under fsi-app/), so it is execution-wired.
//
// THE DEFECT THIS LOCKS OUT [CONFIRMED by the coordinator, Playwright, 2026-09-24]:
// /regulations/d2da85da-0912-497a-b645-31e4ca73cd18 307-redirected to
// /regulations/uae-national-net-zero-by-2050-transport-sector-roadmap, which rendered "This page doesn't
// exist". The row is provenance_status='quarantined'. All four `[slug]` pages read `legacy_id` with the
// service role and redirected on its mere presence; loadDetail then admitted only a verified item on its
// canonical surface, so the slug URL 404'd. A link to the uuid became a link to a dead page.
//
// WHAT IS PROVEN HERE:
//   1. decideIdRedirect / resolveIdRedirect, per case (a)-(d) of the lane brief plus the edges.
//   2. findIdRedirectViolations (the pure core of scripts/verify/id-redirect-target-audit.mjs), proven BY
//      ATTACK (standing rule 15): fed the pre-fix decision rule it must report the quarantined case, fed the
//      shipped rule it must report nothing.
//   3. The four `[slug]` pages are wired to the one resolver and carry no hand-rolled legacy_id redirect
//      (fails on master, where all four still hand-roll it).
//   4. The admission predicate this module mirrors is still the one loadDetail applies (drift guard).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isItemUuid,
  admittedSurfaceFor,
  decideIdRedirect,
  resolveIdRedirect,
  findIdRedirectViolations,
} from "./id-redirect.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "..");

// The live row from the finding (SELECT 2026-09-24): quarantined, regulation, domain 1, not archived.
const QUARANTINED_REG = {
  id: "d2da85da-0912-497a-b645-31e4ca73cd18",
  legacy_id: "uae-national-net-zero-by-2050-transport-sector-roadmap",
  item_type: "regulation",
  domain: 1,
  provenance_status: "quarantined",
};
const UNVERIFIED_MARKET = {
  id: "0f0f0f0f-0000-4000-8000-000000000001",
  legacy_id: "unverified-saf-offtake",
  item_type: "market_signal",
  domain: 2,
  provenance_status: "unverified",
};
const VERIFIED_REG = {
  id: "11111111-1111-4111-8111-111111111111",
  legacy_id: "eu-ets-maritime",
  item_type: "regulation",
  domain: 1,
  provenance_status: "verified",
};
const VERIFIED_MARKET = {
  id: "22222222-2222-4222-8222-222222222222",
  legacy_id: "saf-spot-price-q3",
  item_type: "market_signal",
  domain: 2,
  provenance_status: "verified",
};
const VERIFIED_REG_NO_SLUG = {
  id: "33333333-3333-4333-8333-333333333333",
  legacy_id: null,
  item_type: "regulation",
  domain: 1,
  provenance_status: "verified",
};
const VERIFIED_RESEARCH_NO_SLUG = {
  id: "44444444-4444-4444-8444-444444444444",
  legacy_id: null,
  item_type: "research_finding",
  domain: 7,
  provenance_status: "verified",
};

const lookupFrom = (rows) => async (uuid) => rows.find((r) => r.id === uuid) ?? null;

// ── 1. The decision, case by case ────────────────────────────────────────────────────────────────────

test("(a) quarantined item: no redirect, not-found at the uuid URL (the live finding)", async () => {
  const d = await resolveIdRedirect("regulations", QUARANTINED_REG.id, lookupFrom([QUARANTINED_REG]));
  assert.deepEqual(d, { kind: "not-found" });
  // Not admissible on ANY surface, so no surface may bounce it into a slug either.
  for (const s of ["regulations", "market", "operations", "research"]) {
    assert.deepEqual(decideIdRedirect(s, QUARANTINED_REG), { kind: "not-found" }, s);
  }
  assert.deepEqual(decideIdRedirect("market", UNVERIFIED_MARKET), { kind: "not-found" });
});

test("(b) verified item on its own surface: redirect to the slug", async () => {
  const d = await resolveIdRedirect("regulations", VERIFIED_REG.id, lookupFrom([VERIFIED_REG]));
  assert.deepEqual(d, { kind: "redirect", to: "/regulations/eu-ets-maritime" });
});

test("(c) verified item that belongs to another surface: redirect to THAT surface's slug", async () => {
  const d = await resolveIdRedirect("regulations", VERIFIED_MARKET.id, lookupFrom([VERIFIED_MARKET]));
  assert.deepEqual(d, { kind: "redirect", to: "/market/saf-spot-price-q3" });
  // ...and to that surface's uuid URL when the item has no slug.
  assert.deepEqual(decideIdRedirect("operations", VERIFIED_RESEARCH_NO_SLUG), {
    kind: "redirect",
    to: `/research/${VERIFIED_RESEARCH_NO_SLUG.id}`,
  });
});

test("(d) no legacy_id on the right surface: render by uuid (never a self-redirect)", async () => {
  const d = await resolveIdRedirect("regulations", VERIFIED_REG_NO_SLUG.id, lookupFrom([VERIFIED_REG_NO_SLUG]));
  assert.deepEqual(d, { kind: "render" });
});

test("a non-uuid URL is a slug already: render, and the lookup is never called", async () => {
  let called = 0;
  const d = await resolveIdRedirect("regulations", "eu-ets-maritime", async () => {
    called++;
    return VERIFIED_REG;
  });
  assert.deepEqual(d, { kind: "render" });
  assert.equal(called, 0);
});

test("a lookup failure or a missing row soft-fails to render (loadDetail keeps the final say)", async () => {
  const boom = async () => {
    throw new Error("service client unavailable");
  };
  assert.deepEqual(await resolveIdRedirect("market", VERIFIED_MARKET.id, boom), { kind: "render" });
  assert.deepEqual(await resolveIdRedirect("market", VERIFIED_MARKET.id, lookupFrom([])), { kind: "render" });
});

test("isItemUuid / admittedSurfaceFor", () => {
  assert.equal(isItemUuid(QUARANTINED_REG.id), true);
  assert.equal(isItemUuid(QUARANTINED_REG.id.toUpperCase()), true);
  assert.equal(isItemUuid(QUARANTINED_REG.legacy_id), false);
  assert.equal(admittedSurfaceFor(QUARANTINED_REG), null);
  assert.equal(admittedSurfaceFor(VERIFIED_MARKET), "market");
  assert.equal(admittedSurfaceFor(VERIFIED_RESEARCH_NO_SLUG), "research");
});

// ── 2. The emit check's pure core, proven by attack ─────────────────────────────────────────────────

const CORPUS = [
  QUARANTINED_REG,
  UNVERIFIED_MARKET,
  VERIFIED_REG,
  VERIFIED_MARKET,
  VERIFIED_REG_NO_SLUG,
  VERIFIED_RESEARCH_NO_SLUG,
];

/** The decision rule every `[slug]` page carried before this lane: redirect to the same surface's slug
 *  whenever a legacy_id exists, admissible or not; otherwise render. Kept HERE only, as the attack input. */
const preFixDecide = (surface, row) =>
  row && row.legacy_id
    ? { kind: "redirect", to: `/${surface}/${encodeURIComponent(row.legacy_id)}` }
    : { kind: "render" };

test("check ATTACK: the pre-fix rule is caught, including the live quarantined redirect", () => {
  const v = findIdRedirectViolations(CORPUS, { decide: preFixDecide });
  const froms = v.map((x) => x.from);
  assert.ok(
    froms.includes(`/regulations/${QUARANTINED_REG.id}`),
    "the exact 2026-09-24 finding must be reported"
  );
  const quarantined = v.find((x) => x.from === `/regulations/${QUARANTINED_REG.id}`);
  assert.equal(quarantined.to, `/regulations/${QUARANTINED_REG.legacy_id}`);
  assert.match(quarantined.reason, /no verified row/);
  // A verified item requested on the wrong surface is also a dead redirect under the old rule.
  assert.ok(
    v.some((x) => x.from === `/regulations/${VERIFIED_MARKET.id}` && /surface/.test(x.reason)),
    "wrong-surface slug redirect must be reported"
  );
  // A render at the uuid URL of an item that belongs elsewhere lands on a 404 too.
  assert.ok(v.some((x) => x.from === `/regulations/${VERIFIED_RESEARCH_NO_SLUG.id}`));
});

test("check ATTACK: a resolver that 404s an admissible item is caught (no over-refusal)", () => {
  const refuseAll = () => ({ kind: "not-found" });
  const v = findIdRedirectViolations(CORPUS, { decide: refuseAll });
  assert.ok(v.some((x) => x.from === `/market/${VERIFIED_MARKET.id}` && /admissible/.test(x.reason)));
  // The genuinely inadmissible rows are NOT violations under refusal.
  assert.ok(!v.some((x) => x.from.endsWith(QUARANTINED_REG.id)));
});

test("check GREEN: the shipped resolver produces zero violations over the fixture corpus", () => {
  assert.deepEqual(findIdRedirectViolations(CORPUS), []);
});

// ── 3. Wiring: all four routes go through the one resolver ───────────────────────────────────────────

for (const surface of ["regulations", "market", "operations", "research"]) {
  test(`/${surface}/[slug] is wired to applyIdRedirect and hand-rolls no legacy_id redirect`, () => {
    const page = readFileSync(resolve(SRC, "app", surface, "[slug]", "page.tsx"), "utf8");
    // Boolean asserts (not assert.match) so a failure names the rule instead of dumping the whole page.
    const wired = new RegExp(`await applyIdRedirect\\("${surface}", id\\)`).test(page);
    assert.ok(wired, `${surface}/[slug]/page.tsx must await applyIdRedirect("${surface}", id)`);
    assert.ok(!/\.select\("legacy_id"\)/.test(page), `${surface}: hand-rolled uuid->slug lookup must be gone`);
    assert.ok(!/redirectTo/.test(page), `${surface}: hand-rolled redirect target must be gone`);
  });
}

// ── 4. Drift guard: the predicate mirrored here is still loadDetail's ──────────────────────────────────

test("admission predicate still matches fetchIntelligenceItem + loadDetailCore", () => {
  const server = readFileSync(resolve(SRC, "lib", "supabase-server.ts"), "utf8");
  const start = server.indexOf("async function fetchIntelligenceItemUncached(");
  const end = server.indexOf("export async function fetchIntelligenceItem(", start);
  assert.ok(start > 0 && end > start, "fetchIntelligenceItemUncached must exist");
  const body = server.slice(start, end);
  assert.match(body, /\.eq\("provenance_status", "verified"\)/, "verified gate");
  assert.match(body, /canonicalSurfaceForItem\(/, "surface classifier");
  const core = readFileSync(resolve(SRC, "lib", "detail", "load-detail-core.ts"), "utf8");
  assert.match(core, /detail\.canonicalSurface !== config\.surface/, "loadDetailCore surface admission");
});
