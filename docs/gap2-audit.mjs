// Gap 2 read-only audit — provisional sources by jurisdiction, coverage matrix,
// asymmetry jurisdictions, recommended action buckets. NO writes.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
};
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("missing supabase env");

const sb = createClient(url, key, { auth: { persistSession: false } });

const out = {};

async function run() {
  // 1. All provisional_sources rows
  const { data: provs, error: pe } = await sb
    .from("provisional_sources")
    .select(
      "id,name,url,status,discovered_via,discovered_for_jurisdiction,recommended_tier,provisional_tier,recommended_classification,citation_count,independent_citers,highest_citing_tier,created_at,reviewer_notes,promoted_to_source_id"
    );
  if (pe) throw pe;
  out.provisional_sources_total = provs.length;
  out.provisional_sources_rows = provs;

  // 2. Provisional by status
  const byStatus = {};
  for (const r of provs) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  out.provisional_by_status = byStatus;

  // 3. Provisional by jurisdiction
  const byJur = {};
  for (const r of provs) {
    const j = r.discovered_for_jurisdiction || "<NULL>";
    byJur[j] = byJur[j] || { total: 0, by_status: {} };
    byJur[j].total += 1;
    byJur[j].by_status[r.status] = (byJur[j].by_status[r.status] || 0) + 1;
  }
  out.provisional_by_jurisdiction = byJur;

  // 4. Active sources per jurisdiction (unnest jurisdiction_iso array)
  const { data: activeSources, error: as } = await sb
    .from("sources")
    .select("id,name,url,jurisdiction_iso,status,tier")
    .eq("status", "active");
  if (as) throw as;
  out.active_sources_total = activeSources.length;
  const sourcesByJur = {};
  for (const s of activeSources) {
    const isos = Array.isArray(s.jurisdiction_iso) ? s.jurisdiction_iso : [];
    if (!isos.length) {
      sourcesByJur["<NONE>"] = (sourcesByJur["<NONE>"] || 0) + 1;
      continue;
    }
    for (const iso of isos) {
      sourcesByJur[iso] = (sourcesByJur[iso] || 0) + 1;
    }
  }
  out.active_sources_by_jurisdiction = sourcesByJur;

  // 5. Intelligence items per jurisdiction (only non-archived)
  const { data: items, error: ie } = await sb
    .from("intelligence_items")
    .select("id,legacy_id,title,jurisdiction_iso,source_url,is_archived,item_type")
    .eq("is_archived", false);
  if (ie) throw ie;
  out.intelligence_items_total = items.length;
  const itemsByJur = {};
  for (const it of items) {
    const isos = Array.isArray(it.jurisdiction_iso) ? it.jurisdiction_iso : [];
    if (!isos.length) {
      itemsByJur["<NONE>"] = itemsByJur["<NONE>"] || [];
      itemsByJur["<NONE>"].push(it);
      continue;
    }
    for (const iso of isos) {
      itemsByJur[iso] = itemsByJur[iso] || [];
      itemsByJur[iso].push(it);
    }
  }
  out.items_by_jurisdiction_summary = Object.fromEntries(
    Object.entries(itemsByJur).map(([k, v]) => [k, v.length])
  );

  // 6. Asymmetry: jurisdictions with items but no active sources
  const itemJurs = new Set(Object.keys(itemsByJur));
  const sourceJurs = new Set(Object.keys(sourcesByJur));
  const asymmetry = {};
  for (const j of itemJurs) {
    if (j === "<NONE>") continue;
    if (!sourceJurs.has(j) || (sourcesByJur[j] || 0) === 0) {
      asymmetry[j] = itemsByJur[j].map((it) => ({
        id: it.id,
        legacy_id: it.legacy_id,
        title: it.title,
        item_type: it.item_type,
        source_url: it.source_url,
        jurisdiction_iso: it.jurisdiction_iso,
      }));
    }
  }
  out.asymmetry_items_no_sources = asymmetry;

  // 7. source_verifications join — pull recommended_classification + scores from latest verification per provisional
  const { data: verifs, error: ve } = await sb
    .from("source_verifications")
    .select("id,candidate_url,candidate_name,jurisdiction_iso,language,ai_relevance_score,ai_freight_score,ai_trust_tier,verification_tier,action_taken,rejection_reason,resulting_source_id,resulting_provisional_id,created_at")
    .order("created_at", { ascending: false });
  if (ve) {
    out.source_verifications_error = ve.message;
  } else {
    out.source_verifications_total = verifs.length;
    // Build URL -> latest verification map for joining to provisionals
    const byUrl = {};
    for (const v of verifs) {
      if (!byUrl[v.candidate_url]) byUrl[v.candidate_url] = v;
    }
    // For each provisional, attach matching verification (if any)
    const provVerifs = {};
    for (const p of provs) {
      const v = byUrl[p.url];
      if (v) {
        provVerifs[p.id] = {
          name: p.name,
          url: p.url,
          ai_relevance_score: v.ai_relevance_score,
          ai_freight_score: v.ai_freight_score,
          ai_trust_tier: v.ai_trust_tier,
          verification_tier: v.verification_tier,
          action_taken: v.action_taken,
          rejection_reason: v.rejection_reason,
          jurisdiction_iso: v.jurisdiction_iso,
          language: v.language,
          created_at: v.created_at,
        };
      } else {
        provVerifs[p.id] = { name: p.name, url: p.url, verification_match: null };
      }
    }
    out.provisional_with_verification = provVerifs;
    // Tier-M verifications (queued-provisional) — these are the candidates that resulted in a provisional row
    const tierM = verifs.filter(v => v.verification_tier === "M");
    out.tier_m_verifications_total = tierM.length;
    // Group tier M by jurisdiction for promotion candidate scoring
    const tierMByJur = {};
    for (const v of tierM) {
      const isos = Array.isArray(v.jurisdiction_iso) ? v.jurisdiction_iso : [];
      for (const j of (isos.length ? isos : ["<NONE>"])) {
        tierMByJur[j] = tierMByJur[j] || [];
        tierMByJur[j].push({
          url: v.candidate_url,
          name: v.candidate_name,
          rel: v.ai_relevance_score,
          frt: v.ai_freight_score,
          trust: v.ai_trust_tier,
          rejection_reason: v.rejection_reason,
          resulting_provisional_id: v.resulting_provisional_id,
        });
      }
    }
    out.tier_m_by_jurisdiction = tierMByJur;
  }

  console.log(JSON.stringify(out, null, 2));
}

run().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
