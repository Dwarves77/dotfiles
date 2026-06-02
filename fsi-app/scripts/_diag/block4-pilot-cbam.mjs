/**
 * block4-pilot-cbam.mjs — Block 4 PILOT (non-mutating, transactional rollback).
 *
 * Question: can the EXISTING CBAM brief be grounded so validate_item_provenance
 * returns valid=true (retro-ground path)? If yes, the corpus is salvageable
 * without regeneration. If no, the failures show exactly what regeneration must fix.
 *
 * Flow: fetch CBAM source content -> ask Claude to emit a Claim Provenance Ledger
 * (FACT claims with VERBATIM spans copied from that content, covering the 4 required
 * slots + the modal-bearing sections) -> in a single pg transaction, INSERT the
 * agent_run_searches + section_claim_provenance rows, call validate_item_provenance,
 * capture the verdict, and ROLLBACK. No durable write. One bounded Claude call.
 *
 * Grounding is self-consistent: the content given to the agent is the SAME text
 * stored as result_content_excerpt, so a verbatim-copied span satisfies criterion 3.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Inlined minimal equivalents of parse-output.ts helpers (node strip-only mode
// can't import that .ts — it uses a TS parameter-property). Logic mirrors the
// real extractClaimLedger (sentinel-delimited JSON array) + crossLinkClaimSources.
function extractClaimLedger(rawText) {
  const open = rawText.indexOf("<<<CLAIM_PROVENANCE_LEDGER");
  const close = rawText.indexOf("CLAIM_PROVENANCE_LEDGER>>>");
  if (open === -1 || close === -1 || close <= open) return [];
  let inner = rawText.slice(open + "<<<CLAIM_PROVENANCE_LEDGER".length, close).trim();
  const lb = inner.indexOf("["), rb = inner.lastIndexOf("]");
  if (lb === -1 || rb === -1) return [];
  try { return JSON.parse(inner.slice(lb, rb + 1)); } catch { return []; }
}
function crossLinkClaimSources(claims, searches) {
  const byUrl = new Map();
  for (const s of searches) if (s.result_url) byUrl.set(s.result_url, s.id);
  return claims.map((c) => ({ ...c, search_result_id: (c.source_url && byUrl.has(c.source_url)) ? byUrl.get(c.source_url) : (c.search_result_id ?? null) }));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const conn = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CBAM_ID = "51b2c91e-776f-42f5-a799-a957312d4e56";
const CBAM_SOURCE_ID = "9fb4b968-7068-4262-8be2-dc4ee0fd8742";
const SOURCE_TIER = 2;
const GROUND_URLS = [
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0956",
  "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en",
];

async function fetchText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return { url, ok: false, text: "" };
    const html = await r.text();
    // crude tag strip to give the model readable text + store as excerpt
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 40000);
    return { url, ok: true, text };
  } catch (e) { return { url, ok: false, text: "" }; }
}

const client = new pg.Client({ connectionString: conn });
await client.connect();
try {
  // 1. CBAM sections + slots
  const secs = (await client.query(
    "SELECT id, section_key, content_md FROM public.intelligence_item_sections WHERE item_id=$1 ORDER BY section_order", [CBAM_ID]
  )).rows;
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  const slots = (await client.query("SELECT slot_key, description FROM public.item_type_required_slots WHERE item_type='regulation'")).rows;

  // 2. fetch grounding sources
  console.log("[pilot] fetching CBAM source content...");
  const fetched = await Promise.all(GROUND_URLS.map(fetchText));
  for (const f of fetched) console.log(`   ${f.ok ? "OK " : "ERR"} ${f.text.length} chars  ${f.url}`);
  const sourceBlocks = fetched.filter((f) => f.ok && f.text.length > 200);
  if (!sourceBlocks.length) { console.error("[pilot] no source content fetched — cannot ground. HALT."); process.exit(1); }

  // 3. build extraction prompt
  const sectionsText = secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, 2500)}`).join("\n\n");
  const sourcesText = sourceBlocks.map((b, i) => `### SOURCE ${i + 1}  url=${b.url}\n${b.text.slice(0, 18000)}`).join("\n\n");
  const slotsText = slots.map((s) => `- ${s.slot_key}: ${s.description}`).join("\n");
  const system = `You extract a Claim Provenance Ledger for a regulatory brief. You output ONLY the ledger, nothing else.
Rules:
- Emit a single block: a line "<<<CLAIM_PROVENANCE_LEDGER", then a JSON array, then a line "CLAIM_PROVENANCE_LEDGER>>>".
- Each record: {"section","claim_text","claim_kind","source_span","source_id","source_url","slot_key"}.
- claim_kind is FACT for sourced facts. For each FACT, source_span MUST be a VERBATIM substring copied EXACTLY (character-for-character) from one of the provided SOURCE blocks. source_url = that source's url. source_id = "${CBAM_SOURCE_ID}".
- Cover EACH of these required slots with at least one FACT claim (set slot_key): \n${slotsText}
- CRITICAL COVERAGE RULE: for EVERY brief SECTION below whose text contains any of the words must / requires / shall / applies / mandates / prohibits / obligates, you MUST emit at least one FACT claim whose "section" is that section number and whose source_span is a verbatim quote from a SOURCE. Go section by section (3, 4, 8, 10, 11, 14, 15) and check each. A section with such words and no FACT claim is a failure. Prefer over-covering.
- Do NOT invent spans. If you cannot find a verbatim span in the SOURCES for a slot, emit it as claim_kind "GAP" with source_span null and the slot_key set.
- Keep claim_text to one sentence; it may paraphrase. source_span must be verbatim from a SOURCE.`;
  const user = `BRIEF SECTIONS (existing CBAM brief):\n${sectionsText}\n\n====\nSOURCE CONTENT (copy spans VERBATIM from here):\n${sourcesText}`;

  console.log("[pilot] calling Claude (claim extraction)...");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, system, messages: [{ role: "user", content: user }] }),
  });
  const data = await resp.json();
  if (!resp.ok) { console.error("[pilot] anthropic error:", JSON.stringify(data).slice(0, 400)); process.exit(1); }
  const rawText = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  console.log(`[pilot] usage: in=${data.usage?.input_tokens} out=${data.usage?.output_tokens}`);

  let claims = extractClaimLedger(rawText);
  console.log(`[pilot] claims emitted: ${claims.length} (FACT=${claims.filter(c=>c.claim_kind==="FACT").length} GAP=${claims.filter(c=>c.claim_kind==="GAP").length} other=${claims.filter(c=>!["FACT","GAP"].includes(c.claim_kind)).length})`);
  if (!claims.length) { console.error("[pilot] no claims parsed. raw head:\n" + rawText.slice(0, 600)); process.exit(1); }

  // 4. verify spans actually appear in our stored excerpts (honesty check)
  const excerptByUrl = Object.fromEntries(sourceBlocks.map((b) => [b.url, b.text]));
  let spanHits = 0, spanMiss = 0;
  for (const c of claims) {
    if (c.claim_kind !== "FACT" || !c.source_span) continue;
    const exc = excerptByUrl[c.source_url] || sourceBlocks.map(b=>b.text).join(" ");
    if (exc.toLowerCase().includes(String(c.source_span).toLowerCase().trim())) spanHits++; else { spanMiss++; }
  }
  console.log(`[pilot] FACT span verbatim-in-source: hits=${spanHits} misses=${spanMiss}`);

  // Mirror the real span-check gate: a FACT whose span is NOT verbatim in its
  // source excerpt does not ground — drop it (the pipeline routes it to staging /
  // agent retry). Keeps non-FACT claims. Then validate the grounded subset.
  const before = claims.length;
  claims = claims.filter((c) => {
    if (c.claim_kind !== "FACT") return true;
    if (!c.source_span) return false;
    const exc = excerptByUrl[c.source_url] || sourceBlocks.map((b) => b.text).join(" ");
    return exc.toLowerCase().includes(String(c.source_span).toLowerCase().trim());
  });
  console.log(`[pilot] span-check gate: kept ${claims.length}/${before} claims (dropped ${before - claims.length} non-verbatim FACT)`);

  // 5. transaction: persist searches + claims, validate, ROLLBACK
  await client.query("BEGIN");
  const searchRows = [];
  for (let i = 0; i < sourceBlocks.length; i++) {
    const b = sourceBlocks[i];
    const r = await client.query(
      `INSERT INTO public.agent_run_searches (intelligence_item_id, search_query, result_url, result_title, result_index, result_content_excerpt, searched_at)
       VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id, result_url`,
      [CBAM_ID, "block4 pilot grounding", b.url, "CBAM source", i, b.text]
    );
    searchRows.push({ id: r.rows[0].id, result_url: r.rows[0].result_url });
  }
  const linked = crossLinkClaimSources(claims, searchRows);
  let inserted = 0;
  for (const c of linked) {
    const sectionRowId = sectionMap[String(c.section)] || secs[0].id;
    // criterion 5 reads claim_text ILIKE %slot_key%: embed slot_key for FACT/GAP only
    const storedText = (["FACT", "GAP"].includes(c.claim_kind) && c.slot_key)
      ? `[${c.slot_key}] ${c.claim_text}` : c.claim_text;
    const tier = c.claim_kind === "FACT" ? SOURCE_TIER : null;
    await client.query(
      `INSERT INTO public.section_claim_provenance
        (section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sectionRowId, CBAM_ID, storedText, c.claim_kind, c.source_span,
       c.source_id || CBAM_SOURCE_ID, c.search_result_id || null, tier]
    );
    inserted++;
  }
  const vr = (await client.query("SELECT * FROM public.validate_item_provenance($1)", [CBAM_ID])).rows[0];
  const failures = Array.isArray(vr.failures) ? vr.failures : JSON.parse(vr.failures || "[]");
  const hist = {};
  for (const f of failures) hist[`c${f.criterion}:${f.reason}`] = (hist[`c${f.criterion}:${f.reason}`] || 0) + 1;
  await client.query("ROLLBACK");

  console.log("\n" + "=".repeat(60));
  console.log(`PILOT RESULT (rolled back — nothing persisted)`);
  console.log(`  claims inserted:     ${inserted}`);
  console.log(`  validate.valid:      ${vr.valid}`);
  console.log(`  recommended_status:  ${vr.recommended_status}`);
  console.log(`  remaining failures:  ${failures.length}`);
  if (failures.length) { console.log("  failure histogram:"); for (const [k, v] of Object.entries(hist).sort((a,b)=>b[1]-a[1])) console.log(`    ${k}: ${v}`); }
  console.log("=".repeat(60));
  console.log(vr.valid ? "\nPASS — existing CBAM brief CAN be grounded to pass (retro-ground viable)."
    : "\nNOT YET — failures above show what still blocks; informs retro-ground vs regenerate.");
} finally {
  await client.end();
}
