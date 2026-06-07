/** VERIFIER (read-only, 0 Browserless): workspace-anchoring / NO NAMES.
 *  GOVERNING SKILL: environmental-policy-and-innovation -> "The Workspace-Anchored Rule" + Seven
 *  Anchoring Principles #1: "The output never names the workspace, its company, or any individual
 *  person. Anchoring is by role/operation/vertical/mode, generic." Skill wrong-examples:
 *  "Dietl commissions...", "Anthony Fraser, Commercial Director, ROKBOX", "Rockit currently manages...".
 *  CRITICAL skill nuance: this forbids naming the WORKSPACE's OWN identity — NOT third-party operators
 *  cited as intelligence (BYD/Maersk/Lufthansa are legitimately named). Blocklist = workspace identity
 *  ONLY (org names from the DB + the skill's named wrong-examples). PASS = workspace not named. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const { data: orgs } = await sb.from("organizations").select("name,slug");
const dbNames = (orgs || []).flatMap((o) => [o.name, o.slug]).filter(Boolean);
const SKILL_EXAMPLES = ["Dietl", "Rockit", "ROKBOX"]; // env-policy Workspace-Anchored Rule named wrong-examples
const blocklist = [...new Set([...dbNames, ...SKILL_EXAMPLES])]
  .map((s) => String(s).trim())
  .filter((s) => s.length >= 4 && !/^(the|workspace|test|demo|default)$/i.test(s) && !/caro.{0,3}ledge/i.test(s));
const res = blocklist.map((n) => ({ n, re: new RegExp(`\\b${escapeRe(n)}\\b`, "i") }));
console.log(`workspace-identity blocklist (${blocklist.length}): ${blocklist.join(", ")}`);

// fire-test the matcher before trusting it
const T = [
  ["the workspace, as importer, places packaging on the EU market", false],
  ["Dietl commissions crate fabrication on behalf of clients", true],
  ["BYD announced a battery advancement; Maersk piloted methanol", false],
  ["Rockit currently manages its case inventory manually", true],
];
let ok = 0;
for (const [txt, want] of T) { const got = res.some((r) => r.re.test(txt)); if (got === want) ok++; else console.log(`  FIRE-TEST FAIL: "${txt.slice(0, 40)}" got=${got} want=${want}`); }
console.log(`fire-test: ${ok}/${T.length} ok\n`);

const { data: items } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,full_brief").eq("provenance_status", "verified").eq("is_archived", false).limit(2000);
let pass = 0; const fails = [];
for (const it of items || []) {
  const fb = it.full_brief || ""; const hits = [];
  for (const r of res) if (r.re.test(fb)) hits.push(r.n);
  if (hits.length === 0) pass++; else fails.push({ it, hits: [...new Set(hits)] });
}
console.log(`===== VERIFIER: no-names (workspace-anchoring) =====`);
console.log(`verified briefs: ${(items || []).length}  |  PASS ${pass}  FAIL(workspace named) ${fails.length}\n`);
for (const f of fails.slice(0, 60)) console.log(`  [${f.it.item_type}] ${(f.it.legacy_id || f.it.id.slice(0, 8))} names [${f.hits.join(",")}]  ${(f.it.title || "").slice(0, 46)}`);
if (fails.length > 60) console.log(`  ... +${fails.length - 60} more`);
console.log(`\n=== no-names done (0 Browserless) ===`);
