// Run: node --test scripts/maintenance/institution-canonicalize.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  main, CITE,
  GENERIC_HOSTING_DOMAINS, isGenericHostingDomain, normalizeName,
  planMerges, applyMergeSimulation, hostEndsWithDomain, planTierCanonicalization,
  STANDARDS_BODY_CLASS_TIER, planRulingNeeded,
} from "./institution-canonicalize.mjs";

// ── isGenericHostingDomain / normalizeName ──────────────────────────────────────────────────────────

test("isGenericHostingDomain: exact and subdomain matches against the closed list", () => {
  assert.equal(isGenericHostingDomain("amazonaws.com"), true);
  assert.equal(isGenericHostingDomain("s3.amazonaws.com"), true);
  assert.equal(isGenericHostingDomain("media.s3.amazonaws.com"), true); // subdomain of a listed entry
  assert.equal(isGenericHostingDomain("CloudFront.net"), true); // case-insensitive
  assert.equal(isGenericHostingDomain("smartfreightcentre.org"), false);
  assert.equal(isGenericHostingDomain("ifrs.org"), false);
  assert.equal(isGenericHostingDomain(""), false);
  assert.equal(isGenericHostingDomain(null), false);
});

test("GENERIC_HOSTING_DOMAINS names every domain the dispatch listed", () => {
  for (const d of [
    "amazonaws.com", "cloudfront.net", "blob.core.windows.net", "googleapis.com",
    "storage.googleapis.com", "azureedge.net", "cloudflare.net", "akamaihd.net",
    "digitaloceanspaces.com", "s3.amazonaws.com",
  ]) {
    assert.ok(GENERIC_HOSTING_DOMAINS.includes(d), `expected ${d} in GENERIC_HOSTING_DOMAINS`);
  }
});

test("normalizeName: case/whitespace-insensitive", () => {
  assert.equal(normalizeName("  Smart   Freight Centre "), "smart freight centre");
  assert.equal(normalizeName("Smart Freight Centre"), normalizeName(" smart freight centre "));
});

// ── Part A: planMerges ──────────────────────────────────────────────────────────────────────────────

const SFC_CANONICAL = { id: "canon-1", name: "Smart Freight Centre", registrable_domain: "smartfreightcentre.org" };
const SFC_DUPLICATE = { id: "dup-1", name: "Smart Freight Centre", registrable_domain: "amazonaws.com" };
const IFRS = { id: "ifrs-1", name: "IFRS / ISSB Sustainability Standards", registrable_domain: "ifrs.org" };

test("planMerges: merge found — generic domain + exactly one same-name real-domain institution", () => {
  const plan = planMerges([SFC_CANONICAL, SFC_DUPLICATE, IFRS]);
  assert.equal(plan.length, 1); // IFRS never appears — its own domain isn't generic
  assert.deepEqual(plan[0], {
    status: "merge",
    duplicate_id: "dup-1",
    duplicate_domain: "amazonaws.com",
    canonical_id: "canon-1",
    canonical_domain: "smartfreightcentre.org",
    name: "Smart Freight Centre",
  });
});

test("planMerges: name matches two canonicals — refused, neither chosen", () => {
  const secondCanonical = { id: "canon-2", name: "smart freight centre", registrable_domain: "sfc-alt.org" };
  const plan = planMerges([SFC_CANONICAL, secondCanonical, SFC_DUPLICATE]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].status, "refused_multiple_matches");
  assert.deepEqual(new Set(plan[0].candidate_ids), new Set(["canon-1", "canon-2"]));
});

test("planMerges: generic domain with no name match — skipped, nothing invented", () => {
  const lonelyDuplicate = { id: "dup-2", name: "Nobody Else Uses This Name", registrable_domain: "amazonaws.com" };
  const plan = planMerges([lonelyDuplicate, SFC_CANONICAL]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].status, "skipped_no_name_match");
  assert.equal(plan[0].duplicate_id, "dup-2");
});

test("planMerges: two generic-domain rows sharing a name never match each other (candidate must be non-generic)", () => {
  const dupOnCloudfront = { id: "dup-3", name: "Smart Freight Centre", registrable_domain: "cloudfront.net" };
  const plan = planMerges([SFC_DUPLICATE, dupOnCloudfront]); // no real-domain canonical present at all
  assert.equal(plan.length, 2);
  assert.ok(plan.every((p) => p.status === "skipped_no_name_match"));
});

test("planMerges: an institution with a real (non-generic) domain never appears in the plan", () => {
  const plan = planMerges([SFC_CANONICAL, IFRS]);
  assert.deepEqual(plan, []);
});

// ── applyMergeSimulation ────────────────────────────────────────────────────────────────────────────

