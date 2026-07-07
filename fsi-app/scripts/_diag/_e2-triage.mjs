/** READ-ONLY E2 triage DRY-RUN (no mutations, no network — DB reads + validate RPC only).
 *  Classifies every undispositioned past-bound item as ERASE / KEEP-GROUND / RELABEL and SHOWS THE SCREEN
 *  for BOTH dispositions (duplicate-against-corpus · on-vertical · real-source-vs-portal-artifact ·
 *  stored-pool · claim-ledger) so the keep set is the residue of a real triage, not a default.
 *  Set anchored to scripts/verify/quarantine-disposition-audit.mjs (same undispositioned definition). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const BOUND = 14 * 24 * 3600 * 1000, now = Date.now();

// ── undispositioned past-bound set (mirror the audit) ───────────────────────────────────────────────
const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,priority,provenance_status,source_url,source_id,full_brief,is_archived",
  { match: (q) => q.eq("is_archived", false) });
const live = items.filter((it) => it.provenance_status === "quarantined");
const flags = await readAll("integrity_flags", "subject_ref,created_at,status,created_by",
  { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const earliest = new Map();
for (const f of flags) { const ex = earliest.get(f.subject_ref); if (!ex || f.created_at < ex) earliest.set(f.subject_ref, f.created_at); }
const deferred = new Set(flags.filter((f) => f.created_by === "disposition_deferred").map((f) => f.subject_ref));
const pastbound = live.filter((it) => { const t = earliest.get(it.id); return t && (now - new Date(t).getTime()) > BOUND && !deferred.has(it.id); });

// ── corpus-wide signals for the screen (no network) ─────────────────────────────────────────────────
const canon = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return ""; } };
const normTitle = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// duplicate index: canonical-url -> [items], norm-title -> [items], across ALL non-archived items
const byUrl = new Map(), byTitle = new Map();
for (const it of items) {
  const cu = canon(it.source_url); if (cu) { (byUrl.get(cu) || byUrl.set(cu, []).get(cu)).push(it); }
  const nt = normTitle(it.title); if (nt) { (byTitle.get(nt) || byTitle.set(nt, []).get(nt)).push(it); }
}
// stored pool per item (generate-pool rows with real content >200ch = groundable WITHOUT a re-fetch)
const searches = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt,search_query,result_url");
const poolReal = new Map(), poolAny = new Map();
for (const s of searches) {
  poolAny.set(s.intelligence_item_id, (poolAny.get(s.intelligence_item_id) || 0) + 1);
  if ((s.result_content_excerpt || "").length > 200) poolReal.set(s.intelligence_item_id, (poolReal.get(s.intelligence_item_id) || 0) + 1);
}
// claim ledger per item
const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind");
const claimCount = new Map();
for (const c of claims) { const m = claimCount.get(c.intelligence_item_id) || {}; m[c.claim_kind] = (m[c.claim_kind] || 0) + 1; claimCount.set(c.intelligence_item_id, m); }

// portal/artifact heuristic on a URL (no fetch): homepage-only, search/listing/dataset/explorer paths.
const PORTAL_RE = /(\/search|\/datasets?|\/data\b|\/explore|\/browse|\/results|\/index|\/home$|\/portal|\/library\/?$|\/publications\/?$|\/news\/?$)/i;
function sourceShape(u) {
  if (!u) return "no-url";
  let x; try { x = new URL(u); } catch { return "unparseable"; }
  const path = x.pathname.replace(/\/+$/, "");
  if (!path || path === "") return "homepage-only";
  if (PORTAL_RE.test(x.pathname) && path.split("/").filter(Boolean).length <= 2) return "portal/listing";
  if (x.search && path.split("/").filter(Boolean).length <= 1) return "query-listing";
  return "document"; // a real deep path
}
// host/title mismatch (mistitle defect signal — e.g. an AFIR doc titled "AI Act")
function offVerticalFlag(title) {
  const t = (title || "").toLowerCase();
  // BROAD scope: only flag clear non-freight-nexus signals for human eyeball; never auto-erase on vertical.
  const signals = [/\bai act\b/, /\bgdpr\b/, /\bcrypto\b/, /\bvaccine\b/, /\belection\b/];
  return signals.some((re) => re.test(t));
}

// ── classify ────────────────────────────────────────────────────────────────────────────────────────
const rows = [];
for (const it of pastbound) {
  const cu = canon(it.source_url);
  const urlTwins = (byUrl.get(cu) || []).filter((x) => x.id !== it.id);
  const titleTwins = (byTitle.get(normTitle(it.title)) || []).filter((x) => x.id !== it.id);
  const dupTwin = [...urlTwins, ...titleTwins].find((x) => x.provenance_status === "verified")
    || urlTwins[0] || titleTwins[0] || null;
  const shape = sourceShape(it.source_url);
  const realPool = poolReal.get(it.id) || 0;
  const anyPool = poolAny.get(it.id) || 0;
  const cc = claimCount.get(it.id) || {};
  const totalClaims = Object.values(cc).reduce((a, b) => a + b, 0);
  const offVert = offVerticalFlag(it.title);

  // validate RPC for precise failure reasons (read-only)
  let fails = [];
  try { const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id }); const v = Array.isArray(vr) ? vr[0] : vr; fails = (v?.failures) || []; } catch { /* RPC shape tolerated */ }
  const reasons = new Set(fails.map((f) => `c${f.criterion}:${f.reason}`));

  // screen verdicts
  const isDup = !!dupTwin;
  const isPortal = (shape === "homepage-only" || shape === "portal/listing" || shape === "query-listing" || shape === "no-url" || shape === "unparseable");
  const belowFloorRelabelable = totalClaims > 0 && [...reasons].some((r) => r.includes("below_authority_floor")) && (cc.FACT || 0) > 0;

  let disp, why;
  if (isDup && dupTwin.provenance_status === "verified") { disp = "ERASE"; why = `duplicate of VERIFIED ${dupTwin.legacy_id || dupTwin.id.slice(0, 8)} (same ${urlTwins.length ? "url" : "title"})`; }
  else if (isPortal && totalClaims === 0) { disp = "ERASE"; why = `portal/artifact source (${shape}) + zero ledger — no real document to ground`; }
  else if (isDup) { disp = "ERASE"; why = `duplicate of ${dupTwin.provenance_status} ${dupTwin.legacy_id || dupTwin.id.slice(0, 8)} (same ${urlTwins.length ? "url" : "title"})`; }
  else if (belowFloorRelabelable) { disp = "RELABEL"; why = `below-floor FACT (${cc.FACT} FACT claims) — 1A-relabel if claim_text locatable, else ground set`; }
  else { disp = "KEEP-GROUND"; why = `real ${shape} source, not a corpus duplicate${offVert ? ", VERTICAL-REVIEW" : ", on-vertical"}; ${realPool ? `${realPool} stored pool rows (groundable, low/no fetch)` : anyPool ? `${anyPool} stub rows only (needs fetch)` : "zero ledger (needs fetch)"}`; }

  rows.push({
    key: it.legacy_id || it.id.slice(0, 8), type: it.item_type, prio: it.priority,
    disp, why, shape, dup: isDup ? (dupTwin.legacy_id || dupTwin.id.slice(0, 8)) + ":" + dupTwin.provenance_status : "",
    realPool, anyPool, claims: totalClaims, offVert, hasBrief: !!it.full_brief,
    reasons: [...reasons].join(",").slice(0, 60),
  });
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────
const split = {}; for (const r of rows) split[r.disp] = (split[r.disp] || 0) + 1;
console.log(`\n===== E2 TRIAGE DRY-RUN — ${rows.length} undispositioned past-bound (READ-ONLY, no mutation) =====`);
console.log(`SPLIT: ${JSON.stringify(split)}`);
const eraseFrac = ((split.ERASE || 0) / rows.length * 100).toFixed(0);
console.log(`erase fraction: ${split.ERASE || 0}/${rows.length} (${eraseFrac}%)  [SANITY: a near-zero erase on a raw fail-close batch flags an unapplied screen]\n`);

