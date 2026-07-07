import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { isErrorBody } = await import("../../src/lib/sources/entity-gate.mjs");
const audit = JSON.parse(readFileSync(resolve(ROOT, "scripts", "_plans", "completeness-audit.json"), "utf8"));
const items = await readAll("intelligence_items", "id,legacy_id,source_url,provenance_status,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const pool = await readAll("agent_run_searches", "id,intelligence_item_id,result_url,result_content_excerpt");
const capById = new Map(pool.map((r) => [r.id, r]));
const facts = (await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id")).filter((c) => c.claim_kind === "FACT" && c.search_result_id);
const affected = new Set();
for (const x of audit.cat1) affected.add(x.id);
for (const f of facts) { const cap = capById.get(f.search_result_id); if (cap && isErrorBody(cap.result_content_excerpt || "")) affected.add(f.intelligence_item_id); }
const urls = new Set();
for (const id of affected) { const it = byId.get(id); if (it && !it.is_archived && it.source_url) urls.add(it.source_url); }
const API = /federalregister\.gov|ecfr\.gov/i, BOT = /iea\.org|iata\.org|adb\.org|itf-oecd\.org|sciencedirect\.com|ilo\.org|iopscience|smartfreightcentre|un\.org|c40\.org|spglobal|congress\.gov|zawya/i, JS = /customs\.go\.jp|gob\.mx|sdgs\.un\.org|portwatch/i, DEAD = /eur-lex\.europa\.eu/i;
let api = 0, bot = 0, js = 0, dead = 0, other = 0;
for (const u of urls) { if (API.test(u)) api++; else if (JS.test(u)) js++; else if (DEAD.test(u)) dead++; else if (BOT.test(u)) bot++; else other++; }
console.log(`affected items: ${affected.size} | distinct primary URLs to re-fetch: ${urls.size}`);
console.log(`  API-not-HTML (0 Browserless units): ${api}`);
console.log(`  bot-walled (stealth, ~2 units ea): ${bot}`);
console.log(`  JS-shell (render, ~1 unit ea): ${js}`);
console.log(`  dead/seek-more (web_search first, 0-1 unit): ${dead}`);
console.log(`  other (direct/1 unit ea): ${other}`);
const unitsLo = bot * 1 + js * 1 + other * 1 + dead * 0 + 7;
const unitsHi = bot * 2 + js * 1 + other * 1 + dead * 1 + 14;
console.log(`  BROWSERLESS UNIT ESTIMATE: ~${unitsLo}-${unitsHi} units (of 20,000/mo = ${(unitsLo / 20000 * 100).toFixed(1)}-${(unitsHi / 20000 * 100).toFixed(1)}%), incl cat-1 re-fetch`);
console.log(`  Sonnet re-ground after: ~${affected.size} items x ~$0.25 = ~$${(affected.size * 0.25).toFixed(2)}`);