test("applyMergeSimulation: remaps institution_id for merge entries only, pure (no input mutation)", () => {
  const sources = [
    { id: "s1", institution_id: "dup-1" },
    { id: "s2", institution_id: "canon-1" },
    { id: "s3", institution_id: "ifrs-1" },
  ];
  const plan = planMerges([SFC_CANONICAL, SFC_DUPLICATE]);
  const out = applyMergeSimulation(sources, plan);
  assert.equal(out.find((s) => s.id === "s1").institution_id, "canon-1");
  assert.equal(out.find((s) => s.id === "s2").institution_id, "canon-1");
  assert.equal(out.find((s) => s.id === "s3").institution_id, "ifrs-1");
  assert.equal(sources[0].institution_id, "dup-1"); // original untouched
});

// ── hostEndsWithDomain ──────────────────────────────────────────────────────────────────────────────

test("hostEndsWithDomain: exact host and subdomain both match; unrelated host does not", () => {
  assert.equal(hostEndsWithDomain("https://smartfreightcentre.org/glec", "smartfreightcentre.org"), true);
  assert.equal(hostEndsWithDomain("https://www.smartfreightcentre.org/glec", "smartfreightcentre.org"), true); // www stripped by hostOf
  assert.equal(hostEndsWithDomain("https://docs.smartfreightcentre.org/x", "smartfreightcentre.org"), true);
  assert.equal(hostEndsWithDomain("https://smart-freight-centre-media.s3.amazonaws.com/x.pdf", "smartfreightcentre.org"), false);
  assert.equal(hostEndsWithDomain("not a url", "smartfreightcentre.org"), false);
});

// ── Part B: planTierCanonicalization ────────────────────────────────────────────────────────────────

function instMap(...insts) {
  return new Map(insts.map((i) => [i.id, i]));
}

