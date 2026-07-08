/** VERIFIER (read-only reads + flag-writes only): SURFACE-VISIBILITY INVARIANT over live data.
 *  GOVERNING SKILLS: caros-ledge-platform-intent (five-surface routing) + remediation-discipline
 *  (class-over-instance — the standing net for the "verified item hidden from its surface" class the
 *  PPWR incident surfaced, 2026-07-08).
 *
 *  WHAT HIDES AN ITEM (the two mechanisms):
 *   1. WORKSPACE DISMISSAL (workspace_item_overrides.dismissed_at) — user-reversible again via the
 *      re-mounted DismissedStash drawer (PR #260). NOT an invariant violation; not flagged here.
 *   2. DOMAIN / SURFACE routing — every customer surface filters by the `domain` integer, and a
 *      surface spans a SET of domains: Regulations{1}, Market Intel{2,4}, Operations{3,6}, Research{7}
 *      (domain 5 / null = NO surface). A verified, live item is:
 *        - HIDDEN (no_surface)   when its domain is null or 5 — invisible everywhere;
 *        - MISROUTED (cross_surface) when its domain's SURFACE differs from the surface its item_type
 *          belongs to — it renders on the wrong page (a market_signal on Regulations, a reg on Research).
 *      NB: same-surface sub-domain drift (market_signal on domain 2 vs 4 — both Market Intel) is NOT a
 *      violation; membership is by SURFACE SET, not exact domain.
 *
 *  Only UNCONDITIONAL item types are checked for cross-surface (their surface is knowable from type
 *  alone). Conditional types (framework/tool/initiative) depend on source.category → checked only for
 *  the no_surface case. Many cross_surface hits are MIS-TYPED institutional/research items (IPCC/IEA
 *  typed 'regulation' but domain=7 Research) where the DOMAIN is right and the TYPE is wrong — the flag
 *  says so; the fix is item_type correction / reclassifyToSource, NOT blind domain-forcing.
 *
 *  Flags (idempotent, one open flag per item from this auditor):
 *    no_surface   -> category=data_integrity (truly invisible — the real hidden class)
 *    cross_surface-> category=data_quality    (visible on the wrong surface; usually a mis-type)
 *
 *  The mint chokepoint now canonicalizes domain for the unconditional types (canonicalDomainOverride),
 *  so this drives the LEGACY residue down and catches anything that bypasses the chokepoint.
 *  Exit 0 = holds. Exit 1 = violations. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll, guardedInsert, readClient } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
// Single SoT for the surface→domain-set mapping (no re-copy of the routing numbers).
const dom = await jiti.import("@/lib/domains.ts");
const SURFACE_SETS = {
  reg: dom.REGULATIONS_DOMAINS, market: dom.MARKET_INTEL_DOMAINS,
  ops: dom.OPERATIONS_DOMAINS, research: dom.RESEARCH_DOMAINS,
};
const TYPE_SURFACE = {
  regulation: "reg", directive: "reg", standard: "reg", guidance: "reg", law: "reg",
  market_signal: "market", technology: "market", innovation: "market",
  regional_data: "ops", research_finding: "research",
}; // conditional types (framework/tool/initiative) intentionally absent

const surfaceOfDomain = (d) => {
  if (d == null) return "NONE";
  for (const [name, set] of Object.entries(SURFACE_SETS)) if (set.has(d)) return name;
  return "NONE"; // domain 5 (and any non-surface value)
};

let items;
try {
  items = await readAll("intelligence_items", "id,legacy_id,title,item_type,domain,priority", {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });
} catch (e) { console.error(`surface-visibility-audit: read failed: ${e.message}`); process.exit(2); }

const noSurface = [];    // domain null/5 — invisible everywhere (any type)
const crossSurface = []; // unconditional type on a DIFFERENT surface than its type
for (const it of items || []) {
  const cur = surfaceOfDomain(it.domain);
  const typeSurface = TYPE_SURFACE[it.item_type]; // undefined for conditional types
  if (cur === "NONE") { noSurface.push(it); continue; }
  if (typeSurface && cur !== typeSurface) crossSurface.push({ ...it, cur, typeSurface });
}
const violations = [...noSurface, ...crossSurface];

console.log(`\n===== SURFACE-VISIBILITY INVARIANT (read-only) =====`);
console.log(`verified+live: ${(items || []).length}  |  no-surface (HIDDEN): ${noSurface.length}  |  cross-surface (MISROUTED): ${crossSurface.length}`);

if (!violations.length) {
  console.log(`invariant holds: every verified, live item renders on the surface its type belongs to.`);
  process.exit(0);
}

async function flagOnce(v, category, desc, action, rationale) {
  const { data: existing } = await readClient()
    .from("integrity_flags").select("id")
    .eq("subject_type", "item").eq("subject_ref", v.id)
    .eq("created_by", "surface-visibility-audit").eq("status", "open").limit(1);
  if (existing?.length) return false;
  await guardedInsert("integrity_flags", {
    category, subject_type: "item", subject_ref: v.id, status: "open",
    created_by: "surface-visibility-audit", description: desc,
    recommended_actions: [{ action, rationale }],
  }, { cite: { skill: "caros-ledge-platform-intent", reason: "surface-visibility invariant" } });
  return true;
}

let flagged = 0;
for (const v of noSurface) {
  if (await flagOnce(v, "data_integrity",
    `Verified item "${(v.title || "").slice(0, 80)}" (${v.item_type}) has domain ${v.domain ?? "null"} — on NO customer surface, invisible everywhere.`,
    "assign_surface_domain",
    `Set a real surface domain (1/2/3/4/6/7), or reclassifyToSource if this is a source/portal, not an item.`)) flagged++;
}
for (const v of crossSurface) {
  if (await flagOnce(v, "data_quality",
    `Verified item "${(v.title || "").slice(0, 80)}" (${v.item_type}) renders on the ${v.cur} surface but its type belongs to ${v.typeSurface} — wrong surface.`,
    "recheck_item_type_and_domain",
    `If genuinely a ${v.item_type}, correct the domain to the ${v.typeSurface} surface. If mis-typed (institutional/portal/research), fix item_type or reclassifyToSource — do NOT blind-force the domain.`)) flagged++;
}

console.log(`\n── HIDDEN (no surface) ──`);
for (const v of noSurface) console.log(`  ${(v.legacy_id || v.id.slice(0, 8)).padEnd(14)} ${v.item_type.padEnd(14)} domain=${v.domain ?? "null"}  ${(v.title || "").slice(0, 52)}`);
console.log(`\n── MISROUTED (wrong surface; ${crossSurface.length}) ──`);
for (const v of crossSurface) console.log(`  ${(v.legacy_id || v.id.slice(0, 8)).padEnd(14)} ${v.item_type.padEnd(14)} ${v.cur}->${v.typeSurface}  ${(v.title || "").slice(0, 48)}`);
console.log(`\n${flagged} new integrity_flags written (existing open flags skipped). Fix per each flag's action, then re-run.`);
process.exit(1);
