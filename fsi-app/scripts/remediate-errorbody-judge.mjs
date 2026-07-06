/** ERROR-BODY CLAIM REMEDIATION — JUDGE (jiti, READ-ONLY, emits plan). Dispatch item 1 (2026-07-06). For every
 *  FACT claim whose grounding capture classifies error-body (the flagged 27-item set minus the 2 already
 *  closed, INCLUDING the 20 just-released), decide: 4b RE-POINT when a GENUINE (non-error) capture in the item's
 *  OWN pool verbatim-contains the span (re-point search_result_id + re-resolve tier from that host), else
 *  INVALIDATE. Emits scripts/_plans/errorbody-remediation-<ts>.json. Pure-node applier does the writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";
import { isErrorBody } from "../src/lib/sources/entity-gate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { defaultTierForHost } = await jiti.import("@/lib/sources/host-authority.ts");
const sb = readClient();
const ALREADY_CLOSED = new Set(); // the 2 named breaches' "Page Not Found" FACTs were fixed separately; do NOT
// skip the whole item — their OTHER error-grounded FACTs (isErrorBody) must still be remediated (residual-2 fix).
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const keyOf = (id) => byId.get(id)?.legacy_id || id.slice(0, 8);
// full pool per item
const pool = await readAll("agent_run_searches", "id,intelligence_item_id,result_url,result_content_excerpt");
const poolByItem = new Map();
for (const r of pool) { if (!poolByItem.has(r.intelligence_item_id)) poolByItem.set(r.intelligence_item_id, []); poolByItem.get(r.intelligence_item_id).push(r); }
const capById = new Map(pool.map((r) => [r.id, r]));
const facts = (await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id,source_span,source_tier_at_grounding")).filter((c) => c.claim_kind === "FACT" && c.search_result_id);

const plan = [];
for (const f of facts) {
  const cap = capById.get(f.search_result_id);
  if (!cap || !isErrorBody(cap.result_content_excerpt || "")) continue;      // only error-body-grounded FACTs
  const it = byId.get(f.intelligence_item_id);
  if (!it || it.is_archived || ALREADY_CLOSED.has(it.id.slice(0, 8))) continue;
  const span = String(f.source_span || "").toLowerCase().trim();
  // 4b re-point: a GENUINE capture in THIS item's pool that verbatim-contains the span
  let repoint = null;
  if (span.length >= 12) {
    for (const g of poolByItem.get(f.intelligence_item_id) || []) {
      if (g.id === f.search_result_id) continue;
      if (isErrorBody(g.result_content_excerpt || "")) continue;
      if ((g.result_content_excerpt || "").toLowerCase().includes(span)) { repoint = g; break; }
    }
  }
  if (repoint) {
    plan.push({ claimId: f.id, itemId: f.intelligence_item_id, itemKey: keyOf(f.intelligence_item_id), action: "repoint",
      newSearchResultId: repoint.id, newTier: defaultTierForHost(hostOf(repoint.result_url)), newHost: hostOf(repoint.result_url),
      oldTier: f.source_tier_at_grounding, span: String(f.source_span || "").slice(0, 60) });
  } else {
    plan.push({ claimId: f.id, itemId: f.intelligence_item_id, itemKey: keyOf(f.intelligence_item_id), action: "invalidate",
      errHost: hostOf(cap.result_url), span: String(f.source_span || "").slice(0, 60) });
  }
}
const touched = new Set(plan.map((p) => p.itemId));
const dir = resolve(ROOT, "scripts", "_plans"); mkdirSync(dir, { recursive: true });
const file = resolve(dir, `errorbody-remediation-${new globalThis.Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ plan, items: [...touched] }, null, 2));
const repoints = plan.filter((p) => p.action === "repoint");
console.log(`\n=== ERROR-BODY CLAIM REMEDIATION JUDGE ===`);
console.log(`  error-body-grounded FACT claims: ${plan.length} across ${touched.size} items`);
console.log(`  → 4b RE-POINT: ${repoints.length} | INVALIDATE: ${plan.length - repoints.length}`);
for (const p of repoints) console.log(`     REPOINT ${p.itemKey} claim ${p.claimId.slice(0, 8)} → ${p.newHost} (T${p.newTier}) span="${p.span}"`);
console.log(`  plan: ${file}`);
console.log(`  APPLY: node scripts/apply-errorbody-remediation.mjs "${file}" --apply`);
process.exit(0);