test("planTierCanonicalization: agreeing own-domain rows — the GLEC scenario end to end", () => {
  const sources = [
    { id: "own-1", url: "https://smartfreightcentre.org/glec-1", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "own-2", url: "https://smartfreightcentre.org/glec-2", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "own-3", url: "https://www.smartfreightcentre.org/glec-3", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "own-4", url: "https://smartfreightcentre.org/glec-4", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    // the mis-keyed S3 row, already remapped to canon-1 by applyMergeSimulation before this call
    { id: "s3-row", url: "https://smart-freight-centre-media.s3.amazonaws.com/GLEC_FRAMEWORK_v3.pdf", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "canon-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(SFC_CANONICAL));
  assert.equal(plans.length, 1);
  const p = plans[0];
  assert.equal(p.status, "canonicalize");
  assert.equal(p.institution_id, "canon-1");
  assert.equal(p.canonical_tier, 4);
  assert.equal(p.rows.length, 1);
  assert.deepEqual(p.rows[0], { source_id: "s3-row", old_base_tier: 5, new_base_tier: 4, also_effective_tier: true });
});

test("planTierCanonicalization: also_effective_tier is false when effective_tier already diverged from base_tier", () => {
  const sources = [
    { id: "own-1", url: "https://smartfreightcentre.org/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "off-1", url: "https://bucket.amazonaws.com/x.pdf", base_tier: 5, effective_tier: 3.2, tier_override: null, institution_id: "canon-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(SFC_CANONICAL));
  assert.equal(plans[0].rows[0].also_effective_tier, false); // effective_tier (3.2) != old base_tier (5) — leave it
});

test("planTierCanonicalization: own-domain disagreement — refused, no tier chosen", () => {
  const sources = [
    { id: "own-1", url: "https://ifrs.org/a", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "ifrs-1" },
    { id: "own-2", url: "https://ifrs.org/b", base_tier: 3, effective_tier: 3, tier_override: null, institution_id: "ifrs-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(IFRS));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].status, "tier_conflict_unresolved");
  assert.deepEqual(plans[0].own_domain_tier_counts, { 5: 1, 3: 1 });
});

test("planTierCanonicalization: no own-domain rows — reported, never guessed from a majority", () => {
  const sources = [
    { id: "off-1", url: "https://mirror-a.example.com/x", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "off-2", url: "https://mirror-b.example.com/x", base_tier: 6, effective_tier: 6, tier_override: null, institution_id: "canon-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(SFC_CANONICAL));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].status, "no_own_domain_rows");
  assert.deepEqual(new Set(plans[0].tiers_present), new Set([4, 6]));
});

test("planTierCanonicalization: institution with no registrable_domain on record also reports no_own_domain_rows", () => {
  const sources = [
    { id: "off-1", url: "https://x.example.com/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "unknown-1" },
    { id: "off-2", url: "https://y.example.com/b", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "unknown-1" },
  ];
  const plans = planTierCanonicalization(sources, new Map()); // institution not in the map at all
  assert.equal(plans[0].status, "no_own_domain_rows");
});

test("planTierCanonicalization: a single distinct tier across an institution's rows is already consistent — no plan entry", () => {
  const sources = [
    { id: "own-1", url: "https://ifrs.org/a", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "ifrs-1" },
    { id: "own-2", url: "https://ifrs.org/b", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "ifrs-1" },
  ];
  assert.deepEqual(planTierCanonicalization(sources, instMap(IFRS)), []); // Part C's territory, not Part B's
});

test("planTierCanonicalization: tier_override rows are ignored — never counted toward disagreement, never planned", () => {
  const sources = [
    { id: "own-1", url: "https://smartfreightcentre.org/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "own-2", url: "https://smartfreightcentre.org/b", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    // an operator-overridden row at a DIFFERENT base_tier — must not trip "more than one distinct tier"
    { id: "overridden", url: "https://smartfreightcentre.org/c", base_tier: 2, effective_tier: 2, tier_override: 2, institution_id: "canon-1" },
  ];
  assert.deepEqual(planTierCanonicalization(sources, instMap(SFC_CANONICAL)), []);
});

test("planTierCanonicalization: tier_override row is never included in rows-to-update even when the institution IS canonicalized", () => {
  const sources = [
    { id: "own-1", url: "https://smartfreightcentre.org/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "off-1", url: "https://bucket.amazonaws.com/x", base_tier: 6, effective_tier: 6, tier_override: null, institution_id: "canon-1" },
    { id: "overridden", url: "https://smartfreightcentre.org/c", base_tier: 1, effective_tier: 1, tier_override: 1, institution_id: "canon-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(SFC_CANONICAL));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].rows.length, 1);
  assert.equal(plans[0].rows[0].source_id, "off-1");
});

test("planTierCanonicalization: never plans a tier no row of the institution already carries", () => {
  const sources = [
    { id: "own-1", url: "https://smartfreightcentre.org/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "own-2", url: "https://smartfreightcentre.org/b", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1" },
    { id: "off-1", url: "https://bucket.amazonaws.com/x", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "canon-1" },
  ];
  const plans = planTierCanonicalization(sources, instMap(SFC_CANONICAL));
  const tiersInInstitution = new Set(sources.map((s) => s.base_tier));
  assert.ok(tiersInInstitution.has(plans[0].canonical_tier));
});

// ── Part C: planRulingNeeded ────────────────────────────────────────────────────────────────────────

test("planRulingNeeded: standards_body sources worse than T4, grouped by host, sorted by count", () => {
  const sources = [
    { id: "i1", url: "https://ifrs.org/a", base_tier: 5, status: "active", source_role: "standards_body" },
    { id: "i2", url: "https://ifrs.org/b", base_tier: 5, status: "provisional", source_role: "standards_body" },
    { id: "i3", url: "https://ifrs.org/c", base_tier: 6, status: "active", source_role: "standards_body" },
    { id: "c1", url: "https://cdp.net/a", base_tier: 5, status: "active", source_role: "standards_body" },
    // excluded: suspended status
    { id: "x1", url: "https://sciencebasedtargets.org/a", base_tier: 5, status: "suspended", source_role: "standards_body" },
    // excluded: not a standards_body
    { id: "x2", url: "https://iso.org/a", base_tier: 5, status: "active", source_role: "regulator" },
    // excluded: already at/above the T4 class floor
    { id: "x3", url: "https://globalreporting.org/a", base_tier: 4, status: "active", source_role: "standards_body" },
    // deliberately-ruled DOWN from the T4 default — must never appear (base_tier <= 4 filter excludes them)
    { id: "x4", url: "https://ghgprotocol.org/a", base_tier: 3, status: "active", source_role: "standards_body" },
    { id: "x5", url: "https://efrag.org/a", base_tier: 2, status: "active", source_role: "standards_body" },
  ];
  const report = planRulingNeeded(sources);
  assert.equal(STANDARDS_BODY_CLASS_TIER, 4);
  assert.equal(report.length, 2);
  assert.equal(report[0].host, "ifrs.org");
  assert.equal(report[0].count, 3);
  assert.deepEqual(report[0].tiers, { 5: 2, 6: 1 });
  assert.equal(report[1].host, "cdp.net");
  assert.equal(report[1].count, 1);
  assert.ok(report.every((r) => typeof r.class_table_line === "string" && r.class_table_line.length > 0));
  assert.ok(!report.some((r) => ["ghgprotocol.org", "efrag.org", "iso.org", "sciencebasedtargets.org", "globalreporting.org"].includes(r.host)));
});

test("planRulingNeeded: empty when nothing qualifies", () => {
  assert.deepEqual(planRulingNeeded([]), []);
});

// ── main() orchestration ────────────────────────────────────────────────────────────────────────────

function deps(overrides = {}) {
  const calls = [];
  let institutionsReadCount = 0;
  return {
    calls,
    // First read = the planning pass (always the full fixture, dup-1 included). A second read only
    // happens post-apply for read_back — if this run actually deleted dup-1, reflect that there.
    readInstitutions: async () => {
      institutionsReadCount += 1;
      if (institutionsReadCount > 1 && calls.some((c) => c[0] === "deleteInstitution" && c[1] === "dup-1")) {
        return [SFC_CANONICAL, IFRS];
      }
      return [SFC_CANONICAL, SFC_DUPLICATE, IFRS];
    },
    readSources: async () => [
      { id: "own-1", url: "https://smartfreightcentre.org/a", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1", status: "active", source_role: "standards_body" },
      { id: "own-2", url: "https://smartfreightcentre.org/b", base_tier: 4, effective_tier: 4, tier_override: null, institution_id: "canon-1", status: "active", source_role: "standards_body" },
      { id: "s3-row", url: "https://smart-freight-centre-media.s3.amazonaws.com/GLEC.pdf", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "dup-1", status: "active", source_role: "standards_body" },
      { id: "ifrs-1", url: "https://ifrs.org/x", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "ifrs-1", status: "active", source_role: "standards_body" },
    ],
    readSourcesByIds: async (ids) => { calls.push(["readSourcesByIds", ids]); return ids.map((id) => ({ id, base_tier: 4, effective_tier: 4 })); },
    reassignSourcesInstitution: async (dup, canon) => { calls.push(["reassignSourcesInstitution", dup, canon]); return { updated: 1 }; },
    countSourcesForInstitution: async (id) => { calls.push(["countSourcesForInstitution", id]); return 0; },
    deleteInstitution: async (id) => { calls.push(["deleteInstitution", id]); },
    guardedUpdateSourcesByIds: async (ids, patch, opts) => { calls.push(["guardedUpdateSourcesByIds", ids, patch]); assert.equal(typeof opts.applyMatch, "function"); return { updated: ids.length }; },
    ...overrides,
  };
}

test("dry: plans everything (merge + tier + ruling_needed), writes nothing", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "institution-canonicalize");
  assert.equal(r.applied, 0);
  assert.deepEqual(d.calls, []);
  assert.equal(r.counts.part_a_merge.merge, 1);
  assert.equal(r.counts.part_b_tier.canonicalize, 1); // the S3 row, evaluated post-merge under canon-1
  assert.equal(r.counts.part_b_tier.plan[0].canonical_tier, 4);
  assert.ok(r.counts.part_c_ruling_needed.some((x) => x.host === "ifrs.org"));
  assert.equal(r.exitCode, 0);
});

test("apply: merges the duplicate, deletes it, canonicalizes the tier, read_back populated", async () => {
  const d = deps();
  const r = await main({ mode: "apply" }, d);
  assert.equal(d.calls.some((c) => c[0] === "reassignSourcesInstitution" && c[1] === "dup-1" && c[2] === "canon-1"), true);
  assert.equal(d.calls.some((c) => c[0] === "deleteInstitution" && c[1] === "dup-1"), true);
  assert.equal(d.calls.some((c) => c[0] === "guardedUpdateSourcesByIds"), true);
  assert.equal(r.applied, 2); // 1 source moved (Part A) + 1 tier row updated (Part B)
  assert.equal(r.read_back.institutions_total, 2); // dup-1 deleted post-merge
  assert.deepEqual(r.read_back.merged_duplicate_ids_still_present, []);
  assert.equal(r.read_back.tier_rows_after.length, 1);
  assert.equal(r.counts.part_c_ruling_needed.length > 0, true); // report present even in apply mode
});

test("apply: a still-referenced duplicate after repoint is refused, never deleted", async () => {
  const d = deps({ countSourcesForInstitution: async () => 1 });
  const r = await main({ mode: "apply" }, d);
  assert.equal(d.calls.some((c) => c[0] === "deleteInstitution"), false);
  const mergeApplied = r.counts.part_a_merge.applied.find((m) => m.duplicate_id === "dup-1");
  assert.equal(mergeApplied.deleted, false);
  assert.match(mergeApplied.refused_reason, /still reference/);
});

test("CITE carries a governing skill and a reason (db.mjs's requireCite gate)", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.match(CITE.reason, /institution/i);
});
