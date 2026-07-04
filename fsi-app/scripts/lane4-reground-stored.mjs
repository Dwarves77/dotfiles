/** STORED-POOL RE-GROUND RUNNER — durable tooling for fetch-free recovery of quarantined items that
 *  already carry an agent_run_searches pool. Serves the Lane-#4 backlog AND queue item 6 (the 55
 *  true-uniques). GOVERNING: remediation-discipline (RD-4 research-or-erase; Section 2.1 recovery-triage:
 *  stored pool → Sonnet-only re-ground, ZERO Browserless).
 *
 *  ZERO-FETCH IS MECHANICAL: this runner DELETES BROWSERLESS_API_KEY from the env after loading, so any
 *  transport fetch THROWS ("BROWSERLESS_API_KEY not configured") instead of hitting the network. It also
 *  refuses to run if the key is still set. Two passes, routed by failure class:
 *    --mode=ground   groundBrief only (grounding-class: unlabeled_assertion / ungrounded_url /
 *                    fact_below_authority_floor / fact_span_not_in_source). Cheapest.
 *    --mode=resynth  generateBriefFromStored → sectionBrief → groundBrief (slot-class: re-synthesise the
 *                    brief from the SAVED pool — NO Browserless). NO_STORED_POOL → skip (never fetch).
 *    --classify      READ-ONLY: split the target set by stored failure class, report split + projected cost.
 *  Flags: --apply (default dry-run) --only=<ids/legacy,csv> --exclude=<ids,csv> --limit=N
 *  Outcomes per item: RELEASE (verified) / still-resolving / SKIP (no pool) / ERROR. DELETE is a manual
 *  disposition decided from the report, never auto here (non-destructive, same as regen-quarantined). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
// ── MECHANICAL ZERO-FETCH GUARD ──────────────────────────────────────────────────────────────────
delete process.env.BROWSERLESS_API_KEY;
if (process.env.BROWSERLESS_API_KEY) { console.error("REFUSING: BROWSERLESS_API_KEY is still set; this runner must run fetch-free."); process.exit(2); }

const APPLY = process.argv.includes("--apply");
const CLASSIFY = process.argv.includes("--classify");
const MODE = (() => { const a = process.argv.find((x) => x.startsWith("--mode=")); return a ? a.slice(7) : "ground"; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const EXCLUDE = (() => { const a = process.argv.find((x) => x.startsWith("--exclude=")); return a ? a.slice(10).split(",").map((s) => s.trim()).filter(Boolean) : []; })();

const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored, sectionBrief, groundBrief, NO_STORED_POOL } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

const HOLD_TYPES = new Set(["research_finding", "technology", "tool", "innovation"]);
const GROUNDING_CLASS = new Set(["unlabeled_assertion", "ungrounded_url", "fact_below_authority_floor", "fact_span_not_in_source"]);
const SLOT_CLASS = new Set(["missing_required_slot", "no_section_content"]);

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;
const poolCount = async (id) => (await sb.from("agent_run_searches").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id)).count ?? 0;
async function failuresOf(id) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.failures || []).map((f) => f.reason);
}
function classOf(reasons) {
  if (!reasons.length) return "clean?";
  if (reasons.some((r) => SLOT_CLASS.has(r))) return "slot";
  if (reasons.every((r) => GROUNDING_CLASS.has(r))) return "grounding";
  return "other";
}

// target set: non-HOLD quarantined, minus --exclude, filtered by --only, capped by --limit
const allQ = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
let targets = allQ.filter((it) => !HOLD_TYPES.has(it.item_type));
targets = targets.filter((it) => !EXCLUDE.some((w) => it.id.startsWith(w) || it.legacy_id === w));
if (ONLY) targets = targets.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((w) => it.id.startsWith(w)));

console.log(`\n===== STORED-POOL RE-GROUND (${CLASSIFY ? "CLASSIFY" : MODE}${APPLY ? " APPLY" : " DRY-RUN"}) — fetch-free (BROWSERLESS_API_KEY unset) =====`);
console.log(`non-HOLD quarantined: ${targets.length}${LIMIT < Infinity ? ` (limit ${LIMIT})` : ""}  | excluded: ${EXCLUDE.join(",") || "-"}`);

// ── CLASSIFY (read-only) ─────────────────────────────────────────────────────────────────────────
if (CLASSIFY) {
  const split = { grounding: [], slot: [], other: [], "clean?": [] };
  for (const it of targets.slice(0, LIMIT)) {
    const cls = classOf(await failuresOf(it.id));
    split[cls].push({ id: it.id.slice(0, 8), legacy: it.legacy_id, pool: await poolCount(it.id) });
  }
  const G = split.grounding.length, S = split.slot.length, O = split.other.length, C = split["clean?"].length;
  console.log(`\nCLASS SPLIT:  grounding=${G}  slot=${S}  other=${O}  clean?=${C}`);
  const proj = G * 0.055 + S * 0.12 + O * 0.12;
  console.log(`PROJECTED BLENDED COST: grounding ${G}×$0.055 + slot ${S}×$0.12 + other ${O}×$0.12 ≈ $${proj.toFixed(2)} (hard cap $10)`);
  for (const [k, arr] of Object.entries(split)) if (arr.length) console.log(`\n  [${k}] ${arr.map((x) => `${x.legacy || x.id}(pool${x.pool})`).join(", ")}`);
  process.exit(0);
}

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply.`); process.exit(0); }

// ── RE-GROUND passes ─────────────────────────────────────────────────────────────────────────────
const costBefore = ((await sb.from("agent_runs").select("cost_usd_estimated")).data || []).reduce((a, r) => a + (Number(r.cost_usd_estimated) || 0), 0);
let released = 0, still = 0, skipped = 0, errored = 0, n = 0;
const outcomes = [];
for (const it of targets.slice(0, LIMIT)) {
  n++;
  const key = it.legacy_id || it.id.slice(0, 8);
  const cls = classOf(await failuresOf(it.id));
  try {
    if ((await poolCount(it.id)) === 0) { skipped++; outcomes.push({ key, cls, pass: MODE, outcome: "SKIP(no-pool)" }); console.log(`  ${key.padEnd(14)} [${cls}] SKIP (no stored pool — never fetch)`); continue; }
    if (MODE === "resynth") {
      const g = await generateBriefFromStored(it.id);
      if (g.detail === NO_STORED_POOL) { skipped++; outcomes.push({ key, cls, pass: MODE, outcome: "SKIP(no-pool)" }); console.log(`  ${key.padEnd(14)} [${cls}] SKIP (NO_STORED_POOL)`); continue; }
      if (!g.ok) { still++; outcomes.push({ key, cls, pass: MODE, outcome: "still (gen failed)" }); console.log(`  ${key.padEnd(14)} [${cls}] still-resolving (generateBriefFromStored: ${g.detail.slice(0, 50)})`); continue; }
      await sectionBrief(it.id);
    }
    await groundBrief(it.id);
    if ((await prov(it.id)) === "verified") { released++; outcomes.push({ key, cls, pass: MODE, outcome: "RELEASE" }); console.log(`  ${key.padEnd(14)} [${cls}] RELEASE (verified)  ${(it.title || "").slice(0, 40)}`); }
    else { still++; const res = await failuresOf(it.id); outcomes.push({ key, cls, pass: MODE, outcome: "still", residual: res }); console.log(`  ${key.padEnd(14)} [${cls}] still-resolving  residual=${JSON.stringify(res)}`); }
  } catch (e) { errored++; outcomes.push({ key, cls, pass: MODE, outcome: `ERROR: ${e.message.slice(0, 60)}` }); console.log(`  ${key.padEnd(14)} [${cls}] ERROR: ${e.message.slice(0, 70)}`); }
}
const costAfter = ((await sb.from("agent_runs").select("cost_usd_estimated")).data || []).reduce((a, r) => a + (Number(r.cost_usd_estimated) || 0), 0);
const measured = costAfter - costBefore;
console.log(`\n=== BATCH DONE (${MODE}) ===`);
console.log(`items ${n}: RELEASE ${released}  still-resolving ${still}  SKIP ${skipped}  ERROR ${errored}`);
console.log(`MEASURED SPEND (agent_runs cost delta): $${measured.toFixed(3)}  | per-item ≈ $${n ? (measured / n).toFixed(3) : "0"}  (basis: ground $0.03-0.08, resynth $0.08-0.15)`);
if (measured < 0.0005) console.log(`  NOTE: ~0 measured — the stored path may not log agent_runs cost; treat spend as basis-estimated.`);
process.exit(0);
