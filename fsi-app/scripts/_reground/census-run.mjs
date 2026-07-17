#!/usr/bin/env node
// census-run.mjs — total-corpus census (operator ruling 2026-07-16). Live items are classified $0 from
// provenance_status; ARCHIVED items get a Haiku verdict that VERIFIES the archive_reason (archive_correct vs
// review_valuable-wrongly-archived) — the archive-endgame input. READ-ONLY over items (writes only corpus_census).
// Metered through the spend-guard (ticket + $15 ceiling). Modes:
//   --audit N   classify N archived items, PRINT for hand-verification, write them (the accuracy gate before scaling)
//   --run       classify ALL not-yet-classified archived items, halt at the ceiling
// Usage: node scripts/_reground/census-run.mjs (--audit 10 | --run) [--ceiling=15]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const AUDIT = (() => { const a = process.argv.find((x) => x.startsWith("--audit")); if (!a) return 0; const n = a.split("=")[1] || process.argv[process.argv.indexOf(a) + 1]; return parseInt(n, 10) || 10; })();
const RUN = process.argv.includes("--run");
const CEILING = (() => { const a = process.argv.find((x) => x.startsWith("--ceiling=")); return a ? Number(a.slice(10)) : 15; })();
if (!AUDIT && !RUN) { console.error("usage: census-run.mjs (--audit N | --run) [--ceiling=15]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedInsert } = await jiti.import("../lib/db.mjs");
const { spendStream, setSpendTicket, resetSpendTicket, spentUsd, logSpendRun } = await jiti.import("../../src/lib/llm/spend-client.ts");
const sb = readClient();

const SYSTEM = `You verify ARCHIVE classifications for a freight-sustainability intelligence platform (Caro's Ledge).
Every item below was ARCHIVED with an archive_reason. Your job: decide whether that archive is CORRECT, or whether the
item looks like a VALUABLE, UNIQUE intelligence item (a real regulation / directive / standard / market signal /
research finding relevant to freight sustainability) that may have been WRONGLY archived and deserves human review.
- "archive_correct": the archive_reason fits — the item is a source/portal page, a duplicate of another item, an error
  page or non-document artifact, an off-vertical topic, or otherwise NOT a standalone intelligence item.
- "review_valuable": the title/metadata describe a genuine, specific, in-vertical regulatory/market/research item that
  should probably be a live intelligence item, so the archive looks like a mistake worth a human's second look.
When unsure, prefer "review_valuable" (favor human review over silently accepting an archive).
Output ONLY a JSON object: {"verdict":"archive_correct"|"review_valuable","confidence":0-100,"rationale":"one sentence"}.`;

const bucket = (it) => it.provenance_status === "verified" ? "verified" : it.provenance_status === "quarantined" ? "quarantined" : (it.archive_reason || "archived_unspecified");

// 1. LIVE items: $0 census rows from provenance_status (idempotent — skip already present).
const all = await readAll("intelligence_items", "id,legacy_id,title,item_type,is_archived,provenance_status,archive_reason,source_url,jurisdiction_iso", {});
const { data: already } = await sb.from("corpus_census").select("intelligence_item_id");
const done = new Set((already || []).map((r) => r.intelligence_item_id));
const live = all.filter((x) => !x.is_archived);
const archived = all.filter((x) => x.is_archived);
if (!done.size) {
  const cite = { skill: "remediation-discipline", reason: "corpus census: $0 live-item classification from provenance_status" };
  let n = 0;
  for (const it of live) { if (done.has(it.id)) continue; await guardedInsert("corpus_census", { intelligence_item_id: it.id, is_archived: false, provenance_status: it.provenance_status, archive_reason: null, census_class: bucket(it), haiku_verdict: null, haiku_confidence: null, haiku_rationale: null, classified_by: "census:provenance" }, { cite }); n++; }
  console.log(`live items classified ($0): ${n}`);
}

// 2. ARCHIVED items: Haiku verdict verifying the archive_reason. Metered, ceiling-bounded.
const pending = archived.filter((x) => !done.has(x.id));
const targets = AUDIT ? pending.slice(0, AUDIT) : pending;
console.log(`\n===== CENSUS ${AUDIT ? `AUDIT (${targets.length})` : `RUN (${targets.length} of ${pending.length} pending)`}  ceiling $${CEILING} =====`);
const citeH = { skill: "remediation-discipline", reason: "corpus census: Haiku verification of archive_reason (archive_correct vs review_valuable) — read-only classification, archive-endgame input" };
let classified = 0, review = 0;
for (const it of targets) {
  if (spentUsd() >= CEILING) { console.log(`\nHALT: spend $${spentUsd().toFixed(3)} reached ceiling $${CEILING}. ${classified} classified.`); break; }
  const user = `title: ${it.title}\nitem_type: ${it.item_type}\narchive_reason: ${it.archive_reason || "(none)"}\nsource_url: ${it.source_url}\njurisdiction: ${JSON.stringify(it.jurisdiction_iso)}`;
  setSpendTicket({ purpose: `census verify: ${it.legacy_id || it.id.slice(0, 8)}`, itemId: it.id, failureClasses: ["census_classification"], necessity: { rehomableFacts: 0 }, disposition: null, budgetCapUsd: CEILING, authorizationRef: "corpus-census-2026-07-16" });
  let verdict = "review_valuable", confidence = 0, rationale = "parse-failed (defaulted to review)";
  try {
    const { text } = await spendStream({ system: SYSTEM, user, model: "claude-haiku-4-5-20251001", maxTokens: 200 });
    const m = text.match(/\{[\s\S]*\}/); const o = m ? JSON.parse(m[0]) : {};
    verdict = o.verdict === "archive_correct" ? "archive_correct" : "review_valuable"; confidence = Math.max(0, Math.min(100, Math.round(o.confidence || 0))); rationale = String(o.rationale || "").slice(0, 300);
  } catch (e) { rationale = `error: ${String(e.message).slice(0, 120)}`; }
  try { await guardedInsert("corpus_census", { intelligence_item_id: it.id, is_archived: true, provenance_status: it.provenance_status, archive_reason: it.archive_reason, census_class: bucket(it), haiku_verdict: verdict, haiku_confidence: confidence, haiku_rationale: rationale, classified_by: "census:haiku" }, { cite: citeH }); }
  catch (e) { if (/duplicate key/.test(String(e.message))) { continue; } throw e; } // idempotent: skip already-classified
  await logSpendRun(it.id, "success", null).catch(() => {}); // drain the per-item spend ledger (spend-guard invariant)
  classified++; if (verdict === "review_valuable") review++;
  if (AUDIT) console.log(`  [${verdict.padEnd(15)} ${String(confidence).padStart(3)}] ${String(it.legacy_id || it.id.slice(0, 8)).slice(0, 22).padEnd(22)} reason=${(it.archive_reason || "-").slice(0, 20).padEnd(20)} | ${it.title.slice(0, 46)}  :: ${rationale.slice(0, 70)}`);
}
resetSpendTicket();
console.log(`\nclassified ${classified} archived (${review} review_valuable, ${classified - review} archive_correct). spend this run: $${spentUsd().toFixed(4)}`);
if (AUDIT) console.log(`\nAUDIT MODE — hand-verify the ${classified} rows above. If accuracy is good, run: node scripts/_reground/census-run.mjs --run`);
process.exit(0);
