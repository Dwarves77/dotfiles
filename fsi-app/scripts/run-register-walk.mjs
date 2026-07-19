// run-register-walk.mjs — B2 runner (scrape-and-build plan, 2026-07-19): walk a register's dated index
// (EUR-Lex OJ daily views / Federal Register documents API) and feed the SAME ledger B1 consumes.
// Free HTTP only (the FR API needs no key; OJ daily views are server-rendered HTML), hold-gated with
// the F16 manual caller. Consume the resulting candidates with scripts/run-portal-harvest.mjs --consume.
//
// Usage:
//   node scripts/run-register-walk.mjs --register eurlex-oj      --from 2026-07-17 --to 2026-07-18 [--series L]
//   node scripts/run-register-walk.mjs --register federal-register --from 2026-07-14 --to 2026-07-18
//        [--types RULE,PRORULE] [--term freight] [--per-page 100] [--max-pages 5]
//   [--source <uuid|url-substring>]  attach candidates to this registered source (defaults per register)
//
// Env (source .env.local first): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flagOpt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};

const REGISTER = flagOpt("register", null);
const FROM = flagOpt("from", null);
const TO = flagOpt("to", null);
if (!REGISTER || !FROM || !TO) {
  console.error("usage: run-register-walk.mjs --register eurlex-oj|federal-register --from YYYY-MM-DD --to YYYY-MM-DD [--series L] [--types RULE] [--term x] [--per-page 100] [--max-pages 5] [--source <uuid|url-substring>]");
  process.exit(2);
}
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v} (source fsi-app/.env.local)`); process.exit(2); }
}

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { walkEurlexOj, walkFederalRegister } = await jiti.import("../src/lib/sources/register-walk.mjs");
const { persistPortalCandidates } = await jiti.import("../src/lib/intake/portal-harvest.ts");
const { assertFetchAllowed } = await jiti.import("../src/lib/sources/fetch-hold.mjs");
const { MANUAL_INTAKE_CALLER } = await jiti.import("../src/lib/intake/run-intake-cycle.ts");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── resolve the source the candidates attach to (defaults: the register's root portal row) ──────────
const DEFAULT_SOURCE_MATCH = { "eurlex-oj": "eur-lex.europa.eu/", "federal-register": "federalregister.gov/" };
const srcSel = flagOpt("source", DEFAULT_SOURCE_MATCH[REGISTER]);
const isUuid = /^[0-9a-f-]{36}$/i.test(srcSel ?? "");
const { data: srcRows, error: srcErr } = isUuid
  ? await sb.from("sources").select("id,name,url").eq("id", srcSel)
  : await sb.from("sources").select("id,name,url").ilike("url", `%${srcSel}%`).order("url");
if (srcErr) { console.error(`source lookup failed: ${srcErr.message}`); process.exit(1); }
// non-uuid default match: prefer the shortest url (the root portal row over per-instrument rows)
const source = isUuid ? srcRows?.[0] : (srcRows ?? []).sort((a, b) => a.url.length - b.url.length)[0];
if (!source) { console.error(`no source matches '${srcSel}'`); process.exit(1); }
console.log(`register=${REGISTER}  ${FROM}..${TO}  → source: ${source.name ?? "(unnamed)"}  ${source.url}  [${source.id}]`);

const ua = { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" };
const persist = (links) => persistPortalCandidates(sb, source.id, links);

let summary;
if (REGISTER === "eurlex-oj") {
  summary = await walkEurlexOj(
    {
      fetchHtml: async (url) => {
        assertFetchAllowed(url, process.env, MANUAL_INTAKE_CALLER);
        const r = await fetch(url, { headers: { ...ua, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      },
      persist,
    },
    { from: FROM, to: TO, series: flagOpt("series", "L") }
  );
  for (const d of summary.days) {
    console.log(`  ${d.day}  extracted=${d.extracted} upserted=${d.upserted}${d.error ? `  ERROR: ${d.error}` : ""}`);
  }
} else if (REGISTER === "federal-register") {
  summary = await walkFederalRegister(
    {
      fetchJson: async (url) => {
        assertFetchAllowed(url, process.env, MANUAL_INTAKE_CALLER);
        const r = await fetch(url, { headers: { ...ua, accept: "application/json" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      },
      persist,
    },
    {
      from: FROM, to: TO,
      types: flagOpt("types", "RULE").split(",").map((s) => s.trim()).filter(Boolean),
      term: flagOpt("term", undefined),
      perPage: Number(flagOpt("per-page", "100")),
      maxPages: Number(flagOpt("max-pages", "5")),
    }
  );
  for (const p of summary.pages) console.log(`  page ${p.page}: results=${p.results} upserted=${p.upserted}`);
  if (summary.droppedPages) {
    console.log(`  NOT COLLECTED: ${summary.droppedPages} of ${summary.totalPages} pages beyond --max-pages (bounded walk, reported not silent)`);
  }
} else {
  console.error(`unknown register '${REGISTER}'`);
  process.exit(2);
}
console.log(`\nwalk total: upserted=${summary.upserted} failed=${summary.failed}`);
console.log(`next: node scripts/run-portal-harvest.mjs --source ${source.id} --consume --mode plan --limit 25`);
