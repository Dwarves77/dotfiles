/** Evaluate the DEEP-DIVE generate by OUTPUT QUALITY (not plumbing). Runs the new generateBrief on
 * an item, then reports what web_search discovered, the brief depth, and the New Sources table — so
 * we judge whether the system went deep (found trade press / academic / participants) instead of
 * emitting a thin single-source brief.
 *   node scripts/deepdive-test.mjs [itemIdPrefix]   (default JOLT 388b2ce8)
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, discoverCorroborators } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const prefix = process.argv[2] || "388b2ce8";
const { data: items } = await sb.from("intelligence_items").select("id,title,source_url,full_brief").eq("item_type", "research_finding").limit(80);
const it = (items || []).find((r) => r.id.startsWith(prefix));
if (!it) { console.error("item not found"); process.exit(1); }
console.log(`ITEM ${it.id.slice(0, 8)} "${(it.title || "").slice(0, 56)}"\n  primary: ${it.source_url}\n  brief before: ${(it.full_brief || "").length}ch\n`);

// 1. show what web_search discovers (the deep dive's first move)
console.log("=== web_search discovery ===");
const primaryProbe = ""; // generateBrief fetches internally; pass empty so discovery leans on title+search
const found = await discoverCorroborators(it.title, it.source_url, primaryProbe);
for (const c of found) console.log(`  [${c.type || "?"}] ${c.name}\n      ${c.url}\n      ${c.why}`);
console.log(`  -> ${found.length} corroborating sources discovered\n`);

// 2. run the full deep-dive generate (re-discovers + multi-source fetch + synthesis)
console.log("=== deep-dive generateBrief ===");
const g = await generateBrief(it.id);
console.log(`  ${g.ok ? "OK" : "FAIL"} ${g.detail}\n`);

// 3. evaluate the produced brief
const { data: after } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
const brief = after?.full_brief || "";
const rawUrls = brief.match(/https?:\/\/\S+/g) || [];
const hosts = rawUrls.map((u) => { try { return new URL(u.replace(/[.,;:|)\]}"']+$/, "")).host.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
const urls = [...new Set(hosts)];
console.log(`brief length: ${brief.length}ch`);
console.log(`distinct source hosts cited in brief: ${urls.length} -> ${urls.slice(0, 12).join(", ")}`);
const m = brief.match(/#+\s*New Sources Identified[\s\S]{0,1600}/i);
console.log("\n--- New Sources Identified ---\n" + (m ? m[0] : "(none)"));
