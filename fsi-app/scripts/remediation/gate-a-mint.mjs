#!/usr/bin/env node
// GATE A guarded-mint runner. Reuses the pipeline resolver (jiti buildResolver) + scanner + applyLedgerDiff.
// Per orphan token: capture-verbatim -> resolveSpan(url)->{tier,sourceId} (sourceId!=null, tier<=floor|exempt)
// -> verbatim span from capture -> section whose prose holds token -> FACT claim. Scan+upsert gate_a_state
// BEFORE applyLedgerDiff so the insert-trigger re-validate sees the fresh orphan_count and restores.
// 4-axis read-back after execute. Run: --item=<id> [--execute] | --prove-regional (auto-pick the 1 fully-clearing)
import { createJiti } from "jiti";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(resolve(process.cwd(), ".env.local"));
const jiti = createJiti(import.meta.url);
const { buildResolver } = await jiti.import(resolve(process.cwd(), "src/lib/sources/institution.ts"));
const { scanBrief } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-scan.mjs")).href);
const { norm, containsToken } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-match.mjs")).href);
const { diffLedger, applyLedgerDiff } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/ledger-apply.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EXECUTE = process.argv.includes("--execute");
// norm + containsToken come from the shared gate-a-match module (case-file 7) — scanner and runner cannot diverge.
const floorOf = (t) => ["regulation", "directive", "standard", "guidance", "framework"].includes(t) ? 2 : t === "research_finding" ? 4 : ["technology", "innovation", "tool"].includes(t) ? 5 : null;
const exempt = (t) => ["regional_data", "market_signal", "initiative"].includes(t);

let all = [];
for (let f = 0; ; f += 1000) { const { data } = await sb.from("sources").select("id, url, base_tier, tier_override, status").order("id").range(f, f + 999); if (!data?.length) break; all.push(...data); if (data.length < 1000) break; }
const resolver = buildResolver(all);

