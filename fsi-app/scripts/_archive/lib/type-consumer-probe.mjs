// ── READ-SIDE MIRROR of the bug-class detector — unguarded type-map consumers ──
//
// The paired hazard to FORM 2 (classifier-uncertain -> substantive default): once the
// item_type column default ('regulation') is dropped/neutralized (the real line-191 fix, a
// migration), an item_type can legitimately be absent/unknown, and any consumer that INDEXES a
// type->X lookup map and then DEREFERENCES the result without a null-guard CRASHES. It is
// type-safe TODAY only because the column default prevents unknown types — a row-48-shaped trap
// (safe now, a bug at a checkable trigger: the migration). The migration exposes ALL of them at
// once, so the fix is to FIND ALL, not patch the one the manual trace surfaced.
//
// THE SHAPE this flags: `MAP[expr.type]` (MAP an uppercase TYPE/LABEL/CHIP/COLOR/MAP/ICON
// constant) followed by a DEREFERENCE of the result (`.prop`) with NO null-guard (`?.`, `??`,
// `if (x)`). A DIRECT render `{MAP[expr.type]}` (undefined -> empty string, no crash) is NOT
// flagged. Discrimination: the deref-without-guard is the crash; the guarded/rendered forms pass.
//
// RESIDUAL: matches a lexicon over a small window. A deref split far from the index, or a map
// not matching the name pattern, evades it. Flags are CANDIDATES for review. Pair with the
// migration as a precondition: land consumer-hardening FIRST, then the column-default change.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

// A type->X lookup map indexed by a `.type` / `.item_type` expression.
const TYPE_MAP_INDEX =
  /\b([A-Z][A-Z0-9_]*(?:TYPE|LABEL|CHIP|COLOR|COLORS|MAP|ICON|BADGE|STYLE)[A-Z0-9_]*)\s*\[\s*([\w.$]+\.(?:item_)?type)\s*\]/;

export function findUnguardedTypeConsumers(text, file) {
  if (!/\.(item_)?type\s*\]/.test(text)) return [];
  const lines = text.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TYPE_MAP_INDEX);
    if (!m) continue;
    if (/^\s*(\/\/|\*)/.test(lines[i])) continue; // comment
    const map = m[1], expr = m[2];
    const idx = lines[i].indexOf(m[0]);
    const afterOnLine = lines[i].slice(idx + m[0].length);
    // guarded inline? optional-chain on the result, or a ?? / || fallback right after the ]
    if (/^\s*\?\./.test(afterOnLine) || /^\s*(\?\?|\|\|)/.test(afterOnLine)) continue;
    // direct render/return of the bare lookup (undefined -> empty, not a crash): `}` `)` `;` `,`
    const directUse = /^\s*[}>)\];,]/.test(afterOnLine) || afterOnLine.trim() === "";
    // assigned to a var then dereferenced unguarded within the next few lines?
    const assign = lines[i].match(/\b(const|let|var)\s+(\w+)\s*=\s*[^=]*$/);
    let derefed = false, derefLine = i;
    if (assign) {
      const v = assign[2];
      const win = lines.slice(i + 1, Math.min(lines.length, i + 14)); // wide enough for JSX between assign and deref
      for (let j = 0; j < win.length; j++) {
        if (new RegExp(`\\b${v}\\b\\s*\\?\\.`).test(win[j])) { derefed = false; break; } // v?.x = guarded
        if (new RegExp(`\\b${v}\\b\\.[a-zA-Z_]`).test(win[j])) { derefed = true; derefLine = i + 1 + j; break; }
      }
    }
    // inline deref on the same line: `MAP[x.type].prop`
    const inlineDeref = /^\s*\.[a-zA-Z_]/.test(afterOnLine);
    if (inlineDeref || derefed) {
      hits.push({ file, line: derefLine + 1, map, expr, verdict: "CANDIDATE_CORRUPT",
        why: `${map}[${expr}] result is dereferenced without a null-guard — crashes if ${expr} is absent/unknown (exposed when the item_type column default is dropped)`,
        snippet: lines[i].trim().slice(0, 110) });
    } else if (!directUse) {
      hits.push({ file, line: i + 1, map, expr, verdict: "REVIEW",
        why: `${map}[${expr}] used in a way that may deref the (possibly undefined) result — read it`,
        snippet: lines[i].trim().slice(0, 110) });
    }
  }
  return hits;
}

// Walk src/** directly — type-consumers live in UI components, which the fetch-surface
// registry deliberately excludes. Skip the probe's own selftest/probe files.
function walkSrc(root) {
  const out = [];
  const skip = /(^|[\\/])(node_modules|\.next|\.git|dist|build)([\\/]|$)/;
  const isProbe = /(probe|\.selftest)\.mjs$/;
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
  rec(resolve(root, "src"));
  return out;
}

export function auditTypeConsumers(root) {
  const all = [];
  for (const rel of walkSrc(root)) {
    let text;
    try { text = readFileSync(resolve(root, rel), "utf8"); } catch { continue; }
    all.push(...findUnguardedTypeConsumers(text, rel));
  }
  return all;
}

if (/type-consumer-probe\.mjs$/.test(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const root = resolve(process.argv[2] || ".");
  const hits = auditTypeConsumers(root);
  const corrupt = hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT");
  const review = hits.filter((h) => h.verdict === "REVIEW");
  console.log("=== unguarded type-map consumers (precondition for the item_type column-default migration) ===\n");
  console.log(`-- CANDIDATE_CORRUPT (index-then-deref, no guard): ${corrupt.length} --`);
  for (const h of corrupt) console.log(`  ${h.file}:${h.line}  ${h.map}[${h.expr}]\n      ${h.snippet}`);
  console.log(`\n-- REVIEW: ${review.length} --`);
  for (const h of review) console.log(`  ${h.file}:${h.line}  ${h.map}[${h.expr}]  — ${h.snippet}`);
  console.log(`\n=== ${corrupt.length} must-harden, ${review.length} review across ${new Set(hits.map((h) => h.file)).size} files ===`);
}
