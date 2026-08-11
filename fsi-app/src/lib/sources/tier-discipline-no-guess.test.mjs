// PROOF (Phase R, F4 + F18 — moat-crack close). No LIVE path may stamp a moat-conferring `base_tier`
// from a MODEL GUESS. base_tier is the value institution.ts `tierOfSource` reads (base_tier ?? null), so a
// guessed base_tier is fake certification (SC-13). Two live paths minted it from a guess and now must not:
//   - verification.ts `executeAction` H-path (was ai_trust_tier -> numericTier; LIVE via bulk-import)
//   - canonical-sources/bulk-approve route new-source insert (was base_tier: rec.tier, the cached Haiku guess)
// Both now route base_tier through the DETERMINISTIC classTierForHost; an AMBIGUOUS host (null) worklists.
//
// Runs in the no-npm discipline node --test glob (src/lib/sources/*.test.mjs). Imports node builtins + a
// relative .ts only (Node 24 type-stripping); reads the two route/source files as fixtures via node:fs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classTierForHost, permanentlyUnregisteredClass } from "./host-authority.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, rel), "utf8");
// Strip line + block comments so a NEGATIVE source-scan cannot false-trip on prose that merely NAMES the
// retired pattern (the new fix comments describe the old ai_trust_tier / rec.tier stamps).
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const VERIFICATION = stripComments(read("./verification.ts"));
const BULK_APPROVE = stripComments(read("../../app/api/admin/canonical-sources/bulk-approve/route.ts"));

// ── 1. BEHAVIORAL: the worklist-on-ambiguous property is what guarantees "never a guessed stamp" ──────────
test("classTierForHost: a Haiku-favored AMBIGUOUS host returns null (worklist), never a guessed tier", () => {
  // Hosts a model could plausibly score T1/T2/T3 but that carry NO codified/class-table rule -> null.
  // `searoutes.com` was listed here until 2026-08-11, when the batched ruling RULED it T7 (vendor) and
  // recorded that ruling in RULED_HOST_TIER. That is not a weakening of this property: the guarantee is
  // "no host is assigned a tier the code cannot justify", and a recorded ruling is a justification where a
  // model score is not. Below-listed hosts are unruled AND match no class rule, which is the real invariant.
  for (const h of ["globalpetrolprices.com", "some-random-consultancy.com", "trade-portal.example",
    "widgets-r-us.co", "another-unknown-portal.net"]) {
    assert.equal(classTierForHost(h), null, `${h} must worklist (null), not a guessed tier`);
  }
});

test("classTierForHost: a RULED host returns its ruled tier, and the ruled map is CLOSED", () => {
  // The 2026-08-11 batched ruling, recorded per host because no derivable rule covers these.
  assert.equal(classTierForHost("searoutes.com"), 7, "ruled vendor");
  assert.equal(classTierForHost("nyk.com"), 7, "ruled carrier corporate site");
  assert.equal(classTierForHost("moefcc-gcp.in"), 2, "ruled ministry programme on a bare .in");
  // CLOSED: a NEIGHBOUR of a ruled host does not inherit the ruling. This is the property that keeps the
  // per-host map from silently becoming a fuzzy rule.
  for (const h of ["searoutes.io", "nyk.co.jp", "moefcc-gcp.org", "notnyk.com"]) {
    assert.equal(classTierForHost(h), null, `${h} must NOT inherit a neighbour's ruling`);
  }
});

// ── 1b. PERMANENT WORKLIST: never-register outranks every tier rule, including the authoritative ones ──────
test("permanentlyUnregisteredClass: aggregators and hosting platforms are ruled never-registerable", () => {
  for (const h of ["law.cornell.edu", "www.mondaq.com", "up.codes", "legalclarity.org", "npcobserver.com",
    "practiceguides.chambers.com", "law.justia.com"])
    assert.equal(permanentlyUnregisteredClass(h), "aggregator", h);
  assert.equal(permanentlyUnregisteredClass("energygovuk.citizenspace.com"), "platform");
  for (const h of ["eur-lex.europa.eu", "epa.gov", "searoutes.com", "", null, undefined])
    assert.equal(permanentlyUnregisteredClass(h), null, String(h));
});

