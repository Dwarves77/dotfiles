/** VERIFIER (read-only, 0 Browserless): routing — item_type -> format -> surface.
 *  GOVERNING SKILLS:
 *   - caros-ledge-platform-intent -> "The Five Customer-Facing Surfaces" (BINDING five-surface model:
 *     Regulations, Market Intel, Research, Operations, Community; NO Technology surface).
 *   - environmental-policy-and-innovation -> "Format Mapping" (item_type -> format).
 *  Flags: (1) FORMAT-DRIFT: the brief's declared format != the item_type's expected format (mis-typed ->
 *  would surface on the wrong page — the "regulations only on Regulations" defect); (2) OFF-MODEL-SURFACE:
 *  technology/innovation/tool route to a 6th "Technology" surface outside the five (HOLD/re-home by substance);
 *  (3) UNKNOWN-TYPE: item_type maps to no surface. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// item_type -> { fmt: expected format token, surface }  (env-policy Format Mapping + platform-intent five surfaces)
const REG = ["regulation", "directive", "standard", "guidance", "framework", "law"];
const MAP = {};
for (const t of REG) MAP[t] = { fmt: "Regulatory Fact", surface: "Regulations" };
MAP.market_signal = { fmt: "Market Signal", surface: "Market Intel" };
MAP.initiative = { fmt: "Market Signal", surface: "Market Intel" };
MAP.research_finding = { fmt: "Research Summary", surface: "Research" };
MAP.regional_data = { fmt: "Operations Profile", surface: "Operations" };
for (const t of ["technology", "innovation", "tool"]) MAP[t] = { fmt: "Technology Profile", surface: "(OFF-MODEL: Technology — not one of the five)" };

const FMT_TOKENS = ["Regulatory Fact", "Market Signal", "Research Summary", "Operations Profile", "Technology Profile"];
// detect the brief's DECLARED format from its head (after the title line), tolerant
function detectFmt(brief) {
  const head = (brief || "").split(/\r?\n/).slice(0, 12).join("\n");
  for (const f of FMT_TOKENS) if (head.includes(f)) return f;
  return null;
}

// fire-test
const FT = [
  ["regulation", "# X\n## Regulatory Fact Document", null],         // matches -> no drift
  ["regulation", "# X\n## Market Signal Brief", "FORMAT-DRIFT"],     // reg typed but market format
  ["market_signal", "# X\n(no format header)", null],               // no declared fmt -> skip drift
  ["technology", "# X\n## Technology Profile", "OFF-MODEL-SURFACE"], // tech -> 6th surface
];
let ok = 0;
for (const [t, brief, want] of FT) {
  const m = MAP[t]; const det = detectFmt(brief);
  let got = null;
  if (!m) got = "UNKNOWN-TYPE";
  else if (m.surface.startsWith("(OFF-MODEL")) got = "OFF-MODEL-SURFACE";
  else if (det && det !== m.fmt) got = "FORMAT-DRIFT";
  if (got === want) ok++; else console.log(`  FIRE-TEST FAIL: type=${t} got=${got} want=${want}`);
}
console.log(`fire-test: ${ok}/${FT.length} ok\n`);

const { data: items } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,full_brief").eq("provenance_status", "verified").eq("is_archived", false).limit(2000);
let pass = 0; const drift = [], offModel = [], unknown = [];
for (const it of items || []) {
  const m = MAP[it.item_type];
  if (!m) { unknown.push({ it }); continue; }
  if (m.surface.startsWith("(OFF-MODEL")) { offModel.push({ it }); continue; }
  const det = detectFmt(it.full_brief);
  if (det && det !== m.fmt) drift.push({ it, det, exp: m.fmt });
  else pass++;
}
console.log(`===== VERIFIER: routing (item_type->format->surface) =====`);
console.log(`verified briefs: ${(items || []).length}  |  PASS ${pass}  FORMAT-DRIFT ${drift.length}  OFF-MODEL-SURFACE ${offModel.length}  UNKNOWN-TYPE ${unknown.length}\n`);
if (drift.length) { console.log(`── FORMAT-DRIFT (mis-typed -> wrong surface) (${drift.length}) ──`); for (const f of drift) console.log(`  [${f.it.item_type}] ${(f.it.legacy_id || f.it.id.slice(0, 8))} brief=${f.det} expected=${f.exp}  ${(f.it.title || "").slice(0, 42)}`); console.log(""); }
if (offModel.length) { console.log(`── OFF-MODEL-SURFACE: technology/innovation/tool -> 6th surface (HOLD/re-home) (${offModel.length}) ──`); for (const f of offModel) console.log(`  [${f.it.item_type}] ${(f.it.legacy_id || f.it.id.slice(0, 8))} ${(f.it.title || "").slice(0, 50)}`); console.log(""); }
if (unknown.length) { console.log(`── UNKNOWN-TYPE (${unknown.length}) ──`); for (const f of unknown) console.log(`  [${f.it.item_type}] ${(f.it.legacy_id || f.it.id.slice(0, 8))} ${(f.it.title || "").slice(0, 50)}`); }
console.log(`\n=== routing done (0 Browserless) ===`);
