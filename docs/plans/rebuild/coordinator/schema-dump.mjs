// Produce the production schema dump with the portable pg_dump, using the repo's own connection candidates.
// Prints only counts and redacted status; never a connection string or password.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { candidateConnStrings } from "file:///<repo>/fsi-app/scripts/lib/pg-conn.mjs";

// Load fsi-app/.env into process.env (not printed).
const envPath = "<repo>/fsi-app/.env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (!m) continue;
  let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}
const out = process.argv[2] || "C:/tmp/schema-2026-10-12.sql";
const PGDUMP = "C:/tmp/pgtools/pgsql/bin/pg_dump.exe";
const cands = candidateConnStrings(process.env);
console.log(`candidates: ${cands.length}`);
let done = false;
for (let i = 0; i < cands.length && !done; i++) {
  if (existsSync(out)) unlinkSync(out);
  const r = spawnSync(PGDUMP, ["--schema-only", "--no-owner", "--schema=public", "-f", out, cands[i]], { encoding: "utf8", timeout: 600000 });
  const err = (r.stderr || "").replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").split("\n").filter(Boolean).slice(0, 3).join(" | ");
  console.log(`candidate ${i}: exit ${r.status}${err ? " | " + err.slice(0, 200) : ""}`);
  if (r.status === 0 && existsSync(out)) done = true;
}
if (!done) { console.log("NO DUMP"); process.exit(1); }
const text = readFileSync(out, "utf8");
const lines = text.split("\n");
const count = (re) => lines.filter((l) => re.test(l)).length;
console.log(`lines ${lines.length}; COPY/INSERT ${count(/^(COPY |INSERT )/)}; CREATE TABLE ${count(/^CREATE TABLE/)}; CREATE POLICY ${count(/^CREATE POLICY/)}; FUNCTION ${count(/^CREATE (OR REPLACE )?FUNCTION/)}; TRIGGER ${count(/^CREATE TRIGGER/)}; VIEW ${count(/^CREATE (OR REPLACE )?(MATERIALIZED )?VIEW/)}; INDEX ${count(/^CREATE (UNIQUE )?INDEX/)}; ENABLE RLS ${count(/ENABLE ROW LEVEL SECURITY/)}; GRANT ${count(/^GRANT /)}`);
