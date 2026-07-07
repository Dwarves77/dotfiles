/** BACKLOG TRIAGE + DISPOSE (within-bound + crossed quarantined items not yet deferred).
 *  Same screens + rules as the E2 69: dup-of-verified / off-vertical-portal → ERASE (snapshot, reversible);
 *  portal mis-ingested as item → RECLASSIFY-to-source (source-registration invariant); genuine keeper →
 *  DEFER (2026-07-02, Phase-3 resolution, RD-6-valid). Executes directly (snapshot IS the safety); reports
 *  what it did. GOVERNING: remediation-discipline (research-or-erase + RD-6 + roadblock) + source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { readClient, readAll, guardedUpdate, reclassifyToSource } from "../lib/db.mjs";
import { assertValidDeferral } from "../lib/deferral.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const now = new globalThis.Date(); const nowMs = now.getTime();
const DEFERRED_UNTIL = "2026-07-02T00:00:00.000Z"; // align the whole backlog to the existing 59-deferral clock

// ── load not-yet-deferred quarantined items (within-bound + any crossed) ──
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,source_url,source_id,full_brief", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const flags = await readAll("integrity_flags", "subject_ref,created_by,recommended_actions,status", { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const deferredItems = new Set();
for (const f of flags) {
  if (f.created_by !== "disposition_deferred") continue;
  let pl = null; const ra = f.recommended_actions;
  if (Array.isArray(ra)) for (const e of ra) { if (e && e.deferral) { pl = e.deferral; break; } }
  if (pl && pl.deferred_until && new globalThis.Date(pl.deferred_until).getTime() > nowMs) deferredItems.add(f.subject_ref);
}
const targets = items.filter((it) => !deferredItems.has(it.id));

// ── corpus screens (no network) ──
// canon MUST keep the query — EUR-Lex et al. carry the document id in ?uri=CELEX:... ; stripping it
// collapses every distinct legal-content URL to one key and falsely flags different regs as duplicates.
const canon = (u) => { try { const x = new URL(u); const q = x.search ? "?" + [...new URLSearchParams(x.search).entries()].sort().map(([k, v]) => `${k}=${v}`).join("&") : ""; return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + q).toLowerCase(); } catch { return ""; } };
const normTitle = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const byUrl = new Map(), byTitle = new Map();
for (const it of items) { const cu = canon(it.source_url); if (cu) (byUrl.get(cu) || byUrl.set(cu, []).get(cu)).push(it); const nt = normTitle(it.title); if (nt) (byTitle.get(nt) || byTitle.set(nt, []).get(nt)).push(it); }
// include ARCHIVED + verified items in the dup index too (a dup of an archived/verified twin is still a dup)
const allItems = await readAll("intelligence_items", "id,legacy_id,title,provenance_status,source_url,is_archived");
for (const it of allItems) { const cu = canon(it.source_url); if (cu) (byUrl.get(cu) || byUrl.set(cu, []).get(cu)).push(it); const nt = normTitle(it.title); if (nt) (byTitle.get(nt) || byTitle.set(nt, []).get(nt)).push(it); }
const searches = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const realPool = new Map(); for (const s of searches) if ((s.result_content_excerpt || "").length > 200) realPool.set(s.intelligence_item_id, (realPool.get(s.intelligence_item_id) || 0) + 1);

const PORTAL_RE = /(\/search|\/datasets?|\/data\b|\/explore|\/browse|\/results|\/index|\/home$|\/portal|\/library\/?$|\/publications\/?$|\/news\/?$)/i;
function sourceShape(u) { if (!u) return "no-url"; let x; try { x = new URL(u); } catch { return "unparseable"; } const path = x.pathname.replace(/\/+$/, ""); if (!path) return "homepage-only"; if (PORTAL_RE.test(x.pathname) && path.split("/").filter(Boolean).length <= 2) return "portal/listing"; if (x.search && path.split("/").filter(Boolean).length <= 1) return "query-listing"; return "document"; }
const isPortal = (shape) => ["homepage-only", "portal/listing", "query-listing", "no-url", "unparseable"].includes(shape);
// CONSERVATIVE off-vertical signals (broad-scope rule: only CLEAR non-freight-sustainability markers; never
// erase a real on-vertical item on a vague vertical guess). Erase off-vertical ONLY when ALSO a portal source.
const OFFVERT_RE = /\b(stormwater|wildfire|smoke|air quality|drinking water|rikers|ice office|immigration|deportation|lawsuit|vaccine|covid|pandemic|election|ballot|gdpr|crypto|blockchain|nft|abortion|firearm|gun control|opioid|cannabis|marijuana)\b/i;

const dispositions = { ERASE_DUP: [], ERASE_OFFVERT: [], RECLASSIFY: [], DEFER: [] };
for (const it of targets) {
  const cu = canon(it.source_url);
  const urlTwins = (byUrl.get(cu) || []).filter((x) => x.id !== it.id);
  const titleTwins = (byTitle.get(normTitle(it.title)) || []).filter((x) => x.id !== it.id);
  const verifiedTwin = [...urlTwins, ...titleTwins].find((x) => x.provenance_status === "verified");
  const shape = sourceShape(it.source_url);
  const offVert = OFFVERT_RE.test(it.title || "");
  const rec = { it, shape, twin: verifiedTwin ? (verifiedTwin.legacy_id || verifiedTwin.id.slice(0, 8)) : null, pool: realPool.get(it.id) || 0 };
  if (verifiedTwin) { rec.reason = `duplicate of VERIFIED ${rec.twin} (same ${urlTwins.length ? "url" : "title"})`; dispositions.ERASE_DUP.push(rec); }
  else if (offVert && isPortal(shape)) { rec.reason = `off-vertical (${(it.title || "").match(OFFVERT_RE)?.[0]}) + portal source (${shape})`; dispositions.ERASE_OFFVERT.push(rec); }
  // NOTE: a homepage/portal SOURCE is NOT auto-reclassified here. This population is reg-heavy (real regs
  // with a thin/homepage source link, NOT institution-portals mis-ingested as items like E2's Drawdown/
  // ZEMBA). Auto-reclassify would wrongly ARCHIVE real regulations. So portal-source items DEFER (kept, not
  // archived — no source-registration-invariant violation); the roadblock→alternative fallback re-sources
  // them during grounding, and a genuine source-not-item surfaces as a counsel-hold for human reclassify.
  else { rec.reason = `real ${shape} source, on-vertical, not a corpus dup — keeper, network-gated grounding`; dispositions.DEFER.push(rec); }
}

console.log(`\n===== BACKLOG TRIAGE + DISPOSE (${APPLY ? "APPLY" : "DRY-RUN"}) — ${targets.length} not-yet-deferred quarantined =====`);
for (const [k, arr] of Object.entries(dispositions)) console.log(`  ${k.padEnd(16)} ${arr.length}`);
if (!APPLY) { for (const [k, arr] of Object.entries(dispositions)) { console.log(`\n── ${k} (${arr.length}) ──`); for (const r of arr) console.log(`  ${(r.it.legacy_id || r.it.id.slice(0, 8)).padEnd(48)} ${r.it.item_type.padEnd(15)} ${r.reason}`); } console.log("\nDRY-RUN — pass --apply."); process.exit(0); }

// ── APPLY ──
const cite = { skill: "remediation-discipline", reason: "backlog research-or-erase: snapshot-reversible disposition per E2 rules (dup/off-vertical erase, portal reclassify, keeper defer)" };
const nowIso = now.toISOString();
const deferPayload = (it) => ({ reason: `Genuine keeper blocked on the network-stable generation lane (Anthropic/Browserless large-call instability); awaits the e2-phase3-ground.mjs generate/reground pass on a stable lane.`, deferred_until: DEFERRED_UNTIL, owner: "operator (Jason)", resolution_event: `E2 Phase 3 grounding on the network-stable lane: node scripts/e2-phase3-ground.mjs --apply (+ phase2-reground for regs)` });
const log = { erased_dup: [], erased_offvert: [], reclassified: [], deferred: [], errors: [] };

for (const r of [...dispositions.ERASE_DUP]) {
  try { await guardedUpdate("intelligence_items", (qb) => qb.eq("id", r.it.id), { is_archived: true, archive_reason: "duplicate_of_verified", archived_date: nowIso, archive_note: `duplicate of verified ${r.twin}; twin retained` }, { cite }); log.erased_dup.push(r.it.legacy_id || r.it.id.slice(0, 8)); }
  catch (e) { log.errors.push(`dup ${r.it.id.slice(0, 8)}: ${e.message.slice(0, 50)}`); }
}
for (const r of [...dispositions.ERASE_OFFVERT]) {
  try { await guardedUpdate("intelligence_items", (qb) => qb.eq("id", r.it.id), { is_archived: true, archive_reason: "off_vertical", archived_date: nowIso, archive_note: r.reason }, { cite }); log.erased_offvert.push(r.it.legacy_id || r.it.id.slice(0, 8)); }
  catch (e) { log.errors.push(`offvert ${r.it.id.slice(0, 8)}: ${e.message.slice(0, 50)}`); }
}
for (const r of [...dispositions.RECLASSIFY]) {
  try { const res = await reclassifyToSource(r.it.id, { url: r.it.source_url, name: r.it.title?.slice(0, 80), base_tier: 7 }, { cite }); log.reclassified.push(`${r.it.legacy_id || r.it.id.slice(0, 8)}→src ${res.source_id.slice(0, 8)}`); }
  catch (e) { log.errors.push(`reclassify ${r.it.id.slice(0, 8)}: ${e.message.slice(0, 60)}`); }
}
const insertedFlags = [];
for (const r of [...dispositions.DEFER]) {
  const pl = deferPayload(r.it);
  try {
    assertValidDeferral(pl, now);
    const { data, error } = await sb.from("integrity_flags").insert({ category: "data_quality", subject_type: "item", subject_ref: r.it.id, status: "open", created_by: "disposition_deferred", description: `Lane-#4 deferral (→${DEFERRED_UNTIL.slice(0, 10)}): genuine keeper blocked on the network-stable Phase 3 grounding lane; self-resurrects if not run by the clock.`, recommended_actions: [{ deferral: pl }] }).select("id").single();
    if (error) { log.errors.push(`defer ${r.it.id.slice(0, 8)}: ${error.message.slice(0, 50)}`); continue; }
    insertedFlags.push(data.id); log.deferred.push(r.it.legacy_id || r.it.id.slice(0, 8));
  } catch (e) { log.errors.push(`defer ${r.it.id.slice(0, 8)}: ${e.message.slice(0, 50)}`); }
}

const snapDir = resolve(ROOT, "scripts/_snapshots"); mkdirSync(snapDir, { recursive: true });
writeFileSync(resolve(snapDir, `backlog-dispose-${nowMs}.json`), JSON.stringify({ reversal_deferral_flag_ids: insertedFlags, log }, null, 2));
console.log(`\n=== DONE ===`);
console.log(`ERASE-dup:      ${log.erased_dup.length}  ${log.erased_dup.join(", ")}`);
console.log(`ERASE-offvert:  ${log.erased_offvert.length}  ${log.erased_offvert.join(", ")}`);
console.log(`RECLASSIFY:     ${log.reclassified.length}  ${log.reclassified.join(", ")}`);
console.log(`DEFER:          ${log.deferred.length}`);
console.log(`errors:         ${log.errors.length}  ${log.errors.join(" | ")}`);
process.exit(0);