let itemId = (process.argv.find((a) => a.startsWith("--item=")) || "").slice(7) || null;
const proveRegional = process.argv.includes("--prove-regional");
const proveAny = process.argv.includes("--prove-any");
// Selection requires BOTH: (1) Gate-A-only (validate_item_provenance failures are all criterion 7),
// so a mint that clears Gate A restores the item to verified; (2) fully-mintable (every orphan token
// resolves to a floor-qualifying source AND a section holds it). --prove-regional restricts to
// regional_data; --prove-any accepts any type (Branch 2: the chain proof matters, not the surface).
if (!itemId && (proveRegional || proveAny)) {
  const { data: states } = await sb.from("item_gate_a_state").select("intelligence_item_id,orphans").gt("orphan_count", 0);
  for (const st of states) {
    const { data: it } = await sb.from("intelligence_items").select("id,item_type").eq("id", st.intelligence_item_id).maybeSingle();
    if (!it) continue;
    if (proveRegional && it.item_type !== "regional_data") continue;
    const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const v = Array.isArray(vr) ? vr[0] : vr;
    const crits = [...new Set((v?.failures || []).map((f) => f.criterion))];
    if (!(crits.length === 1 && crits[0] === 7)) continue; // Gate-A-only
    const cFloor = floorOf(it.item_type); const cExempt = exempt(it.item_type);
    const { data: caps } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
    const { data: secs } = await sb.from("intelligence_item_sections").select("content_md").eq("item_id", it.id);
    const secText = (secs || []).map((s) => s.content_md).join(" ");
    const capL = (caps || []).filter((c) => (c.result_content_excerpt || "").length > 50);
    const allMint = st.orphans.every((o) => { const tk = o.token; return capL.some((c) => { if (!containsToken(c.result_content_excerpt, tk)) return false; const r = resolver.resolveSpan(c.result_url); if (!r.sourceId) return false; if (!cExempt && !(r.tier != null && cFloor != null && r.tier <= cFloor)) return false; return containsToken(secText, tk); }); });
    if (allMint) { itemId = it.id; console.log(`selected ${it.id.slice(0, 8)} type=${it.item_type} (Gate-A-only + fully-mintable)`); break; }
  }
}
// Per-item mint. Constructs FACT claims for every mintable orphan token, upserts fresh gate_a_state
// BEFORE the ledger insert (so the insert-trigger re-validate sees current-hash clean state), then
// reads back. mismatch[] carries ONLY corpus-corruption signals (4-axis attribution + orphan-count
// write drift) — a partial clear or a non-Gate-A criterion keeping the item quarantined is NOT a mismatch.
async function mintItem(itemId, { execute, readback }) {
  const { data: item } = await sb.from("intelligence_items").select("id,item_type,full_brief,provenance_status").eq("id", itemId).single();
  const floor = floorOf(item.item_type); const isExempt = exempt(item.item_type);
  const { data: existing } = await sb.from("section_claim_provenance").select("id,section_row_id,claim_text,claim_kind,source_span,source_id,search_result_id,source_tier_at_grounding").eq("intelligence_item_id", itemId);
  const { data: caps } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt").eq("intelligence_item_id", itemId);
  const capL = (caps || []).filter((c) => (c.result_content_excerpt || "").length > 50);
  const { data: secs } = await sb.from("intelligence_item_sections").select("id,content_md").eq("item_id", itemId);
  const { data: ga } = await sb.from("item_gate_a_state").select("orphans,orphan_count,scanned_hash,gate_a_version").eq("intelligence_item_id", itemId).single();
  const out = { itemId, type: item.item_type, orphansBefore: ga?.orphan_count ?? 0, minted: 0, held: 0, holds: [], orphansAfter: ga?.orphan_count ?? 0, projOrphans: ga?.orphan_count ?? 0, statusBefore: item.provenance_status, statusAfter: item.provenance_status, restored: false, mismatch: [] };
  if (!ga) return out;
  const newClaims = []; const holds = [];
  for (const o of ga.orphans) {
    const tk = o.token; let made = null;
    for (const c of capL) {
      const raw = c.result_content_excerpt;
      // Shared literal coverage decision (gate-a-match.containsToken). The digit-fallback that mis-attributed
      // worded tokens ("USD 50"->"50" in a registration#, "3 May 2023"->"32023" in a CELEX id) is gone. A token
      // we cannot match literally stays orphaned (honest); lost coverage is a Gate-B labeling case.
      if (!containsToken(raw, tk)) continue;
      const pos = raw.toLowerCase().indexOf(tk.toLowerCase());
      if (pos < 0) continue; // whitespace variance between normalized match and raw text -> fail closed
      const r = resolver.resolveSpan(c.result_url); if (!r.sourceId) continue; if (!isExempt && !(r.tier != null && floor != null && r.tier <= floor)) continue;
      const span = raw.slice(Math.max(0, pos - 45), pos + Math.max(tk.length + 45, 70)).trim();
      if (!raw.includes(span)) continue;
      const sec = (secs || []).find((s) => containsToken(s.content_md, tk));
      if (!sec) continue;
      made = { section_row_id: sec.id, claim_text: `[gate-a-backfill] ${span}`, claim_kind: "FACT", source_span: span, source_id: r.sourceId, search_result_id: c.id, source_tier_at_grounding: r.tier, _token: tk };
      break;
    }
    if (made) newClaims.push(made); else holds.push(tk);
  }
  out.minted = newClaims.length; out.held = holds.length; out.holds = holds;
  const projFacts = [...existing.filter((c) => c.claim_kind === "FACT"), ...newClaims];
  const rescan = scanBrief(item.full_brief, projFacts);
  out.projOrphans = rescan.orphan_count; out.floor = isExempt ? "EXEMPT" : "T" + floor;
  if (!execute || newClaims.length === 0) return out;
  // Upsert fresh gate_a_state BEFORE the ledger insert so the insert-trigger re-validate sees current-hash
  // clean state and can restore. If the ledger insert throws (e.g. guard_provenance_flip on an unverified
  // item), REVERT the optimistic upsert to pre-mint state — otherwise gate_a would report orphan_count=0
  // with no backing claims (a false criterion-7 pass). Then rethrow so the caller holds the item.
  await sb.from("item_gate_a_state").upsert({ intelligence_item_id: itemId, scanned_hash: rescan.scanned_hash, orphan_count: rescan.orphan_count, orphans: rescan.orphans, gate_a_version: rescan.gate_a_version, scanned_at: new Date().toISOString() }, { onConflict: "intelligence_item_id" });
  const incoming = [...existing, ...newClaims.map(({ _token, ...c }) => c)];
  let res;
  try {
    res = await applyLedgerDiff(sb, itemId, diffLedger(existing, incoming), { nowIso: new Date().toISOString() });
  } catch (e) {
    await sb.from("item_gate_a_state").upsert({ intelligence_item_id: itemId, scanned_hash: ga.scanned_hash, orphan_count: ga.orphan_count, orphans: ga.orphans, gate_a_version: ga.gate_a_version, scanned_at: new Date().toISOString() }, { onConflict: "intelligence_item_id" });
    throw e;
  }
  out.added = res.applied.added;
  const { data: after } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
  const { data: gaAfter } = await sb.from("item_gate_a_state").select("orphan_count,scanned_hash").eq("intelligence_item_id", itemId).single();
  out.statusAfter = after.provenance_status; out.orphansAfter = gaAfter.orphan_count;
  out.restored = item.provenance_status !== "verified" && after.provenance_status === "verified";
  if (gaAfter.orphan_count !== rescan.orphan_count || gaAfter.scanned_hash !== rescan.scanned_hash) out.mismatch.push(`gate_a write drift: oc ${gaAfter.orphan_count}/${rescan.orphan_count}`);
  if (readback || out.restored) {
    const { data: claimsAfter } = await sb.from("section_claim_provenance").select("id,source_span,source_id,search_result_id,section_row_id,claim_text").eq("intelligence_item_id", itemId).eq("claim_kind", "FACT");
    const capById = new Map(capL.map((c) => [c.id, c])); const secById = new Map((secs || []).map((s) => [s.id, s]));
    for (const nc of newClaims) {
      const row = (claimsAfter || []).find((r) => norm(r.claim_text) === norm(nc.claim_text));
      if (!row) { out.mismatch.push(`missing row: ${nc._token}`); continue; }
      const cap = capById.get(row.search_result_id);
      if (!(cap && cap.result_content_excerpt.includes(row.source_span))) out.mismatch.push(`span !verbatim: ${nc._token}`);
      const rr = resolver.resolveSpan(cap?.result_url || ""); if (rr.sourceId !== row.source_id) out.mismatch.push(`source mismatch: ${nc._token}`);
      const sec = secById.get(row.section_row_id); if (!(sec && containsToken(sec.content_md, nc._token))) out.mismatch.push(`section !contains: ${nc._token}`);
      if (!containsToken(row.source_span, nc._token)) out.mismatch.push(`span !literal-contains token: ${nc._token}`);
    }
    out.readback = true;
  }
  return out;
}

