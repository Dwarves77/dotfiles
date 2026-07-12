/**
 * source-institution-backfill.mjs — guarded data-op. Seeds the institutions table from active
 * sources (grouped by registrable domain = eTLD+1) and sets sources.institution_id. GROUPING
 * ONLY — never merges sources. Additive + reversible (institution_id nullable; reversal nulls
 * it + deletes institutions). dry-run default (--execute --confirm). Per-row read-back.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");

// ⛔ SUPERSEDED / DIVERGENT (C4, 2026-07-12). The SLD algorithm below MIS-GROUPS super-domain subdomains
// (europa.eu collapsed 17-way incl. eur-lex T1; ca.gov/ny.gov/wa.gov/nc.gov/ct.gov state-gov) versus the
// canonical hostInstitution (src/lib/sources/institution.ts, TWO_LEVEL set). Its live output was CORRECTED
// in-place (snapshot institution_regroup_snapshot_20260712; docs/audits/institution-etld1-retro-check-2026-07-12.md).
// Re-running would RE-CORRUPT. Hard-gated until registrableDomain() is pointed at the canonical hostInstitution.
if (EXECUTE) {
  throw new Error(
    "source-institution-backfill.mjs is DIVERGENT (C4): its SLD grouping mis-merges super-domain subdomains " +
      "(europa.eu/ca.gov/...). Point registrableDomain() at the canonical hostInstitution before --execute. " +
      "See docs/audits/institution-etld1-retro-check-2026-07-12.md"
  );
}

// registrable domain (eTLD+1) with a curated multi-part ccTLD second-level set so e.g.
// mpa.gov.sg -> mpa.gov.sg (MPA), meti.go.jp -> meti.go.jp (METI), *.unctad.org -> unctad.org.
const SLD = new Set(["gov","ac","co","com","org","net","edu","go","ne","or","re","nic","govt","gob","gc","asn","id","res","lg","nhs","mil","sch","parliament"]);
function registrableDomain(rawUrl) {
  let host; try { host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
  const p = host.split(".").filter(Boolean);
  if (p.length <= 2) return host;
  const tld = p[p.length - 1], sld = p[p.length - 2];
  if (tld.length === 2 && SLD.has(sld)) return p.slice(-3).join("."); // ccTLD second-level -> keep 3
  return p.slice(-2).join("."); // normal -> registrable = last 2
}
const confRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);
try {
  const srcs = (await q(`SELECT id, name, url, classification_confidence conf, institution_id FROM sources WHERE status='active'`)).rows;
  const groups = new Map(); const unresolved = [];
  for (const s of srcs) {
    const rd = registrableDomain(s.url);
    if (!rd) { unresolved.push(s); continue; }
    (groups.get(rd) || groups.set(rd, []).get(rd)).push(s);
  }
  // institution name per domain: highest-confidence source's name, tie-break shortest
  const instName = (rows) => [...rows].sort((a, b) => (confRank[b.conf] || 0) - (confRank[a.conf] || 0) || (a.name || "").length - (b.name || "").length)[0].name;

  console.log(`===== INSTITUTION BACKFILL — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} =====`);
  console.log(`  active sources: ${srcs.length}   distinct institutions (by registrable domain): ${groups.size}   unresolved (no host): ${unresolved.length}`);
  // multi-source institutions (the grouping that matters)
  const multi = [...groups.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
  console.log(`  institutions with >1 source: ${multi.length}  (top 12):`);
  for (const [rd, v] of multi.slice(0, 12)) console.log(`    x${String(v.length).padStart(2)}  ${rd.padEnd(28)} "${String(instName(v)).slice(0, 34)}"`);

  let instCreated = 0, fkSet = 0, halted = false;
  if (EXECUTE) {
    for (const [rd, rows] of groups) {
      const nm = instName(rows);
      const ins = await q(`INSERT INTO institutions (name, registrable_domain) VALUES ($1,$2)
        ON CONFLICT (registrable_domain) DO NOTHING RETURNING id`, [nm, rd]);
      let instId = ins.rows[0]?.id;
      if (!instId) instId = (await q(`SELECT id FROM institutions WHERE registrable_domain=$1`, [rd])).rows[0].id;
      else instCreated++;
      for (const s of rows) {
        if (s.institution_id) continue;
        const u = await q(`UPDATE sources SET institution_id=$2 WHERE id=$1 AND institution_id IS NULL RETURNING institution_id`, [s.id, instId]);
        if (u.rowCount !== 1 || u.rows[0].institution_id !== instId) { halted = true; console.error(`  HALT: FK set failed for ${s.id}`); break; }
        fkSet++;
      }
      if (halted) break;
    }
    const resolved = (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND institution_id IS NOT NULL`)).rows[0].n;
    const stillNull = (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND institution_id IS NULL`)).rows[0].n;
    const total = (await q(`SELECT count(*)::int n FROM institutions`)).rows[0].n;
    console.log(`\n  institutions created: ${instCreated}   FK set: ${fkSet}   halted: ${halted}`);
    console.log(`  RESOLVED active sources: ${resolved}   still NULL: ${stillNull}   total institutions: ${total}`);
    writeFileSync(resolve(__dirname, "_diag", "institution-backfill-log.json"), JSON.stringify({ instCreated, fkSet, resolved, stillNull, total, unresolved: unresolved.map((s) => ({ id: s.id, url: s.url })) }, null, 0));
    console.log(`  ledger -> scripts/_diag/institution-backfill-log.json  (reverse: UPDATE sources SET institution_id=NULL; DELETE FROM institutions)`);
    console.log(halted ? "\n  HALTED." : "\n  DONE (executed).");
  } else {
    if (unresolved.length) { console.log(`\n  unresolved sample:`); for (const s of unresolved.slice(0, 6)) console.log(`    ${s.id.slice(0,8)} ${s.url}`); }
    console.log(`\n  DRY-RUN only. Re-run with  --execute --confirm.`);
  }
} finally { await c.end(); }
