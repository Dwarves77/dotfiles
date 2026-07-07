// ── The `const { data } = await supabase…` WITHOUT `error` bug-class detector ──
//
// Post-mortem (CLAUDE.md "agent/run error-swallow", 2026-05-08): a Supabase/PostgREST
// call returns `{ data, error }`. A destructure that binds `data` but DROPS `error`
// swallows the failure — the call silently returns null/[] and downstream cost gates,
// RLS-blocked reads, and missing-column errors go undetected (the four cost-protection
// mechanisms disabled for an unknown duration). DEEP-AUDIT GAPS #9 / MASTER-PLAN P5-3:
// ~108 live instances, and the named bug-class still had NO automated guard. This is it.
//
// THE SHAPE this flags: `const|let|var { data … } = await <supabase-call>` where the
// destructure binds `data` (as `data` or `data:`) but NOT `error`, and the awaited RHS is
// a Supabase/PostgREST call (`.from(` / `.rpc(` / a supabase-client identifier / `.auth.` /
// `.storage.`). Discrimination: a destructure that ALSO binds `error` passes; a non-Supabase
// awaited call (`request.json()`, `fetch()`, `axios`) passes (no {data,error} contract).
//
// ESCAPE HATCH: a line carrying `error-intentionally-ignored` (same line or the line above)
// is a deliberate, reviewed drop and is NOT flagged.
//
// SOFT / report-only by design: 108 legacy instances mean a hard-fail would train bypass.
// Run in bug-class-guard.yml's SOFT job (exit 0). Promote to a diff-gate (fail only on NEW
// candidates vs the merge base) once the legacy set is drained.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const ESCAPE = /error-intentionally-ignored/;

// A destructure that binds via `await`, capturing the brace body + the tail after `await`.
const DESTRUCTURE = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\b(.*)$/;

function bindsName(body, name) {
  // `name` bound as a shorthand (`data`), renamed (`data: foo`), or in a list — but not as a
  // substring of another identifier (`metadata`, `errorMessage`). The brace body may lead with
  // whitespace (`{ data }`), so the anchor allows start-or-delimiter then optional spaces.
  return new RegExp(`(?:^|[,{])\\s*${name}\\b`).test(body);
}

// Is the awaited RHS a Supabase/PostgREST call (the { data, error } contract)?
function supabaseContext(text) {
  return (
    /\.(from|rpc)\s*\(/.test(text) ||
    /\b(supabase|serviceClient|readClient|getServiceSupabase|getSupabase|getServiceClient)\b/.test(text) ||
    /\.auth\.(admin|getUser|getSession|signIn|signOut)\b/.test(text) ||
    /\.storage\.from\s*\(/.test(text)
  );
}

export function findErrorDrops(text, file) {
  const lines = text.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\*)/.test(line)) continue; // comment line
    const m = line.match(DESTRUCTURE);
    if (!m) continue;
    const body = m[1];
    if (!bindsName(body, "data")) continue; // only the {data,…} contract
    if (bindsName(body, "error")) continue; // error captured → fine
    // escape hatch: this line or the line above
    if (ESCAPE.test(line) || (i > 0 && ESCAPE.test(lines[i - 1]))) continue;
    // confirm the awaited RHS is a Supabase call: the tail on this line + a small window
    const tail = m[2] || "";
    const win = [tail, ...lines.slice(i + 1, Math.min(lines.length, i + 6))].join("\n");
    if (!supabaseContext(tail + "\n" + win)) continue;
    hits.push({
      file,
      line: i + 1,
      verdict: "CANDIDATE_DROP",
      snippet: line.trim().slice(0, 120),
      why: "Supabase `{ data }` destructure drops `error` — a failed call returns null/[] silently. Capture `error` (log it even if ignored) or add `// error-intentionally-ignored`.",
    });
  }
  return hits;
}

function walk(root, subdirs) {
  const out = [];
  const skip = /(^|[\\/])(node_modules|\.next|\.git|dist|build)([\\/]|$)/;
  const isProbe = /(probe|\.selftest|\.test)\.mjs$/;
  const rec = (dir) => {
    let ents;
    try { ents = readdirSync(dir); } catch { return; }
    for (const e of ents) {
      const p = resolve(dir, e);
      if (skip.test(p)) continue;
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) rec(p);
      else if (/\.(tsx?|jsx?|mjs)$/.test(e) && !isProbe.test(e)) out.push(relative(root, p).replace(/\\/g, "/"));
    }
  };
  for (const sd of subdirs) rec(resolve(root, sd));
  return out;
}

export function auditErrorDrops(root) {
  const all = [];
  for (const rel of walk(root, ["src", "scripts"])) {
    let text;
    try { text = readFileSync(resolve(root, rel), "utf8"); } catch { continue; }
    all.push(...findErrorDrops(text, rel));
  }
  return all;
}

if (/error-drop-probe\.mjs$/.test(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const root = resolve(process.argv[2] || ".");
  const hits = auditErrorDrops(root);
  const files = new Set(hits.map((h) => h.file)).size;
  console.log("=== Supabase `{ data }` without `error` — swallowed-failure candidates (report-only) ===\n");
  for (const h of hits) console.log(`  ${h.file}:${h.line}\n      ${h.snippet}`);
  console.log(`\n=== ${hits.length} candidate(s) across ${files} file(s). Capture \`error\` or add // error-intentionally-ignored. ===`);
}
