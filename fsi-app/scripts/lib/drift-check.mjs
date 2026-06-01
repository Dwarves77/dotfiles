// D3 — drift-check engine (intent-vs-code).
//
// Predicates are BEHAVIORAL (AST), not text: a token in a comment or string is NOT
// a CallExpression, so the stale-comment trap (a header comment naming a fn, or
// `verification.ts` saying "browserlessRender is overkill") cannot false-IMPLEMENT.
// A predicate that is runtime-only, or expressible only as text, → UNCONFIRMABLE
// (LOUD — never silent-pass; inconclusive ≠ implemented).
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";

export const DRIFT = Object.freeze({
  IMPLEMENTED: "IMPLEMENTED",
  DRIFTED: "DRIFTED",
  UNCONFIRMABLE: "UNCONFIRMABLE",
});

function parseSource(text) {
  return ts.createSourceFile("anchor.ts", text, ts.ScriptTarget.Latest, /*setParentNodes*/ true);
}
function calleeName(e) {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}
function eachCall(sf, fn) {
  (function visit(n) { if (ts.isCallExpression(n)) fn(n); ts.forEachChild(n, visit); })(sf);
}

// behavioral: a real CALL to `callee` exists (a comment/string mention is not a call).
function calls(sf, callee) {
  let found = false;
  eachCall(sf, (n) => { if (calleeName(n.expression) === callee) found = true; });
  return found;
}
// behavioral: any `fetch(` whose first arg is a variable/property/template, or an
// http string literal that is NOT the model API → a raw source-content fetch.
function hasRawSourceFetch(sf) {
  let raw = false;
  eachCall(sf, (n) => {
    if (calleeName(n.expression) !== "fetch") return;
    const a = n.arguments[0];
    if (!a) return;
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
      if (/^https?:\/\//i.test(a.text) && !/api\.anthropic\.com/i.test(a.text)) raw = true;
    } else if (ts.isIdentifier(a) || ts.isPropertyAccessExpression(a) || ts.isTemplateExpression(a)) {
      raw = true; // fetch(<var>) — a source-url variable
    }
  });
  return raw;
}

// Evaluate a predicate against SOURCE TEXT (used directly by the self-tests).
export function evalPredicate(sourceText, predicate) {
  if (predicate.kind === "runtime")
    return { verdict: DRIFT.UNCONFIRMABLE, reason: `runtime fact, not statically determinable: ${predicate.desc}` };
  if (predicate.kind === "textOnly")
    return { verdict: DRIFT.UNCONFIRMABLE, reason: `predicate is text-only — grep cannot prove behavior: ${predicate.desc}` };
  let sf;
  try { sf = parseSource(sourceText); } catch { return { verdict: DRIFT.UNCONFIRMABLE, reason: "parse failed" }; }
  switch (predicate.kind) {
    case "calls": {
      const ok = calls(sf, predicate.callee);
      return { verdict: ok ? DRIFT.IMPLEMENTED : DRIFT.DRIFTED, reason: `behavioral calls(${predicate.callee})=${ok}` };
    }
    case "noRawSourceFetch": {
      const raw = hasRawSourceFetch(sf);
      return { verdict: raw ? DRIFT.DRIFTED : DRIFT.IMPLEMENTED, reason: `hasRawSourceFetch=${raw}` };
    }
    default:
      return { verdict: DRIFT.UNCONFIRMABLE, reason: `unknown predicate kind: ${predicate.kind}` };
  }
}

// Evaluate a decision-log anchor: { decision, file, predicate, expect }.
export function evaluateAnchor(a) {
  if (a.predicate.kind === "runtime" || a.predicate.kind === "textOnly")
    return { ...evalPredicate("", a.predicate), decision: a.decision, file: a.file };
  if (!a.file || !existsSync(a.file))
    return { verdict: DRIFT.UNCONFIRMABLE, reason: `file missing: ${a.file}`, decision: a.decision, file: a.file };
  return { ...evalPredicate(readFileSync(a.file, "utf8"), a.predicate), decision: a.decision, file: a.file };
}

// The NAIVE text predicate — NOT used for verdicts. Exposed only so the self-tests
// can demonstrate that text would false-IMPLEMENT where AST correctly reports DRIFTED.
export function textGrepHas(filePath, token) {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, "utf8").includes(token);
}
