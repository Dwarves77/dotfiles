/** WAVE 2 dedup STEP 1b — characterize the divergent vs identical groups ($0, READ-ONLY).
 *  Distinguishes RACE ARTIFACT (true exact duplicate: same section_row_id + span, two ids created inside the
 *  incident window) from PRE-EXISTING LEGITIMATE STRUCTURE (same claim_text attached to two DIFFERENT section
 *  rows — a claim that legitimately appears in two brief sections). For each duplicate group reports: the
 *  section_row_ids, whether each still exists in intelligence_item_sections, and the extracted_at spread vs the
 *  incident window. Also runs a CONTROL: verified items that were NOT in the race worklist — if THEY show the
 *  same section_row_id-divergent pattern, the pattern is pre-existing, not the race.
 *  Usage: node scripts/wave2-dedup-diagnose.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  // --- incident window from priced-line markers ---
  const { data: markers } = await sb.from("agent_runs").select("started_at, intelligence_item_id")
    .eq("fetch_method", "priced-line").not("started_at", "is", null).order("started_at", { ascending: true });
  const markerTimes = (markers || []).map((m) => m.started_at).filter(Boolean);
  const incidentStart = markerTimes[0];
  const incidentEnd = markerTimes[markerTimes.length - 1];
  console.log(`incident marker window: ${incidentStart} .. ${incidentEnd} (${markerTimes.length} markers)`);

  // section existence cache
  const secExists = new Map();
  async function sectionAlive(secId) {
    if (secId == null) return false;
    if (secExists.has(secId)) return secExists.get(secId);
    const { data } = await sb.from("intelligence_item_sections").select("id").eq("id", secId).maybeSingle();
    const alive = !!data;
    secExists.set(secId, alive);
    return alive;
  }

  async function analyzeItem(id, label) {
    const { data: claims } = await sb.from("section_claim_provenance")
      .select("id, claim_text, claim_kind, source_span, source_id, source_tier_at_grounding, section_row_id, extracted_at")
      .eq("intelligence_item_id", id);
    const groups = new Map();
    for (const c of claims || []) {
      const k = c.claim_text ?? "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const out = { trueDup: 0, multiSection: 0, multiSectionOrphaned: 0, identicalDetail: [], multiDetail: [] };
    for (const [ctext, rows] of groups) {
      if (rows.length <= 1) continue;
      const secIds = new Set(rows.map((r) => r.section_row_id ?? null));
      const times = rows.map((r) => r.extracted_at).filter(Boolean).sort();
      const inWindow = times.filter((t) => incidentStart && t >= incidentStart && t <= incidentEnd).length;
      if (secIds.size === 1) {
        // true exact-duplicate (same section) — the race-artifact shape
        out.trueDup += 1;
        out.identicalDetail.push({ claim: ctext.slice(0, 50), n: rows.length, sec: [...secIds][0], t: `${times[0]}..${times[times.length - 1]}`, inWindow });
      } else {
        // same claim, different section rows — check whether each section still exists
        out.multiSection += 1;
        const aliveFlags = [];
        for (const s of secIds) aliveFlags.push([s, await sectionAlive(s)]);
        const anyDead = aliveFlags.some(([, a]) => !a);
        if (anyDead) out.multiSectionOrphaned += 1;
        out.multiDetail.push({ claim: ctext.slice(0, 50), n: rows.length, secs: aliveFlags.map(([s, a]) => `${String(s).slice(0, 8)}:${a ? "alive" : "DEAD"}`).join(","), inWindow, tspread: `${times[0]?.slice(0, 19)}..${times[times.length - 1]?.slice(0, 19)}` });
      }
    }
    console.log(`\n[${label}] ${String(id).slice(0, 8)}  trueDup(same-section)=${out.trueDup}  multiSection(diff-section)=${out.multiSection} of which orphaned=${out.multiSectionOrphaned}`);
    for (const d of out.identicalDetail.slice(0, 8)) console.log(`   TRUEDUP n=${d.n} sec=${String(d.sec).slice(0, 8)} inWindow=${d.inWindow} t=${d.t.slice(0, 40)} :: "${d.claim}"`);
    for (const d of out.multiDetail.slice(0, 6)) console.log(`   MULTISEC n=${d.n} [${d.secs}] inWindow=${d.inWindow} :: "${d.claim}"`);
    return out;
  }

  // sample the worst RACE-TOUCHED items (quarantined, in worklist)
  console.log(`\n========== RACE-TOUCHED SAMPLE (quarantined worklist items) ==========`);
  const raceTouched = {
    "Washington Administrative Code": null, "Oregon Department of Environmental Quality": null,
    "India's National Logistics Policy": null, "Slovenia Ministry": null, "IMO Air Pollution": null,
  };
  const { data: qItems } = await sb.from("intelligence_items").select("id, title").eq("provenance_status", "quarantined");
  for (const key of Object.keys(raceTouched)) {
    const it = (qItems || []).find((x) => x.title && x.title.includes(key));
    if (it) await analyzeItem(it.id, `RACE ${it.title.slice(0, 30)}`);
  }

  // CONTROL: verified items NOT in worklist that showed dup claim_text
  console.log(`\n========== CONTROL (verified, NOT in race worklist) ==========`);
  const { data: vItems } = await sb.from("intelligence_items").select("id, title")
    .eq("provenance_status", "verified").in("title", ["EUDR (EU Deforestation Regulation)", "CountEmissions EU", "IMO MARPOL Annex VI", "CARB Advanced Clean Trucks"]);
  for (const it of vItems || []) await analyzeItem(it.id, `CTRL ${it.title.slice(0, 30)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
