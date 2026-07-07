// PATH B BATCH — the 9 enacted clean-win items. Per item: generateBriefRefreshPrimary (full #155 re-fetch
// of the enacted text, FREE, no web_search) -> register -> section -> ground. Then relabel the contextual
// residual (--post-resynth) across the set. Then MEASURE: per-item tier outcome (sub-floor / NULL) + the
// criterion-5 slot residual. 7a0ead55 already done (Path B + relabel) — measured, not re-run.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Default = the 8 (7a0ead55 already Path-B'd); override with argv prefixes to re-run a targeted subset.
const RERUN = process.argv.slice(2).length ? process.argv.slice(2) : ["e2e03e1b", "782878c0", "5cc10a6d", "8c186db2", "15f63ea9", "51b2c91e", "6a857887", "1e80067a"];
const ALL9 = process.argv.slice(2).length ? RERUN : ["7a0ead55", ...RERUN];
const items = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from("intelligence_items").select("id,title").order("id").range(f, f + 999); if (!data?.length) break; items.push(...data); if (data.length < 1000) break; }
const byPfx = (p) => items.find((r) => r.id.startsWith(p));

const dist = async (id) => { const { data } = await sb.from("section_claim_provenance").select("claim_kind,source_tier_at_grounding").eq("intelligence_item_id", id); return data || []; };

// snapshot prior claim-dist for audit/reversibility
mkdirSync(resolve(ROOT, "scripts/_snapshots"), { recursive: true });
const prior = {};
for (const p of RERUN) { const it = byPfx(p); if (it) { const cl = await dist(it.id); prior[p] = { title: it.title, n: cl.length }; } }
writeFileSync(resolve(ROOT, "scripts/_snapshots/ws1-pathb-9-prior.json"), JSON.stringify(prior, null, 1));

// 1. Path B per item
for (const p of RERUN) {
  const it = byPfx(p); if (!it) { console.log(`${p} NOT FOUND`); continue; }
  process.stdout.write(`\n[${p}] ${String(it.title).slice(0, 32).padEnd(32)} `);
  try {
    const g = await P.generateBriefRefreshPrimary(it.id);
    if (!g.ok) { process.stdout.write(`gen FAIL: ${(g.detail || "").slice(0, 60)}`); continue; }
    await P.registerBriefSources(it.id);
    const s = await P.sectionBrief(it.id);
    if (!s.ok) { process.stdout.write(`section FAIL`); continue; }
    const r = await P.groundBrief(it.id);
    process.stdout.write(`refresh+ground ${r.ok ? "OK" : "FAIL(" + (r.detail || "").slice(0, 40) + ")"}`);
  } catch (e) { process.stdout.write(`ERR ${String(e.message).slice(0, 50)}`); }
}

// 2. relabel contextual residual across the 8 (per-item txns, post-resynth bypass)
console.log("\n\n--- relabel contextual residual ---");
const rl = spawnSync(process.execPath, [resolve(ROOT, "scripts/phase2-analysis-relabel.mjs"), `--target=${RERUN.join(",")}`, "--post-resynth", "--apply"],
  { encoding: "utf8", env: { ...process.env, PHASE2_RELABEL_STAMP: "ws1-pathb-9" } });
console.log((rl.stdout || rl.stderr || "").split("\n").filter((l) => /below=|total claims relabeled|APPLIED/.test(l)).join("\n"));

// 3. measure all 9
console.log("\n=== PATH B BATCH RESULT (9 enacted) ===");
let tierClean = 0, slotClean = 0, verified = 0;
for (const p of ALL9) {
  const it = byPfx(p); if (!it) continue;
  const cl = await dist(it.id);
  const facts = cl.filter((c) => c.claim_kind === "FACT");
  const sub = facts.filter((c) => c.source_tier_at_grounding == null || c.source_tier_at_grounding > 2).length;
  const nulls = facts.filter((c) => c.source_tier_at_grounding == null).length;
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id }); const v = Array.isArray(vr) ? vr[0] : vr;
  const fails = (v?.failures || []); const slotFails = fails.filter((f) => f.reason === "missing_required_slot");
  const { data: st } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  const tierOk = sub === 0 && nulls === 0;
  if (tierOk) tierClean++;
  if (slotFails.length === 0) slotClean++;
  if (st.provenance_status === "verified") verified++;
  const reasons = [...new Set(fails.map((f) => f.reason))];
  console.log(`  ${p} FACT=${String(facts.length).padStart(3)} sub=${String(sub).padStart(2)} NULL=${String(nulls).padStart(2)} ${tierOk ? "TIER✓" : "tier✗"} ${st.provenance_status.padEnd(11)} slots=${slotFails.map((f) => f.slot_key).join(",") || "ok"} | ${reasons.join(",") || "VERIFIED"}`);
}
console.log(`\nTIER-CLEAN (0 sub-floor & 0 NULL): ${tierClean}/9   SLOT-CLEAN (no missing_required_slot): ${slotClean}/9   VERIFIED: ${verified}/9`);
process.exit(0);
