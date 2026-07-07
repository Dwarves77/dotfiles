// READ-ONLY blast-radius probe for the criterion-4 legal-line guard (WS1 edit 4). The guard would flag an
// ANALYSIS claim that asserts a PRESENT-TENSE ENACTED-LAW REQUIREMENT (laundering a binding requirement
// under an analysis label to escape the floor). Measure how many EXISTING ANALYSIS claims/items the
// targeted pattern would newly flag BEFORE writing the migration — a guard that mass-fires is a regression.
// No writes, no spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c, eqcol, eqval) => { const o = []; for (let f = 0; ; f += 1000) { let q = sb.from(t).select(c).order("id").range(f, f + 999); if (eqcol) q = q.eq(eqcol, eqval); const { data } = await q; if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

// Targeted: "the <law> requires/mandates/...", "is required under/by the <law>", "legally required".
// Deliberately NARROW — generic colloquial modals ("operators must adapt") are NOT matched.
const LEGAL_REQ = /\b(the\s+(regulation|law|directive|rule|act|amendment|mechanism|standard)\s+(requires|mandates|obligates|prohibits|requires that|imposes))|(is\s+required\s+(under|by)\s+(the\s+)?(regulation|law|directive|rule|act))|(legally\s+required)\b/i;
// Forward markers exempt a claim (it is forthcoming, not present-tense enacted) -> legitimately ANALYSIS.
const FORWARD = /\b(propos|would|will\b|expected|forthcoming|under\s+consultation|in\s+consultation|draft|anticipat|pending|set\s+to|by\s+20\d\d|from\s+20\d\d|effective\s+(from\s+)?20\d\d|once\s+(adopted|enacted)|if\s+adopted)\b/i;

const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,claim_text,source_tier_at_grounding");
const analysis = claims.filter((c) => c.claim_kind === "ANALYSIS");
const flagged = analysis.filter((c) => { const t = String(c.claim_text || ""); return LEGAL_REQ.test(t) && !FORWARD.test(t); });
const flaggedItems = new Set(flagged.map((c) => c.intelligence_item_id));
const allItems = new Set(claims.map((c) => c.intelligence_item_id));

console.log(`=== LEGAL-LINE GUARD BLAST RADIUS (read-only) ===`);
console.log(`total claims: ${claims.length}   ANALYSIS claims: ${analysis.length}`);
console.log(`ANALYSIS flagged by guard (present-tense enacted-law requirement, not forward-marked): ${flagged.length}`);
console.log(`distinct items newly implicated: ${flaggedItems.size} of ${allItems.size}`);
console.log(`\n--- sample flagged claims (up to 25) ---`);
for (const c of flagged.slice(0, 25)) console.log(`  [${c.intelligence_item_id.slice(0,8)} tier=${c.source_tier_at_grounding ?? "NULL"}] ${String(c.claim_text).slice(0, 130)}`);
process.exit(0);
