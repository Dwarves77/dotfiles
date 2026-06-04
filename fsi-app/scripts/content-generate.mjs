/**
 * content-generate.mjs — GENERATE a brief for empty+sourced items (canonical path).
 *
 * Uses the established components only — no hand-rolled parsing/fetching:
 *   - Browserless (canonical-fetch.mjs) for ALL source pulling (a MUST).
 *   - The real SYSTEM_PROMPT (agent contract) via jiti.
 *   - The canonical parseAgentOutput (parse-output.ts) via jiti to split the
 *     model output into { body, metadata, claims }.
 * Writes full_brief = body. Sectioning + grounding are the NEXT canonical steps
 * (sprint3-a5-backfill.mjs writes sections from full_brief; block4-retroground-
 * runner.mjs grounds), so this script only produces the brief.
 *
 * Targets: quarantined + sourced + EMPTY (no full_brief, no sections) +
 * regulatory-format item_types (regulation/directive/standard/guidance/framework)
 * — the formats sprint3-a5-backfill can section. Non-off-domain only.
 *
 *   node scripts/content-generate.mjs --limit=5            # dry run (no write)
 *   node scripts/content-generate.mjs --limit=5 --execute --confirm
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { browserlessFetch } from "../src/lib/sources/canonical-fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const KEY = process.env.ANTHROPIC_API_KEY;

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { parseAgentOutput } = await jiti.import("../src/lib/agent/parse-output.ts");
const { SYSTEM_PROMPT } = await jiti.import("../src/lib/agent/system-prompt.ts");

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute"), CONFIRM = argv.includes("--confirm");
const LIMIT = (() => { const a = argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.split("=")[1], 10) : 5; })();
const ONLY = (() => { const a = argv.find((x) => x.startsWith("--only=")); return a ? a.split("=")[1].split(",") : null; })();
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm"); process.exit(2); }

const REG_TYPES = ["regulation", "directive", "standard", "guidance", "framework"];
// --types=research_finding (etc.) targets a non-regulatory format; defaults to the regulatory set.
// The system prompt is already format-aware (selects by item_type), so only the candidate filter changes.
const TYPES = (() => { const a = argv.find((x) => x.startsWith("--types=")); return a ? a.split("=")[1].split(",") : REG_TYPES; })();
const OFF = /city council|municipal|department directory|departments & bureaus|member directory|navigation error|portal$|agency portal|repository|congressional library|public health|legislative reference|statutes database|services directory|official portal|government structure|government service/i;
const cleanCtl = (s) => (s == null ? s : String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "));

async function browserlessText(url) {
  try { const r = await browserlessFetch(url, { maxTextLength: 40000 }); return cleanCtl(r.text || "").replace(/\s+/g, " ").trim(); }
  catch (e) { return ""; }
}
async function callAgent(user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] }) });
  const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 140));
  return { raw: (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"), usage: d.usage };
}

const c = new pg.Client({ connectionString: CONN }); await c.connect();
const stats = { tried: 0, generated: 0, written: 0, skipped: 0, cin: 0, cout: 0 };
try {
  console.log(`MODE: ${EXECUTE ? "EXECUTE" : "DRY RUN"}  limit=${LIMIT}  (Browserless + canonical parseAgentOutput)`);
  const { rows: secRows } = await c.query("SELECT DISTINCT item_id FROM intelligence_item_sections WHERE COALESCE(content_md,'')<>''");
  const withSec = new Set(secRows.map((r) => r.item_id));
  const { rows: cand } = await c.query(
    `SELECT id, legacy_id, title, priority, item_type, source_id, source_url
       FROM intelligence_items WHERE is_archived=false AND provenance_status='quarantined'
        AND source_id IS NOT NULL AND source_url IS NOT NULL AND COALESCE(full_brief,'')=''
        AND item_type = ANY($1) ORDER BY array_position(ARRAY['CRITICAL','HIGH','MODERATE','LOW'], priority)`, [TYPES]);
  let targets = cand.filter((it) => !withSec.has(it.id) && !OFF.test(it.title || ""));
  if (ONLY) targets = targets.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((o) => it.id.startsWith(o)));
  targets = targets.slice(0, LIMIT);
  console.log(`targets: ${targets.length}\n`);

  for (const it of targets) {
    stats.tried++; const tag = `[${it.legacy_id || it.id.slice(0, 8)}]`;
    const src = await browserlessText(it.source_url);
    if (src.length < 300) { stats.skipped++; console.log(`${tag} SKIP — Browserless returned ${src.length} chars for ${it.source_url}`); continue; }
    const user = `Generate the ${it.item_type} brief for: "${it.title}".
Source URL: ${it.source_url}  (item source_id for FACT source_id: ${it.source_id})
Ground every FACT claim's source_span as a VERBATIM substring of the SOURCE CONTENT below; set source_url to ${it.source_url}.
Follow your output contract exactly: brief body, then the Claim Provenance Ledger, then the YAML frontmatter.

SOURCE CONTENT (copy FACT spans verbatim from here):
${src.slice(0, 28000)}`;
    let gen; try { gen = await callAgent(user); } catch (e) { stats.skipped++; console.log(`${tag} SKIP gen-error ${e.message}`); continue; }
    stats.cin += gen.usage?.input_tokens || 0; stats.cout += gen.usage?.output_tokens || 0;
    let parsed; try { parsed = parseAgentOutput(gen.raw); } catch (e) { stats.skipped++; console.log(`${tag} SKIP parse-error ${e.message.slice(0, 70)}`); continue; }
    const body = (parsed.body || "").trim();
    const claimCount = (parsed.claims || []).length;
    if (body.length < 600) { stats.skipped++; console.log(`${tag} SKIP — parsed body too short (${body.length})`); continue; }
    stats.generated++;
    if (EXECUTE) {
      await c.query("UPDATE intelligence_items SET full_brief=$2, updated_at=now() WHERE id=$1", [it.id, cleanCtl(body)]);
      stats.written++;
      console.log(`${tag} ${it.priority} ${it.item_type} GENERATED brief=${body.length}ch claims=${claimCount} [WRITTEN]`);
    } else {
      console.log(`${tag} ${it.priority} ${it.item_type} GENERATED brief=${body.length}ch claims=${claimCount} [dry-run]`);
    }
  }
  const cost = (stats.cin / 1e6) * 3 + (stats.cout / 1e6) * 15;
  console.log(`\n${"=".repeat(56)}`);
  console.log(`tried=${stats.tried} generated=${stats.generated} written=${stats.written} skipped=${stats.skipped}`);
  console.log(`tokens in=${stats.cin} out=${stats.cout}  ~cost=$${cost.toFixed(2)} ($${(cost / Math.max(1, stats.tried)).toFixed(3)}/item)`);
  console.log(EXECUTE ? "WROTE full_brief. NEXT: sprint3-a5-backfill (sections) -> block4-retroground (ground)." : "DRY RUN — no write.");
} finally { await c.end(); }
