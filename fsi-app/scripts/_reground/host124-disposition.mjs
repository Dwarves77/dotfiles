/** 124-HOST BATCH DISPOSITION (operator ruling 2026-07-13, corrected counts). Guarded, $0, no fetch/model.
 *  Registers the ruled span-bearing + codified-gov hosts at their class-rule tier; creates the re-attribution
 *  worklist for the permanent-worklist class (encyclopedia/aggregator/resolver/legal-aggregator/off-domain);
 *  resolves the batch flag. Zero-span non-worklist hosts are NOT registered (class rule governs their first
 *  future span). DRY-RUN default; --apply writes + read-back. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedUpdate, guardedInsert } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const norm = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

// Ruled class-rule tiers for the corrected 38 span-bearing + the 2 zero-span codified gov (calrecycle, osti).
const HOST_TIER = {
  // gov (codified + legislative) → T2
  "calrecycle.ca.gov": 2, "osti.gov": 2, "rcaanc-cirnac.gc.ca": 2, "www2.camara.leg.br": 2,
  // lawfirm → T7
  "lw.com": 7, "wfw.com": 7,
  // news / trade-press → T7
  "freightwaves.com": 7, "greenairnews.com": 7, "theartnewspaper.com": 7, "motortransport.co.uk": 7,
  "logistics-manager.com": 7, "lloydslistintelligence.com": 7, "maritime-executive.com": 7, "safety4sea.com": 7,
  "logisticsinsider.in": 7, "events.reutersevents.com": 7, "tpm.joc.com": 7, "thomsonreuters.com": 7,
  "calmatters.org": 7, "plasticsnews.com": 7, "supplychainbrain.com": 7, "en.logishift.net": 7, "fadmagazine.com": 7,
  // corporate / advisory (incl. pwc per ruling #2) → T7
  "newsroom.bankofamerica.com": 7, "pwc.com": 7, "dieselnet.com": 7, "coolset.com": 7, "carboncredits.com": 7,
  "greenphl.com": 7,
  // analysis (Research-feedstock, sub-floor) → T6
  "ammoniaenergy.org": 6, "cleanenergywire.org": 6, "climatecatalyst.org": 6, "sustainable-ships.org": 6,
  // association (accredited/industry body, cer.be precedent) → T4
  "usasean.org": 4,
};
// Permanent worklist class (never auto-registered): encyclopedia / aggregator / resolver / legal-aggregator / off-domain.
const WORKLIST = {
  "en.wikipedia.org": "encyclopedia", "policycommons.net": "aggregator", "doi.org": "doi-resolver",
  "legiscan.com": "legal-aggregator", "england.shelter.org.uk": "off-domain-charity", "mdst.co.uk": "unknown",
};

// fetch every source row for the acted-on hosts
const allHosts = [...Object.keys(HOST_TIER), ...Object.keys(WORKLIST)];
const rows = await readAll("sources", "id, url, base_tier"); // paginated — avoids the 1000-row cap
const byHost = new Map();
for (const r of rows || []) { const h = norm(r.url); if (h && allHosts.includes(h)) { if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(r.id); } }

console.log(`\n===== 124-HOST DISPOSITION (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
let reg = 0, regRows = 0;
for (const [host, tier] of Object.entries(HOST_TIER)) {
  const ids = byHost.get(host) || [];
  if (!ids.length) { console.log(`  ${host.padEnd(30)} T${tier}  — NO source row (skip)`); continue; }
  if (!APPLY) { console.log(`  ${host.padEnd(30)} T${tier}  (${ids.length} row) WOULD register`); reg++; regRows += ids.length; continue; }
  const u = await guardedUpdate("sources", (qb) => qb.in("id", ids), { base_tier: tier },
    { cite: { skill: "source-credibility-model", reason: `124-host batch ruling: register ${host} at class-rule tier T${tier} (SC-13 class-table extension)` } });
  const fresh = readClient();
  const { data: back } = await fresh.from("sources").select("base_tier").in("id", ids);
  const ok = (back || []).every((b) => b.base_tier === tier);
  console.log(`  ${host.padEnd(30)} T${tier}  updated=${u.updated}/${ids.length} readback=${ok ? "OK" : "MISMATCH"}`);
  reg++; regRows += ids.length;
}

// re-attribution worklist flag (one, listing the worklist-class hosts + instruction)
const worklistLines = Object.entries(WORKLIST).map(([h, k]) => `${h} (${k})`);
if (APPLY) {
  await guardedInsert("integrity_flags", {
    category: "source_issue", subject_type: "system", subject_ref: "sources.class-worklist-reattribution",
    status: "open", created_by: "host124-worklist",
    description: `Permanent worklist class (124-host ruling): a FACT span attributing to any of these hosts is a RE-ATTRIBUTION instruction — re-home to the official publisher, or relabel FACT→ANALYSIS. Never auto-register. Hosts: ${worklistLines.join("; ")}.`,
    recommended_actions: [{ action: "reattribute_or_relabel", rationale: "encyclopedia/aggregator/resolver/legal-aggregator/off-domain — not a primary; spans re-home to the cited primary or relabel to labeled ANALYSIS", hosts: Object.keys(WORKLIST) }],
  }, { cite: { skill: "source-credibility-model", reason: "124-host ruling: permanent worklist class re-attribution instruction" } });
  // resolve the batch flag
  await guardedUpdate("integrity_flags", (qb) => qb.eq("id", "fda0f86b-a049-43e0-8b16-4753dca21559"),
    { status: "resolved", resolution_note: `Dispositioned per operator ruling 2026-07-13 (corrected counts): ${reg} hosts registered at class-rule tiers (gov T2 / lawfirm+news+corporate T7 / analysis T6 / association T4); ${Object.keys(WORKLIST).length} hosts → permanent worklist class (re-attribution); zero-span non-worklist hosts closed as no-grounding-stake-lazy-class, governed by the SC-13 class-table extension on first future span.` },
    { cite: { skill: "remediation-discipline", reason: "124-host batch fully dispositioned; close the review-batch flag" } });
}

console.log(`\n===== SUMMARY (${APPLY ? "applied" : "predicted"}) =====`);
console.log(`  registered hosts: ${reg} (${regRows} source rows)`);
console.log(`  worklist-class hosts: ${Object.keys(WORKLIST).length} → one re-attribution flag`);
console.log(`  batch flag fda0f86b: ${APPLY ? "RESOLVED" : "would resolve"}`);
console.log(`  zero-span non-worklist (~84): not registered; class-rule governs first future span`);
process.exit(0);
