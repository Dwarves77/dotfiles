/** jolt-exemplar-regen.mjs — regenerate the JOLT research exemplar against the REAL source
 * (jolt.eco + trade reporting) under the corrected Forward-Intelligence Rule (proactive: in-progress
 * IS the finding). Multi-source fetch so FACT spans about participants/phase/timing have something
 * verbatim to ground against. Writes full_brief + sections; grounding is the next step
 * (block4-retroground-runner --only). Metered (Browserless + one Sonnet call). --execute to write.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { browserlessFetch } from "../src/lib/sources/canonical-fetch.mjs";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { SYSTEM_PROMPT } = await jiti.import("../src/lib/agent/system-prompt.ts");
const { parseAgentOutput } = await jiti.import("../src/lib/agent/parse-output.ts");
const { extractResearchSections } = await jiti.import("../src/lib/agent/extract-research-sections.ts");
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const KEY = process.env.ANTHROPIC_API_KEY;
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");

const SOURCES = [
  "https://jolt.eco/",
  "https://jolt.eco/about-us/",
  "https://www.eng.cam.ac.uk/electric-hgv-trial",
  "https://www.commercialmotor.com/news/article/project-jolt-enters-next-phase-as-four-ehgvs-begin-full-operational-trials",
  "https://motortransport.co.uk/freightcarbonzero/project-jolt-trials-four-electric-trucks-with-major-operators/52674.article",
];
const clean = (s) => String(s || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").replace(/\s+/g, " ").trim();

const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  const it = (await c.query("SELECT id,title,source_id,source_url FROM intelligence_items WHERE id::text LIKE $1", ["388b2ce8%"])).rows[0];
  console.log(`regenerating: ${(it.title || "").slice(0, 56)}\n`);
  const blocks = [];
  for (const u of SOURCES) {
    try { const r = await browserlessFetch(u, { maxTextLength: 14000 }); const t = clean(r.text); if (t.length > 200) { blocks.push(`### SOURCE url=${u}\n${t.slice(0, 12000)}`); console.log(`  fetched ${u} (${t.length}ch)`); } else console.log(`  thin ${u}`); }
    catch (e) { console.log(`  fail ${u}: ${e.message.slice(0, 50)}`); }
  }
  if (!blocks.length) { console.error("HALT: no source content"); process.exit(1); }

  const user = `Generate the research_finding brief (Research Summary format) for: "${it.title}".
This research programme is IN PROGRESS (pre-publication). Apply the Forward-Intelligence Rule:
surface the design, participants/parties, current phase/status, and what it is investigating as
first-class — these ARE the finding. Surface expected timing (stated schedule = FACT with citation;
otherwise a labeled "Analytical inference:" estimate). Set severity MONITORING and state the
expected re-check window for the eventual published results.
Primary source_url: ${it.source_url}  (FACT source_id: ${it.source_id})
Ground every FACT claim's source_span as a VERBATIM substring of a SOURCE block below; set source_url
to the block's url. Output contract: brief body, then the Claim Provenance Ledger, then YAML frontmatter.

SOURCE CONTENT (copy FACT spans verbatim from here):
${blocks.join("\n\n")}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] }) });
  const d = await resp.json();
  if (!resp.ok) { console.error("anthropic error", JSON.stringify(d).slice(0, 160)); process.exit(1); }
  const raw = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const parsed = parseAgentOutput(raw);
  const body = (parsed.body || "").trim();
  console.log(`\ngenerated brief=${body.length}ch claims=${(parsed.claims || []).length} sev=${parsed.metadata?.severity || "?"}  tokens out=${d.usage?.output_tokens}`);
  const secs = extractResearchSections(body);
  console.log(`sections: ${secs.map((s) => s.section_key + "(" + s.content_md.length + "ch)").join(", ")}`);

  if (EXECUTE) {
    await c.query("UPDATE intelligence_items SET full_brief=$2, updated_at=now() WHERE id=$1", [it.id, clean(body) === "" ? body : body]);
    await c.query("DELETE FROM intelligence_item_sections WHERE item_id=$1", [it.id]);
    for (const s of secs) await c.query("INSERT INTO intelligence_item_sections (item_id,section_key,section_order,content_md,is_conditional) VALUES ($1,$2,$3,$4,$5)", [it.id, s.section_key, s.section_order, s.content_md, s.is_conditional]);
    // re-quarantine so the runner re-grounds it cleanly (provenance re-derives on grounding)
    await c.query("UPDATE intelligence_items SET provenance_status='quarantined' WHERE id=$1", [it.id]);
    console.log(`\nWROTE full_brief + ${secs.length} sections; set quarantined for re-grounding. NEXT: block4-retroground-runner --priority=HIGH --only=388b2ce8 --execute --confirm`);
  } else console.log("\ndry-run — re-run with --execute --confirm to write");
} finally { await c.end(); }