// --scale: mint every orphaned item (regional_data first). Standing rails: 10-batch first with full
// read-back, then 5% attribution sampling PLUS full read-back on every restoring item; fail-closed hold
// list on per-item errors; immediate STOP (exit 3) on any attribution mismatch (corpus-corruption class).
if (process.argv.includes("--scale")) {
  const { data: states } = await sb.from("item_gate_a_state").select("intelligence_item_id").gt("orphan_count", 0);
  const ids = []; let skippedUnverified = 0;
  for (const st of states || []) {
    const { data: it } = await sb.from("intelligence_items").select("id,item_type,provenance_status").eq("id", st.intelligence_item_id).maybeSingle();
    if (!it) continue;
    // The 'unverified' residue clears only via the sanctioned INSERT-origin path (guard_provenance_flip /
    // reconciler DDL window) — minting claims on them would only be guard-blocked-and-reverted. Skip.
    if (it.provenance_status === "unverified") { skippedUnverified++; continue; }
    ids.push(it);
  }
  if (skippedUnverified) console.log(`skipped ${skippedUnverified} unverified residue items (sanctioned-path only)`);
  ids.sort((a, b) => (a.item_type === "regional_data" ? 0 : 1) - (b.item_type === "regional_data" ? 0 : 1));
  console.log(`--scale over ${ids.length} orphaned items (regional_data first) | execute=${EXECUTE}`);
  const SAMPLE_EVERY = 20; // 5%
  let processed = 0, totalMinted = 0, restored = 0, sampledRB = 0, projFullClears = 0, itemsWithHolds = 0, totalHeldTokens = 0;
  const errHolds = [];
  for (const it of ids) {
    const inTen = processed < 10;
    const doRB = EXECUTE && (inTen || processed % SAMPLE_EVERY === 0);
    let r;
    try { r = await mintItem(it.id, { execute: EXECUTE, readback: doRB }); }
    catch (e) { errHolds.push({ id: it.id.slice(0, 8), type: it.item_type, error: String(e?.message || e).slice(0, 120) }); processed++; continue; }
    if (r.mismatch.length) {
      console.log(`\n!!! ATTRIBUTION MISMATCH on ${it.id.slice(0, 8)} (${it.item_type}) — STOP-class corpus-corruption signal:`);
      console.log(`    ${JSON.stringify(r.mismatch.slice(0, 8))}`);
      console.log(`Halted after ${processed} clean items. minted=${totalMinted} restored=${restored}. No further writes.`);
      process.exit(3);
    }
    if (r.readback) sampledRB++;
    totalMinted += r.minted; if (r.restored) restored++;
    if (r.held) { itemsWithHolds++; totalHeldTokens += r.held; }
    if (!EXECUTE && r.projOrphans === 0) projFullClears++;
    processed++;
    if (processed === 10 && EXECUTE) console.log(`=== 10-BATCH CHECKPOINT clean: minted=${totalMinted} restored=${restored}. Scaling on. ===`);
    if (processed % 100 === 0) console.log(`  ...${processed}/${ids.length} | minted=${totalMinted} restored=${restored} sampledRB=${sampledRB} errHolds=${errHolds.length}`);
  }
  console.log(`\n=== SCALE ${EXECUTE ? "COMPLETE" : "DRY-RUN"} ===`);
  console.log(`items processed:        ${processed}/${ids.length}`);
  console.log(`claims minted:          ${totalMinted}${EXECUTE ? "" : " (projected)"}`);
  if (EXECUTE) console.log(`items restored→verified: ${restored}`); else console.log(`items projected full-clear: ${projFullClears}`);
  console.log(`items with held tokens: ${itemsWithHolds} | held tokens total: ${totalHeldTokens} (stay quarantined — re-capture triage)`);
  console.log(`sampled 4-axis read-backs: ${sampledRB} (all clean)`);
  console.log(`per-item errors held:   ${errHolds.length}${errHolds.length ? " -> " + JSON.stringify(errHolds.slice(0, 12)) : ""}`);
  process.exit(0);
}

if (!itemId) { console.log("no item selected"); process.exit(1); }
const single = await mintItem(itemId, { execute: EXECUTE, readback: true });
console.log(`ITEM ${itemId.slice(0, 8)} type=${single.type} floor=${single.floor} status=${single.statusBefore} | orphans=${single.orphansBefore}`);
console.log(`  minted ${single.minted} FACT claims | hold ${single.held}${single.held ? " -> " + JSON.stringify(single.holds.slice(0, 8)) : ""}`);
console.log(`  projected orphan_count after mint: ${single.projOrphans} (was ${single.orphansBefore})`);
if (!EXECUTE) { console.log("DRY-RUN — no writes. Add --execute to apply."); process.exit(0); }
console.log(`\n=== READ-BACK ===`);
console.log(`  status: ${single.statusBefore} -> ${single.statusAfter} | orphan_count now: ${single.orphansAfter} | restored: ${single.restored}`);
if (single.mismatch.length) { console.log(`  !!! ATTRIBUTION MISMATCH (STOP-class): ${JSON.stringify(single.mismatch.slice(0, 10))}`); process.exit(3); }
console.log(`  ALL AXES CLEAN.`);
