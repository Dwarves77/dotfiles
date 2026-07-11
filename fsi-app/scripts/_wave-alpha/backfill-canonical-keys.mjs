/**
 * Wave-α Track C8 (RD-5 data step for migration 200) — backfill intelligence_items.canonical_instrument_key.
 *
 * GOVERNING SKILLS: remediation-discipline (RD-5 "status is a cache": a uniqueness migration ships its
 * data step) + environmental-policy-and-innovation (instrument identity / EP-11).
 *
 * Migration 200 adds the column + the BEFORE INSERT/UPDATE trigger, but does NOT write data (schema-only,
 * two-track policy). This script is that data step: it populates canonical_instrument_key for every EXISTING
 * row whose key is CONFIDENTLY derivable, through the guarded write path (db.mjs guardedUpdate — cite +
 * prior-value snapshot + read-back). The JS deriver here is a byte-for-byte mirror of the SQL
 * derive_canonical_instrument_key() in migration 200, so the value this script writes equals what the trigger
 * would compute (the trigger fires on the same UPDATE and confirms it).
 *
 * DRY-RUN by default; --apply writes. Idempotent: a second run finds 0 rows to change. The orchestrator runs
 * it --apply AFTER migration 200 is applied.
 *
 * Rule-012: import.meta.url-relative env load, no hardcoded absolute paths.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");

const CITE = {
  skill: "remediation-discipline",
  reason: "Wave-α C8 backfill canonical_instrument_key (RD-5 data step for migration 200)",
};

// EXACT mirror of public.derive_canonical_instrument_key(p_instr, p_src_url) in migration 200.
const ELI_MAP = { reg: "R", dir: "L", dec: "D" };
export function deriveKey(instr, src) {
  const i = instr || "";
  const u = src || "";
  let m;
  // (1) full CELEX token in instrument_identifier
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})/); if (m) return m[1].toUpperCase();
  // (2) ELI path in instrument_identifier
  m = i.match(/^eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/); if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  // (3) CELEX token in source_url (incl. URL-encoded CELEX%3A)
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})/); if (m) return m[1].toUpperCase();
  // (4) ELI path in source_url
  m = u.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/); if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  return null;
}

async function main() {
  console.log(`[c8-backfill] mode = ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const COLS_FULL = "id, instrument_identifier, source_url, canonical_instrument_key, provenance_status, is_archived";
  const COLS_BASE = "id, instrument_identifier, source_url, provenance_status, is_archived";
  let rows;
  try {
    rows = await readAll("intelligence_items", COLS_FULL);
  } catch (e) {
    if (/canonical_instrument_key.*does not exist/i.test(e.message)) {
      if (APPLY) { console.error("[c8-backfill] REFUSING --apply: migration 200 (canonical_instrument_key column) is not applied yet."); process.exit(1); }
      console.warn("[c8-backfill] canonical_instrument_key column absent (migration 200 not yet applied) — DRY-RUN computes targets as if the column were all-NULL.");
      rows = (await readAll("intelligence_items", COLS_BASE)).map((r) => ({ ...r, canonical_instrument_key: null }));
    } else throw e;
  }
  console.log(`[c8-backfill] items scanned: ${rows.length}`);

  const targets = [];
  for (const r of rows) {
    const derived = deriveKey(r.instrument_identifier, r.source_url);
    if (derived && derived !== r.canonical_instrument_key) {
      targets.push({ ...r, derived });
    }
  }
  console.log(`[c8-backfill] derivable rows needing a write: ${targets.length}`);
  for (const t of targets) {
    const tag = `${t.provenance_status}${t.is_archived ? "/arch" : ""}`;
    console.log(`   ${t.id.slice(0, 8)} [${tag}] instr=${JSON.stringify(t.instrument_identifier)} -> ${t.derived}`);
  }

  // Pre-flight the twin-defect guard the same way the index will: no two verified+live rows may share a key.
  const liveVerified = new Map();
  for (const r of rows) {
    const key = deriveKey(r.instrument_identifier, r.source_url);
    if (!key || r.provenance_status !== "verified" || r.is_archived) continue;
    if (!liveVerified.has(key)) liveVerified.set(key, []);
    liveVerified.get(key).push(r.id.slice(0, 8));
  }
  const collisions = [...liveVerified.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length) {
    console.error(`[c8-backfill] ABORT — ${collisions.length} verified+live canonical-key collision(s) (the unique index would reject these; resolve via the C7.3 merge FIRST):`);
    for (const [k, ids] of collisions) console.error(`   ${k}: ${ids.join(", ")}`);
    process.exit(1);
  }
  console.log("[c8-backfill] pre-flight OK — 0 verified+live collisions (index-safe).");

  if (!APPLY) { console.log("[c8-backfill] DRY-RUN — pass --apply to write."); return; }
  if (!targets.length) { console.log("[c8-backfill] nothing to write."); return; }

  let ok = 0, bad = 0;
  for (const t of targets) {
    try {
      const res = await guardedUpdate(
        "intelligence_items",
        (qb) => qb.eq("id", t.id),
        { canonical_instrument_key: t.derived },
        { cite: CITE, select: "id, canonical_instrument_key" }
      );
      const after = res.rows?.[0]?.canonical_instrument_key;
      if (after === t.derived) ok++;
      else { console.error(`[c8-backfill] READ-BACK MISMATCH ${t.id.slice(0, 8)}: wrote ${t.derived}, read ${after}`); bad++; }
    } catch (e) {
      console.error(`[c8-backfill] write FAIL ${t.id.slice(0, 8)}: ${e.message}`); bad++;
    }
  }
  console.log(`[c8-backfill] written+verified=${ok} failed=${bad}`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error("[c8-backfill] fatal:", e); process.exit(1); });
