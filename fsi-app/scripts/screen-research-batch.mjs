/** Cheap pre-screen (Haiku, no fetch) of the quarantined research_finding items before the
 * expensive deep-dive generation. Per the spend rule: cheap-model screen before Sonnet escalation.
 * For each item, Haiku judges whether it is a specific freight-sustainability RESEARCH FINDING that
 * merits a generated brief, vs off-vertical or a portal/institution/dataset-access page that should
 * be reclassified/archived instead. Read-only — writes nothing; prints the GENERATE vs SKIP split.
 *   node scripts/screen-research-batch.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const HAIKU = "claude-haiku-4-5-20251001";

const SYSTEM = `You screen candidate items for a freight-sustainability intelligence platform's Research surface.
Decide if each item is a SPECIFIC RESEARCH FINDING on the freight / transport-sustainability vertical that
merits a generated research brief. Return STRICT JSON ONLY:
{"category":"research_finding|off_vertical|portal_or_institution","generate":true|false,"reason":"<=120 chars"}
- research_finding: a specific study/report/finding about freight, transport, shipping, logistics,
  emissions, energy/fuel, supply-chain decarbonisation, EV/battery, autonomous/automated driving, etc. -> generate true.
- off_vertical: not about freight/transport sustainability (e.g. generic AI/quantum, general wage reports,
  unrelated economics) -> generate false.
- portal_or_institution: the item is an institution/research CENTRE, a data portal, a dataset-access or
  access-verification page, or a generic landing page rather than a specific finding -> generate false.`;

async function screen(it) {
  const user = `Title: ${it.title}\nURL: ${it.source_url}`;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: HAIKU, max_tokens: 200, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    const d = await resp.json();
    if (!resp.ok) return { category: "error", generate: false, reason: JSON.stringify(d).slice(0, 80) };
    const txt = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { category: "parse_error", generate: false, reason: txt.slice(0, 80) };
  } catch (e) { return { category: "error", generate: false, reason: String(e.message).slice(0, 80) }; }
}

const { data } = await sb.from("intelligence_items").select("id,title,source_url,provenance_status,full_brief,is_archived").eq("item_type", "research_finding").eq("is_archived", false);
const needGen = (data || []).filter((r) => r.provenance_status !== "verified" && !(r.full_brief || "").trim());
console.log(`screening ${needGen.length} quarantined research items (Haiku, no fetch)...\n`);

const gen = [], skip = [];
for (const it of needGen) {
  const v = await screen(it);
  const line = `  ${v.generate ? "GEN " : "SKIP"} [${v.category}] ${it.id.slice(0, 8)} ${(it.title || "").slice(0, 44)} :: ${v.reason}`;
  console.log(line);
  (v.generate ? gen : skip).push({ id: it.id, title: it.title, source_url: it.source_url, ...v });
}
console.log(`\n=== SUMMARY ===\nGENERATE: ${gen.length}   SKIP: ${skip.length}`);
console.log(`\nSKIP breakdown:`);
for (const s of skip) console.log(`  [${s.category}] ${s.id.slice(0, 8)} ${(s.title || "").slice(0, 50)}`);
console.log(`\nGENERATE set (ids): ${gen.map((g) => g.id.slice(0, 8)).join(", ")}`);
import("node:fs").then(({ writeFileSync }) => { writeFileSync(resolve(ROOT, "scripts/_diag/research-screen.json"), JSON.stringify({ gen, skip }, null, 2)); console.log("\nwrote scripts/_diag/research-screen.json"); });