const show = (d) => {
  const set = rows.filter((r) => r.disp === d);
  console.log(`\n──── ${d} (${set.length}) ────`);
  for (const r of set) console.log(`  ${String(r.key).padEnd(34)} ${r.type.padEnd(14)} ${String(r.prio).padEnd(8)} ${r.why}`);
};
show("ERASE"); show("RELABEL"); show("KEEP-GROUND");

// keep-ground screen detail (prove each keep passed all three screens)
console.log(`\n──── KEEP-GROUND screen detail (dup? · shape · vertical · pool/claims) ────`);
for (const r of rows.filter((r) => r.disp === "KEEP-GROUND")) {
  console.log(`  ${String(r.key).padEnd(34)} dup=${r.dup || "none"} | shape=${r.shape.padEnd(14)} | ${r.offVert ? "VERTICAL-REVIEW" : "on-vertical"} | pool=${r.realPool}real/${r.anyPool}any claims=${r.claims}`);
}
// groundable-without-network sub-split (Phase 3 cost)
const keep = rows.filter((r) => r.disp === "KEEP-GROUND");
const cached = keep.filter((r) => r.realPool > 0).length;
console.log(`\nKEEP-GROUND fetch profile: ${cached}/${keep.length} have a stored real pool (ground reuses it, ~0 Browserless); ${keep.length - cached}/${keep.length} zero/stub ledger (need fresh fetch).`);
const vreview = rows.filter((r) => r.offVert);
if (vreview.length) console.log(`\nVERTICAL-REVIEW (eyeball; NOT auto-erased — broad scope default keeps): ${vreview.map((r) => r.key).join(", ")}`);
process.exit(0);
