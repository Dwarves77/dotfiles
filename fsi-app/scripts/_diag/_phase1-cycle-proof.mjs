// Phase 1 TRIGGER proof (reversible): reputation recompute is now an END-OF-CYCLE STEP in
// growSourcesFromBrief — it runs AFTER recordCitations writes the fresh edges (in the SAME call), so a
// reputation move here PROVES the ordering. Also asserts the nightly q7 cron is GONE from vercel.json.
// Runs the REAL growSourcesFromBrief against the live DB with a crafted brief, then restores everything.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { growSourcesFromBrief } = await jiti.import("../../src/lib/sources/source-growth.ts");
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = readClient();

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); c ? pass++ : fail++; };
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
async function allSources() { const r = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(f, f + 999); if (!data?.length) break; r.push(...data); if (data.length < 1000) break; } return r; }

console.log("========== PHASE 1 TRIGGER (end-of-cycle recompute) PROOF ==========");
// (A) nightly cron retired
const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const hasQ7Cron = JSON.stringify(vercel.crons ?? []).includes("q7-daily-recompute");
ok("nightly q7 cron REMOVED from vercel.json (no standalone reputation timer)", !hasQ7Cron, `crons=${JSON.stringify(vercel.crons ?? [])}`);

// pick a clean promotable SUBJECT + distinct-host high-tier citers
const { data: cited } = await sb.from("source_citations").select("cited_source_id");
const citedSet = new Set((cited ?? []).map((r) => r.cited_source_id));
const { data: cand } = await sb.from("sources").select("id,url,base_tier,effective_tier,independent_citers,confirmation_count,highest_citing_tier,total_citations,trust_score_citation,tier_override").gte("base_tier", 3).lte("base_tier", 5).eq("status", "active").limit(300);
const SUBJ = (cand ?? []).find((s) => s.url && !citedSet.has(s.id) && s.tier_override == null && hostOf(s.url));
if (!SUBJ) { console.error("no clean subject"); process.exit(1); }
const { data: citerRows } = await sb.from("sources").select("id,url,base_tier").lte("base_tier", 2).eq("status", "active").neq("id", SUBJ.id).limit(60);
const seenHost = new Set([hostOf(SUBJ.url)]); const citers = [];
for (const c of citerRows ?? []) { const h = hostOf(c.url); if (h && !seenHost.has(h)) { seenHost.add(h); citers.push(c); } if (citers.length >= 5) break; }
if (citers.length < 3) { console.error("not enough distinct-host citers"); process.exit(1); }

// craft a brief whose "New Sources Identified" table lists the citers' real hosts (registerCitedSources
// resolves each to the existing source -> recordCitations writes citer->subject edges).
const rows = citers.map((c, i) => `| Citer ${i + 1} | https://${hostOf(c.url)}/phase1-cycle-proof | 1 |`).join("\n");
const brief = `# Brief\n\nbody\n\n# New Sources Identified\n\n| Source Name | URL | Tier |\n| --- | --- | --- |\n${rows}\n`;
console.log(`subject ${SUBJ.id} base_tier=${SUBJ.base_tier} host=${hostOf(SUBJ.url)} | ${citers.length} distinct-host citers`);

const SNAP = { effective_tier: SUBJ.effective_tier, independent_citers: SUBJ.independent_citers, confirmation_count: SUBJ.confirmation_count, highest_citing_tier: SUBJ.highest_citing_tier, total_citations: SUBJ.total_citations, trust_score_citation: SUBJ.trust_score_citation };
try {
  const res = await growSourcesFromBrief(sb, SUBJ.id, brief);
  ok("recordCitations wrote fresh edges in this cycle (>=3)", res.citationsRecorded >= 3, `citationsRecorded=${res.citationsRecorded}`);
  ok("cycle recompute FIRED and moved reputation (proves recompute AFTER recordCitations)", res.reputation && res.reputation.changed === true, `reputation=${JSON.stringify(res.reputation)}`);
  ok("promoted one tier (base-1)", res.reputation && res.reputation.after === SUBJ.base_tier - 1, `after=${res.reputation?.after}`);
  const { data: after } = await sb.from("sources").select("base_tier, effective_tier, tier").eq("id", SUBJ.id).single();
  ok("effective_tier written (dynamic column)", after.effective_tier === SUBJ.base_tier - 1, `eff=${after.effective_tier}`);
  ok("base_tier + compat `tier` UNTOUCHED (moat anchor safe)", after.base_tier === SUBJ.base_tier && after.tier === SUBJ.base_tier, `base=${after.base_tier} tier=${after.tier}`);
  const stamp = buildResolver(await allSources()).resolveSpan(SUBJ.url).tier;
  ok("MOAT: reg-fact stamp stays base_tier despite promoted effective_tier", stamp === SUBJ.base_tier, `stamp=${stamp} base=${SUBJ.base_tier}`);
} finally {
  await sb.from("source_citations").delete().eq("cited_source_id", SUBJ.id).eq("context", "brief-citation");
  await sb.from("source_trust_events").delete().eq("source_id", SUBJ.id).eq("created_by", "reputation-cycle");
  await sb.from("sources").update(SNAP).eq("id", SUBJ.id);
  const { data: r } = await sb.from("sources").select("effective_tier, total_citations").eq("id", SUBJ.id).single();
  ok("REVERTED (subject restored, seeded edges + events deleted)", r.effective_tier === SNAP.effective_tier && r.total_citations === SNAP.total_citations, `eff=${r.effective_tier}`);
}
console.log(`\n${fail === 0 ? "ALL PASS — reputation recompute is an end-of-cycle step (fires after recordCitations); base untouched; moat holds; nightly cron gone." : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
