/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: environmental-policy-and-innovation + remediation-discipline.
 *
 *  INVARIANT EP-11 (canonical-instrument-key uniqueness — the twin-defect guard): no two VERIFIED,
 *  non-archived intelligence_items may share a canonical_instrument_key. Two verified rows for one
 *  instrument = two live customer-visible copies of the same regulation (the PPWR-both-verified defect,
 *  DB-2 F3). This is the live-data truth-teller for the partial unique index
 *  uq_intelligence_items_canonical_key_verified_live (migration 200); it also DERIVES the key on-the-fly
 *  (same logic as the SQL deriver) so it catches a would-be verified twin even before the column is
 *  backfilled — a defense the index alone (stored-column only) cannot give. Exit 1 on any collision. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

// Mirror of public.derive_canonical_instrument_key() (migration 200) + backfill-canonical-keys.mjs.
const ELI_MAP = { reg: "R", dir: "L", dec: "D" };
function deriveKey(instr, src) {
  const i = instr || "", u = src || "";
  let m;
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})/); if (m) return m[1].toUpperCase();
  m = i.match(/^eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/); if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})/); if (m) return m[1].toUpperCase();
  m = u.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/); if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  return null;
}

let rows, hasStoredColumn = true;
try {
  rows = await readAll("intelligence_items", "id, title, instrument_identifier, source_url, canonical_instrument_key, provenance_status, is_archived");
} catch (e) {
  if (/canonical_instrument_key.*does not exist/i.test(e.message)) {
    hasStoredColumn = false;
    console.warn("[canonical-key-uniqueness] canonical_instrument_key column absent (migration 200 not yet applied) — checking DERIVED keys only.");
    rows = (await readAll("intelligence_items", "id, title, instrument_identifier, source_url, provenance_status, is_archived")).map((r) => ({ ...r, canonical_instrument_key: null }));
  } else throw e;
}
const live = rows.filter((r) => r.provenance_status === "verified" && !r.is_archived);

function collisions(keyOf) {
  const by = new Map();
  for (const r of live) {
    const k = keyOf(r);
    if (!k) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by.entries()].filter(([, rs]) => rs.length > 1);
}

const stored = collisions((r) => r.canonical_instrument_key);         // mirrors the unique index exactly
const derived = collisions((r) => deriveKey(r.instrument_identifier, r.source_url)); // pre-backfill defense

console.log(`[canonical-key-uniqueness] verified+live items: ${live.length} | stored-key collisions: ${stored.length} | derived-key collisions: ${derived.length}`);
for (const [k, rs] of stored)
  console.log(`  STORED VIOLATION ${k}: ${rs.map((r) => r.id.slice(0, 8)).join(", ")}`);
for (const [k, rs] of derived)
  console.log(`  DERIVED VIOLATION ${k}: ${rs.map((r) => `${r.id.slice(0, 8)} (${JSON.stringify(r.instrument_identifier)})`).join(", ")}`);

if (stored.length || derived.length) {
  console.log(`\nFAIL: ${stored.length + derived.length} canonical-key collision group(s) among verified+live items. Two verified rows for one instrument = duplicate customer-visible copies. Merge via the C7.3 guarded-merge path (archive_reason='duplicate_instrument'), keeping the richer/primary row.`);
  process.exit(1);
}
console.log("PASS: every verified+live item has a unique canonical instrument key (no same-instrument twins).");
process.exit(0);
