/**
 * block4-retroground-runner.mjs — DURABLE retro-grounding batch runner.
 *
 * For each target item (sectioned, given priority):
 *   1. Skip if already grounded (idempotent / resumable).
 *   2. Grounding URLs = source_url + every URL cited in content_md. Fetch each
 *      (best-effort, control-bytes stripped). One agent_run_searches row per URL.
 *   3. Claude extracts a Claim Provenance Ledger: FACT claims with VERBATIM spans
 *      covering the item_type's required slots + every modal-bearing section.
 *   4. span-check gate: drop FACTs whose span isn't verbatim in a fetched excerpt.
 *   5. Per-item transaction: insert searches + claims, validate_item_provenance.
 *      COMMIT only if valid=true (the trigger has flipped status). ROLLBACK if not.
 *   6. Targeted retry (<=3): on failure, feed the specific failing sections/slots
 *      back to the agent and retry. On commit: resolve the stale quarantine flag +
 *      read-back assert the status left 'quarantined' (halt-on-mismatch).
 *
 * RESILIENCE: a fresh short-lived pg connection per transaction (never held idle
 * during the Claude call — the pooler was dropping the long-lived connection).
 * SAFETY: --dry-run (DEFAULT) rolls back everything. --execute --confirm commits.
 * Idempotent: re-run skips grounded items. dev+prod are ONE Supabase (prod write).
 *
 *   node scripts/block4-retroground-runner.mjs --priority=CRITICAL              # dry run
 *   node scripts/block4-retroground-runner.mjs --priority=CRITICAL --execute --confirm
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const CONFIRM = argv.includes("--confirm");
const PRIORITY = (argv.find((a) => a.startsWith("--priority=")) || "--priority=CRITICAL").split("=")[1];
const LIMIT = (() => { const a = argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.split("=")[1], 10) : Infinity; })();
const ONLY = (() => { const a = argv.find((x) => x.startsWith("--only=")); return a ? a.split("=")[1].split(",") : null; })();
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm (durable prod write). Refusing."); process.exit(2); }

// Fresh short-lived connection per unit of DB work — never idle during API calls.
async function withClient(fn) {
  const c = new pg.Client({ connectionString: CONN });
  await c.connect();
  try { return await fn(c); } finally { try { await c.end(); } catch {} }
}
const cleanCtl = (s) => (s == null ? s : String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "));
const urlsIn = (md) => [...new Set((String(md || "").match(/https?:\/\/[^\s)\]\}"'<>]+/g) || []).map((u) => u.replace(/[.,;:]+$/, "")))];
async function fetchText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return { url, ok: false, text: "" };
    const html = await r.text();
    const text = cleanCtl(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim().slice(0, 40000);
    return { url, ok: true, text };
  } catch { return { url, ok: false, text: "" }; }
}
function extractClaimLedger(rawText) {
  const open = rawText.indexOf("<<<CLAIM_PROVENANCE_LEDGER"), close = rawText.indexOf("CLAIM_PROVENANCE_LEDGER>>>");
  if (open === -1 || close === -1 || close <= open) return [];
  const inner = rawText.slice(open + 26, close).trim();
  const lb = inner.indexOf("["), rb = inner.lastIndexOf("]");
  if (lb === -1 || rb === -1) return [];
  try { return JSON.parse(inner.slice(lb, rb + 1)); } catch { return []; }
}
async function callAgent(system, content) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, system, messages: [{ role: "user", content }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`anthropic ${JSON.stringify(data).slice(0, 100)}`);
  return { raw: (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"), stop: data.stop_reason };
}

const stats = { considered: 0, skipped_grounded: 0, passed: 0, failed: 0, committed: 0, halted: 0 };
console.log(`MODE: ${EXECUTE ? "EXECUTE (durable)" : "DRY RUN (rollback all)"}  priority=${PRIORITY}`);

const items = await withClient((c) => c.query(
  `SELECT i.id, i.legacy_id, i.title, i.item_type, i.priority, i.source_id, i.source_url
     FROM public.intelligence_items i
    WHERE i.is_archived=false AND i.priority=$1
      AND EXISTS (SELECT 1 FROM public.intelligence_item_sections s WHERE s.item_id=i.id AND COALESCE(s.content_md,'')<>'')
    ORDER BY i.legacy_id`, [PRIORITY]).then((r) => r.rows));
let targets = items.filter((it) => !ONLY || ONLY.includes(it.legacy_id) || ONLY.some((o) => it.id.startsWith(o))).slice(0, LIMIT);
console.log(`targets: ${targets.length}\n`);

let halt = false;
for (const it of targets) {
  if (halt) break;
  stats.considered++;
  const tag = `[${it.legacy_id || it.id.slice(0, 8)}]`;
  // reads (one short connection)
  const setup = await withClient(async (c) => {
    const cc = (await c.query("SELECT count(*)::int n FROM public.section_claim_provenance WHERE intelligence_item_id=$1", [it.id])).rows[0].n;
    if (cc > 0) return { skip: `already has ${cc} claims` };
    if (!it.source_id) return { skip: "no source_id (criterion 1 cannot pass)" };
    const secs = (await c.query("SELECT id, section_key, content_md FROM public.intelligence_item_sections WHERE item_id=$1 ORDER BY section_order", [it.id])).rows;
    const slots = (await c.query("SELECT slot_key, description FROM public.item_type_required_slots WHERE item_type=$1", [it.item_type])).rows;
    return { secs, slots };
  });
  if (setup.skip) { if (setup.skip.startsWith("already")) stats.skipped_grounded++; console.log(`${tag} SKIP — ${setup.skip}`); continue; }
  const { secs, slots } = setup;
  const sectionMap = Object.fromEntries(secs.map((s) => [String(s.section_key), s.id]));
  const sectionKeyById = Object.fromEntries(secs.map((s) => [s.id, String(s.section_key)]));

  // fetch grounding sources
  const groundUrls = [...new Set([it.source_url, ...secs.flatMap((s) => urlsIn(s.content_md))].filter(Boolean))];
  const fetched = await Promise.all(groundUrls.map(fetchText));
  const withText = fetched.filter((f) => f.ok && f.text.length > 200);
  if (!withText.length) { console.log(`${tag} SKIP — no source content fetchable (${groundUrls.length} urls)`); continue; }
  const excByUrl = Object.fromEntries(withText.map((b) => [b.url, b.text]));
  const allText = withText.map((b) => b.text).join(" ").toLowerCase();
  const srcTier = 2;

  const sectionsText = secs.map((s) => `### SECTION ${s.section_key}\n${(s.content_md || "").slice(0, 2200)}`).join("\n\n");
  const sourcesText = withText.map((b, i) => `### SOURCE ${i + 1}  url=${b.url}\n${b.text.slice(0, 16000)}`).join("\n\n");
  const slotsText = slots.map((s) => `- ${s.slot_key}: ${s.description}`).join("\n");
  const sectionKeys = secs.map((s) => s.section_key).join(", ");
  const system = `You extract a Claim Provenance Ledger for a regulatory brief. Output ONLY the ledger.
- Emit one block: a line "<<<CLAIM_PROVENANCE_LEDGER", a JSON array, a line "CLAIM_PROVENANCE_LEDGER>>>".
- Record: {"section","claim_text","claim_kind","source_span","source_id","source_url","slot_key"}.
- FACT: source_span MUST be VERBATIM copied char-for-char from a SOURCE block; source_url = that source's url; source_id = "${it.source_id}".
- Cover EACH required slot with >=1 FACT claim (set slot_key):\n${slotsText}
- COVERAGE RULE: for EVERY section (${sectionKeys}) whose text has must/requires/shall/applies/mandates/prohibits/obligates, emit >=1 FACT claim with "section" set to that number + a verbatim span. Go section by section. Over-cover.
- If no verbatim span exists for a slot, emit it as claim_kind "GAP", source_span null, slot_key set. Never invent spans.
- IMPORTANT: emit the COMPLETE ledger and CLOSE it with the CLAIM_PROVENANCE_LEDGER>>> sentinel. Keep claim_text concise so the whole ledger fits.`;
  const user = `BRIEF SECTIONS:\n${sectionsText}\n\n====\nSOURCE CONTENT (copy spans VERBATIM):\n${sourcesText}`;

  let done = false, feedback = "";
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    let raw, stop;
    try { ({ raw, stop } = await callAgent(system, user + feedback)); }
    catch (e) { console.log(`${tag} a${attempt} ${e.message}`); continue; }
    const claims = extractClaimLedger(raw);
    if (!claims.length) { console.log(`${tag} a${attempt} 0 claims (stop=${stop})`); continue; }
    const kept = claims.filter((c) => {
      if (c.claim_kind !== "FACT") return true;
      if (!c.source_span) return false;
      return (excByUrl[c.source_url] || allText).toLowerCase().includes(String(c.source_span).toLowerCase().trim());
    });

    let res;
    try {
      res = await withClient(async (c) => {
        await c.query("BEGIN");
        const searchRows = [];
        for (let i = 0; i < withText.length; i++) {
          const r = await c.query(
            `INSERT INTO public.agent_run_searches (intelligence_item_id, search_query, result_url, result_title, result_index, result_content_excerpt, searched_at)
             VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id, result_url`,
            [it.id, "block4 retroground", withText[i].url, "source", i, withText[i].text]);
          searchRows.push({ id: r.rows[0].id, result_url: r.rows[0].result_url });
        }
        const fetchedUrls = new Set(withText.map((b) => b.url));
        for (const u of groundUrls.filter((u) => !fetchedUrls.has(u))) {
          const r = await c.query(
            `INSERT INTO public.agent_run_searches (intelligence_item_id, search_query, result_url, result_index, searched_at)
             VALUES ($1,$2,$3,$4, now()) RETURNING id, result_url`, [it.id, "block4 url-ground", u, 99]);
          searchRows.push({ id: r.rows[0].id, result_url: r.rows[0].result_url });
        }
        const byUrl = new Map(searchRows.filter((s) => s.result_url).map((s) => [s.result_url, s.id]));
        for (const c2 of kept) {
          const sectionRowId = sectionMap[String(c2.section)] || secs[0].id;
          const storedText = cleanCtl((["FACT", "GAP"].includes(c2.claim_kind) && c2.slot_key) ? `[${c2.slot_key}] ${c2.claim_text}` : c2.claim_text);
          const tier = c2.claim_kind === "FACT" ? srcTier : null;
          const searchId = (c2.source_url && byUrl.has(c2.source_url)) ? byUrl.get(c2.source_url) : null;
          await c.query(
            `INSERT INTO public.section_claim_provenance
              (section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [sectionRowId, it.id, storedText, c2.claim_kind, cleanCtl(c2.source_span), c2.source_id || it.source_id, searchId, tier]);
        }
        const vr = (await c.query("SELECT * FROM public.validate_item_provenance($1)", [it.id])).rows[0];
        const failures = Array.isArray(vr.failures) ? vr.failures : JSON.parse(vr.failures || "[]");
        if (vr.valid && EXECUTE) {
          await c.query(`UPDATE public.integrity_flags SET status='resolved', resolution_note='retro-grounded; provenance now valid'
            WHERE category='data_quality' AND subject_type='item' AND subject_ref=$1 AND status='open'`, [it.id]);
          await c.query("COMMIT");
          return { valid: true, committed: true, status: vr.recommended_status, failures };
        }
        await c.query("ROLLBACK");
        return { valid: vr.valid, committed: false, status: vr.recommended_status, failures };
      });
    } catch (e) { console.log(`${tag} a${attempt} ERROR ${e.message}`); continue; }

    if (res.valid) {
      done = true; stats.passed++;
      console.log(`${tag} PASS a${attempt} kept=${kept.length} -> ${res.status}${res.committed ? " [COMMITTED]" : " [dry-run]"}`);
      if (res.committed) {
        const st = await withClient((c) => c.query("SELECT provenance_status FROM public.intelligence_items WHERE id=$1", [it.id]).then((r) => r.rows[0]?.provenance_status));
        if (st === "quarantined" || !st) { stats.halted++; halt = true; console.error(`${tag} HALT — committed but status='${st}'`); }
        else { stats.committed++; console.log(`${tag}   read-back: '${st}' ✓`); }
      }
    } else {
      const badSecs = [...new Set(res.failures.filter((f) => f.reason === "unlabeled_assertion").map((f) => sectionKeyById[f.section_row_id]).filter(Boolean))];
      const badSlots = [...new Set(res.failures.filter((f) => f.reason === "missing_required_slot").map((f) => f.slot_key))];
      const spanIssue = res.failures.some((f) => f.reason === "fact_span_not_in_source" || f.reason === "fact_missing_source_span");
      const hints = [];
      if (badSecs.length) hints.push(`Sections [${badSecs.join(", ")}] STILL have unlabeled assertions — emit a FACT claim (verbatim span) with "section" set to EACH.`);
      if (badSlots.length) hints.push(`Slots [${badSlots.join(", ")}] NOT covered — emit a FACT/GAP claim with that slot_key for each.`);
      if (spanIssue) hints.push(`Some FACT spans were not verbatim — copy spans EXACTLY char-for-char from a SOURCE.`);
      feedback = `\n\n==== PRIOR ATTEMPT FAILED. Re-emit the COMPLETE ledger fixing ALL of:\n- ${hints.join("\n- ")}`;
      const fh = {}; for (const f of res.failures) fh[`c${f.criterion}:${f.reason}`] = (fh[`c${f.criterion}:${f.reason}`] || 0) + 1;
      console.log(`${tag} a${attempt} fail kept=${kept.length} ${JSON.stringify(fh)}`);
    }
  }
  if (!done) { stats.failed++; console.log(`${tag} GIVE-UP (still quarantined)`); }
}

console.log(`\n${"=".repeat(56)}`);
console.log(`considered=${stats.considered} skipped_grounded=${stats.skipped_grounded} passed=${stats.passed} committed=${stats.committed} failed=${stats.failed} halted=${stats.halted}`);
console.log(EXECUTE ? "EXECUTE complete." : "DRY RUN — nothing written.");
