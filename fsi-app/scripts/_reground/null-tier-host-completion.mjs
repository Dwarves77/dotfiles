/** 44-HOST EXPANSION COMPLETION (operator item 2, 2026-07-13). The register-at-grounding null-tier-host worklist
 *  (surfaceNullTierHosts) was never registered. Complete it deterministically via the SC-13 class-table rule:
 *  each open null-tier-host host → decidePoolHostRegistration (inherit if its institution already resolves /
 *  register at the class tier / worklist if unknown). On register: create the source (registerSource), re-stamp
 *  the host's NULL FACT spans (source_id + source_tier_at_grounding), and resolve the null-tier-host flag.
 *  Worklist-class hosts keep their flag OPEN (permanent worklist / re-attribution). Guarded, $0, no fetch/model.
 *  DRY-RUN default; --apply writes + read-back. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, registerSource, guardedUpdate } from "../lib/db.mjs";
import { decidePoolHostRegistration, classTierForHost } from "../../src/lib/sources/host-authority.ts";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

const flags = await readAll("integrity_flags", "id, subject_ref",
  { match: (q) => q.eq("created_by", "null-tier-host").eq("status", "open") });

// pre-compute host -> [NULL FACT span ids] ONCE (paginated — avoids the readClient 1000-row cap that bit item 1)
const nullSpans = await readAll("section_claim_provenance", "id, search_result_id",
  { match: (q) => q.eq("claim_kind", "FACT").is("source_id", null) });
const poolIds = [...new Set(nullSpans.map((s) => s.search_result_id).filter(Boolean))];
const pools = poolIds.length ? await readAll("agent_run_searches", "id, result_url", { match: (q) => q.in("id", poolIds) }) : [];
const poolHostById = new Map(pools.map((p) => [p.id, hostOf(p.result_url)]));
const spanIdsByHost = new Map();
for (const s of nullSpans) { const h = poolHostById.get(s.search_result_id); if (h) { if (!spanIdsByHost.has(h)) spanIdsByHost.set(h, []); spanIdsByHost.get(h).push(s.id); } }

// registry institution resolution: does the host's registrable domain already resolve to a tier?
const srcs = await readAll("sources", "url, base_tier, tier_override");
const tierByHost = new Map();
for (const s of srcs) { const h = hostOf(s.url); if (h && (s.tier_override ?? s.base_tier) != null) tierByHost.set(h, s.tier_override ?? s.base_tier); }

console.log(`\n===== 44-HOST EXPANSION COMPLETION (${APPLY ? "APPLY" : "DRY-RUN"}) ===== ${flags.length} open null-tier-host flags`);
let registered = 0, inherited = 0, worklisted = 0, spansRestamped = 0, govRecover = 0;
const cite = { skill: "source-credibility-model", reason: "44-host expansion completion: register the null-tier-host at its SC-13 class-table tier + re-stamp its NULL FACT spans (deterministic, no guess)" };

for (const f of flags) {
  const host = f.subject_ref;
  // GRANULARITY HALT (operator: halt any host the C4 ruler would collapse): a europa.eu subdomain shares its
  // eTLD+1 with eur-lex.europa.eu (T1) — the documented institution-distinct super-domain. Auto-registering it
  // could collapse the institution; leave the flag OPEN for the granularity ruling.
  if (/\.europa\.eu$/.test(host) && host !== "eur-lex.europa.eu") { worklisted++; console.log(`  ${host.padEnd(34)} HALT (shared europa.eu super-domain — granularity ruling) — flag stays open`); continue; }
  const already = tierByHost.get(host) ?? null;
  const d = decidePoolHostRegistration(host, already);
  const clsTier = classTierForHost(host);

  if (d.action === "worklist") { worklisted++; console.log(`  ${host.padEnd(34)} WORKLIST (class-null) — flag stays open`); continue; }

  const tier = d.tier;
  const tag = d.action === "inherit" ? "INHERIT" : "REGISTER";
  if (!APPLY) { console.log(`  ${host.padEnd(34)} ${tag} T${tier}${clsTier != null ? "" : " (inherit)"}`); if (d.action === "inherit") inherited++; else registered++; if (tier <= 2) govRecover++; continue; }

  // registerSource is idempotent (returns the existing source_id for an already-registered institution / a new
  // one for a codified/class host); use its id to re-stamp this host's NULL FACT spans at the resolved tier.
  const r = await registerSource({ url: `https://${host}/`, name: host, base_tier: tier }, { cite });
  const sourceId = r.source_id;
  if (d.action === "register") registered++; else inherited++;
  const mySpanIds = spanIdsByHost.get(host) || [];
  if (mySpanIds.length && sourceId) {
    await guardedUpdate("section_claim_provenance", (qb) => qb.in("id", mySpanIds),
      { source_id: sourceId, source_tier_at_grounding: tier }, { cite });
    spansRestamped += mySpanIds.length;
  }
  await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id),
    { status: "resolved", resolution_note: `44-host completion: registered ${host} at class tier T${tier}; re-stamped ${mySpanIds.length} NULL FACT span(s).` }, { cite });
  if (tier <= 2) govRecover++;
  console.log(`  ${host.padEnd(34)} ${tag} T${tier}  spans-restamped=${mySpanIds.length} [flag resolved]`);
}

console.log(`\n===== SUMMARY (${APPLY ? "applied" : "predicted"}) =====`);
console.log(`  register: ${registered}  inherit: ${inherited}  worklist(open): ${worklisted}`);
if (APPLY) console.log(`  spans re-stamped: ${spansRestamped}`);
console.log(`  floor-recovering (gov/legal <=T2): ${govRecover} host(s)`);
process.exit(0);