test("classTierForHost: every ruled never-register host worklists, whatever tier rule it would otherwise hit", () => {
  // law.cornell.edu is a .edu and would hit the T4 academic rule; the rest hit nothing. All must worklist.
  for (const h of ["law.cornell.edu", "mondaq.com", "up.codes", "legalclarity.org", "npcobserver.com",
    "practiceguides.chambers.com", "energygovuk.citizenspace.com"])
    assert.equal(classTierForHost(h), null, `${h} is ruled never-registerable`);
});

test("classTierForHost STRUCTURE: the never-register check runs BEFORE the codified legal/gov rule", () => {
  // No host in today's ruling is BOTH a republisher and on an authoritative TLD, so this ordering has no
  // behavioural witness yet — and an ordering with no witness is exactly the kind that gets refactored away.
  // Pin it structurally instead: a republisher must not acquire the publisher's authority by sitting on a
  // .gov/.eu tomorrow. (Ordering changed 2026-08-11; before that, codified ran first.)
  const src = stripComments(read("./host-authority.ts"));
  const body = src.slice(src.indexOf("export function classTierForHost"));
  const permIdx = body.indexOf("permanentlyUnregisteredClass(");
  const codIdx = body.indexOf("codifiedTierForHost(");
  assert.ok(permIdx > -1 && codIdx > -1, "classTierForHost must consult both checks");
  assert.ok(permIdx < codIdx,
    "permanentlyUnregisteredClass must be checked BEFORE codifiedTierForHost inside classTierForHost");
});

test("classTierForHost: a codified host returns its DETERMINISTIC tier (the auto-approve path)", () => {
  assert.equal(classTierForHost("eur-lex.europa.eu"), 1);
  assert.equal(classTierForHost("epa.gov"), 2);
});

// ── 2. SOURCE-SCAN: neither live path assigns base_tier from a model guess; both use the deterministic tier ─
test("verification.ts executeAction: base_tier is deterministic, never the ai_trust_tier guess", () => {
  // NEGATIVE: the retired guess-to-base_tier stamp is gone.
  assert.ok(!/base_tier:\s*numericTier/.test(VERIFICATION), "verification.ts must not stamp base_tier from the ai_trust_tier-derived numericTier");
  // POSITIVE: it resolves the tier deterministically and stamps THAT.
  assert.ok(/classTierForHost\s*\(/.test(VERIFICATION), "verification.ts must call classTierForHost");
  assert.ok(/base_tier:\s*detTier/.test(VERIFICATION), "verification.ts must stamp base_tier from the deterministic tier");
});

test("bulk-approve: base_tier is deterministic, never the cached rec.tier guess", () => {
  // NEGATIVE: the retired cached-Haiku stamp is gone.
  assert.ok(!/base_tier:\s*rec\.tier/.test(BULK_APPROVE), "bulk-approve must not stamp base_tier from the cached rec.tier guess");
  assert.ok(!/tier_at_creation:\s*rec\.tier/.test(BULK_APPROVE), "bulk-approve must not stamp tier_at_creation from rec.tier");
  // POSITIVE: deterministic tier + the ported F18 gates.
  assert.ok(/classTierForHost\s*\(/.test(BULK_APPROVE), "bulk-approve must call classTierForHost");
  assert.ok(/base_tier:\s*detTier/.test(BULK_APPROVE), "bulk-approve must stamp base_tier from the deterministic tier");
  assert.ok(/checkVerticalFitGate\s*\(/.test(BULK_APPROVE), "bulk-approve must run the vertical-fit gate (F18)");
  assert.ok(/classifySourceRole\s*\(/.test(BULK_APPROVE), "bulk-approve must write source_role (F18)");
  assert.ok(/intelligence_types:\s*\[\]\s*as\s*string\[\]/.test(BULK_APPROVE), "bulk-approve must derive intelligence_types, not hardcode ['GUIDE'] (F18)");
});

test("bulk-approve: the frozen 2026-04-28 approval date is gone (F18)", () => {
  assert.ok(!/2026-04-28/.test(BULK_APPROVE), "bulk-approve must use the live approval date, not the frozen 2026-04-28 literal");
});
