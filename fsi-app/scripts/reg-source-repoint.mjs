// RE-POINT a regulation item's primary source from a portal / landing page to the ENACTED TEXT.
//
// A regulation's canonical primary IS its enacted text (EUR-Lex CELEX/ELI, Federal Register document,
// official journal), not a topic / overview landing page. The truncation fix (2026-06-23) can only surface
// the law's qualifications when the registered source actually contains them — the PPWR prove-on-one found
// efdb3390 pointed at a DG-ENV topic page, so the 2038 ban / per-plant averaging were not in the source.
//
// This is the PROTOTYPE of the backward "re-point-then-re-ground" pass: the corpus diagnostic
// (scripts/_diag/_reg-source-audit.mjs) found 17+ reg-family items portal-sourced (CBAM, CSRD, EUDR,
// Fit-for-55, EU Taxonomy, ETS, …). The backward batch re-points each to enacted text via this guarded
// pattern, then re-grounds (generateBriefFromStored is free where text is already stored). IDEMPOTENT: a
// no-op when the source already matches. Routed through guardedUpdate (rule 015) — snapshots the prior row.
//
//   node scripts/reg-source-repoint.mjs [itemIdPrefix] [enactedUrl]
//   (defaults: efdb3390  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040  — PPWR)
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(ROOT + "/.env.local");

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const itemPrefix = process.argv[2] || "efdb3390";
const enactedUrl = process.argv[3] || "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R0040";

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,source_url,provenance_status");
const it = items.find((r) => r.id.startsWith(itemPrefix));
if (!it) { console.error(`item ${itemPrefix}* not found`); process.exit(1); }
if (!REG_FAMILY.includes(it.item_type)) { console.error(`refusing: ${it.id.slice(0, 8)} is item_type=${it.item_type}, not a regulation-family item`); process.exit(1); }
console.log(`BEFORE  ${it.id.slice(0, 8)} [${it.provenance_status}] type=${it.item_type}\n  source=${it.source_url}`);
if (it.source_url === enactedUrl) { console.log("already points at the enacted text — no write"); process.exit(0); }

const res = await guardedUpdate(
  "intelligence_items",
  (qb) => qb.eq("id", it.id),
  { source_url: enactedUrl },
  { cite: { skill: "environmental-policy-and-innovation", reason: "re-point regulation primary from portal/landing page to enacted text (enacted-text-is-primary doctrine); prerequisite for truncation-fix grounding on the actual law" } }
);
console.log(`AFTER   updated=${res.updated}\n  source=${enactedUrl}\n  snapshot=${res.snapshot}`);
process.exit(0);
