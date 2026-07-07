/** READ-ONLY: detect cross-contaminated `summary` fields (the ReFuelEU 6f1e6615 class — summary says
 *  "artificial intelligence systems" but the brief is SAF). Hypothesis: a generation-time field mixup
 *  where summary got another item's content. Heuristics (high-signal, low-false-positive):
 *   (1) summary names an EU regulation NUMBER that does NOT appear in the title or full_brief;
 *   (2) summary mentions a strong topic token ("artificial intelligence", "AI Act", etc.) absent from
 *       the title AND brief;
 *   (3) summary's leading subject (first ~6 words) shares no significant token with the title.
 *  Reports candidates for operator review; does not write. 0 spend. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const items = await readAll("intelligence_items", "id,legacy_id,title,summary,full_brief,item_type", { match: (q) => q.eq("is_archived", false) });
const norm = (s) => (s || "").toLowerCase();
const regNums = (s) => [...norm(s).matchAll(/\b(?:reg(?:ulation)?\.?\s*\(?eu\)?\s*)?(\d{4})\/(\d{2,4})\b/g)].map((m) => `${m[1]}/${m[2]}`);
const STOP = new Set(["the","and","for","with","of","to","in","on","a","an","is","as","by","its","this","document","brief","intelligence","summary","report","program","programme"]);
const toks = (s) => norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
const TOPIC_FLAGS = ["artificial intelligence", "ai act", "ai system", "machine learning", "general-purpose ai"];

const hits = [];
for (const it of items) {
  if (!it.summary || it.summary.length < 25) continue;
  const title = norm(it.title), brief = norm(it.full_brief), sum = norm(it.summary);
  const reasons = [];

  // (1) reg number in summary not in title/brief
  for (const rn of regNums(it.summary)) {
    if (!title.includes(rn) && !brief.includes(rn)) reasons.push(`summary cites ${rn} absent from title+brief`);
  }
  // (2) strong off-topic token
  for (const tf of TOPIC_FLAGS) {
    if (sum.includes(tf) && !title.includes(tf) && !brief.includes(tf.split(" ")[0])) reasons.push(`summary mentions "${tf}" absent from title+brief`);
  }
  // (3) leading subject shares no token with title
  const lead = toks(it.summary.split(/[.,:;]/)[0]).slice(0, 8);
  const tt = new Set(toks(it.title));
  if (lead.length >= 3 && !lead.some((w) => tt.has(w))) reasons.push(`summary lead-subject shares no token with title`);

  if (reasons.length) hits.push({ it, reasons });
}

// rank: reg-number / topic-flag mismatches are the strongest signal
const strong = hits.filter((h) => h.reasons.some((r) => /cites|mentions/.test(r)));
const weak = hits.filter((h) => !strong.includes(h));

console.log(`\n===== SUMMARY CROSS-CONTAMINATION SCAN (${items.length} live items) =====`);
console.log(`STRONG signal (reg-number / off-topic-token mismatch): ${strong.length}`);
for (const h of strong) {
  console.log(`\n  ${(h.it.legacy_id || h.it.id.slice(0, 8))} [${h.it.item_type}] ${h.it.title.slice(0, 56)}`);
  console.log(`    summary: ${h.it.summary.slice(0, 150).replace(/\s+/g, " ")}`);
  console.log(`    flags: ${h.reasons.join(" | ")}`);
}
console.log(`\nWEAK signal (lead-subject token mismatch only): ${weak.length} (likely noise; listed terse)`);
for (const h of weak.slice(0, 25)) console.log(`  ${(h.it.legacy_id || h.it.id.slice(0, 8)).padEnd(14)} ${h.it.title.slice(0, 50)}  :: ${h.it.summary.slice(0, 60).replace(/\s+/g, " ")}`);
if (weak.length > 25) console.log(`  … +${weak.length - 25} more weak`);
