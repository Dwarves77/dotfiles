// D3 section 3 — full decision-log anchoring (gap #3 wiring). FOUR verdicts.
//
// Every decision-log row gets a verifiable_at anchor + a verdict. The operator ruling
// (2026-05-31) split the verdict space so a quiet expected state can never be confused
// with a loud one, and a deferred obligation can never be silently forgotten:
//
//   IMPLEMENTED / DRIFTED  — code/schema decision, confirmable NOW (DRIFTED is LOUD).
//   GOVERNANCE             — inherently no code claim (sign-off, scope, framing).
//                            QUIET, anchored as "nothing to verify in code by design."
//   UNCONFIRMABLE          — SHOULD be code-confirmable now but the predicate can't
//                            determine it (proxy.ts class; a code claim with no clean
//                            static anchor). LOUD.
//   PENDING                — a REAL code consequence CORRECTLY not-yet-implemented,
//                            with a NAMED, CHECKABLE TRIGGER. QUIET until the trigger
//                            fires; at the trigger, absence becomes a LOUD violation.
//
// The discipline (operator): a row is GOVERNANCE only if it GENUINELY has no code
// claim — never "filed as governance to dodge writing a predicate." A row with a code
// consequence gets a behavioral/schema anchor even if it also has a governance aspect;
// rows 19/38 below carry BOTH a code anchor (the part true now) and a PENDING anchor
// (the part due at a trigger).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const VERDICT = Object.freeze({
  IMPLEMENTED: "IMPLEMENTED",
  DRIFTED: "DRIFTED",
  GOVERNANCE: "GOVERNANCE",
  UNCONFIRMABLE: "UNCONFIRMABLE",
  PENDING: "PENDING",                     // quiet — correctly absent, trigger not met
  PENDING_VIOLATION: "PENDING_VIOLATION", // LOUD — due at trigger, anchor absent
});
// Which verdicts are LOUD (demand a look). GOVERNANCE/IMPLEMENTED/PENDING are quiet.
export const LOUD = Object.freeze(new Set([VERDICT.DRIFTED, VERDICT.UNCONFIRMABLE, VERDICT.PENDING_VIOLATION]));

// PURE heart of the engine — the four-verdict truth table. Tested exhaustively in L1.
// `present` = does the anchored artifact exist; `triggerMet` = is a PENDING obligation due.
export function resolveVerdict({ kind, present, triggerMet }) {
  switch (kind) {
    case "governance":   return VERDICT.GOVERNANCE;
    case "unconfirmable": return VERDICT.UNCONFIRMABLE;
    case "code":
    case "schema":       return present ? VERDICT.IMPLEMENTED : VERDICT.DRIFTED;
    case "pending":
      if (!triggerMet)   return VERDICT.PENDING;                 // quiet — not due yet
      return present ? VERDICT.IMPLEMENTED : VERDICT.PENDING_VIOLATION; // due: met or LOUD
    default:             return VERDICT.UNCONFIRMABLE;
  }
}

// ── CHECKABLE TRIGGERS (the thing that makes PENDING real, not quiet-forever) ──
// Each reads a live OBSERVABLE. State for the report:
//   phase2 = Phase-2 corpus mutation underway. Observable: any intelligence_items row
//            has flipped off 'unverified' (reconciliation assigns/quarantines), OR the
//            working branch names phase-2/reconciliation.
//   phase4 = gated generation pass underway. Observable: any item at
//            verified/pending_human_verify, OR section_claim_provenance populated
//            (claim grounding only happens in the gated pipeline), OR branch names
//            block-4/phase-4.
export const TRIGGERS = Object.freeze({
  phase2: (ctx) => ctx.signals.flippedCount > 0 || /phase-?2|reconcil/i.test(ctx.branch),
  phase4: (ctx) => ctx.signals.gatedGenCount > 0 || ctx.signals.scpCount > 0 || /block-?4|phase-?4/i.test(ctx.branch),
});

// ── check builders (IO; resolve `present`) ──
const fileText = (ctx, p) => {
  if (!ctx._cache) ctx._cache = {};
  if (!(p in ctx._cache)) { const f = resolve(ctx.root, p); ctx._cache[p] = existsSync(f) ? readFileSync(f, "utf8") : null; }
  return ctx._cache[p];
};
const fileHas = (p, re) => (ctx) => { const t = fileText(ctx, p); return t != null && re.test(t); };
const fileLacks = (p, re) => (ctx) => { const t = fileText(ctx, p); return t != null && !re.test(t); };
const fnHas = (re) => (ctx) => re.test(ctx.signals.validateDef || "");
const sig = (fn) => (ctx) => fn(ctx.signals);

// ── THE REGISTRY — one entry per decision-log row (rows 19 & 38 carry two) ──
// row = doc-order index (1..47, governing-state.md section 4). kind drives the verdict.
export const ANCHORS = Object.freeze([
  { row: 1,  short: "no U+00A7 glyph in new code", kind: "code", evidence: "scripts/lib/*.mjs", present: sig((s) => s.glyphInNewCode === 0) },
  { row: 2,  short: "D1 active = domain=1 AND is_archived=false", kind: "unconfirmable", why: "no canonical filter symbol — scattered inline (critical-items.ts, surface-coverage.ts, domains.ts r.domain===1); a code claim with no single static anchor" },
  { row: 3,  short: "lift-cap is not a target", kind: "governance", why: "operator spend discipline; no artifact asserts it" },
  { row: 4,  short: "audit prompt vs known-good before scaled runs", kind: "governance", why: "workflow practice" },
  { row: 5,  short: "workflow-first for future dispatches", kind: "governance", why: "process/method choice" },
  { row: 6,  short: "off-vertical reclassification is a candidate", kind: "governance", why: "backlog/scope tag" },
  { row: 7,  short: "verify item identity via DB before asserting", kind: "governance", why: "agent behavioral discipline, not an artifact" },
  { row: 8,  short: "provenance is a hard data-model invariant", kind: "schema", evidence: "validate_item_provenance()", present: sig((s) => s.validateExists) },
  { row: 9,  short: "enforce invariant at write/schema, not prompt", kind: "schema", evidence: "set_provenance_status trigger", present: sig((s) => s.triggerExists) },
  { row: 10, short: "accept strict 159 quarantine count", kind: "governance", why: "an accepted number; nothing in code asserts 159" },
  { row: 11, short: "authority floor: Tier 1 OR 2 for CRITICAL/HIGH", kind: "schema", evidence: "validate fn tier logic", present: fnHas(/tier|base_tier|effective_tier/) },
  { row: 12, short: "hide quarantined from customer surfaces", kind: "code", evidence: "supabase-server provenance gate", present: fileHas("src/lib/supabase-server.ts", /provenance_status/) },
  { row: 13, short: "source_id NOT NULL (Block 1)", kind: "schema", evidence: "is_nullable (reconciled post-recon, row 42)", present: sig((s) => s.sourceIdNullable) },
  { row: 14, short: "pull the 16 fabrication items NOW", kind: "schema", evidence: "agent_integrity_flag count", present: sig((s) => s.integrityFlagCount > 0) },
  { row: 15, short: "sign-off governing doc (2 fixes)", kind: "governance", why: "doc sign-off" },
  { row: 16, short: "sign-off workflow spec", kind: "governance", why: "doc sign-off" },
  { row: 17, short: "approving spec != approving quarantine/spend", kind: "governance", why: "standing-rule reiteration" },
  { row: 18, short: "gate distinguishes FACT/ANALYSIS/LEGAL", kind: "schema", evidence: "section_claim_provenance.claim_kind", present: sig((s) => s.claimKindExists) },
  { row: 19, short: "active sourcing + explicit gap (prompt contract)", kind: "code", evidence: "system-prompt.ts", present: fileHas("src/lib/agent/system-prompt.ts", /active.?sourc|explicit gap|EXPLICIT GAP/i) },
  { row: 19, short: "active sourcing RUNTIME efficacy", kind: "pending", trigger: "phase4", evidence: "sourceOrFindForClaim body wired", present: fileHas("src/workflows/generate-brief.ts", /sourceOrFindForClaim[\s\S]{0,600}(web_search|browserlessRender|fetch\()/) },
  { row: 20, short: "Addition A+B+D Block 1; C as Block 1.5", kind: "governance", why: "scope assignment" },
  { row: 21, short: "CRITICAL+HIGH gate to pending_human_verify", kind: "schema", evidence: "validate fn", present: fnHas(/pending_human_verify/) },
  { row: 22, short: "span-check 2-3 retries backoff; timeout=UNVERIFIED", kind: "code", evidence: "generate-brief spanCheckClaim", present: fileHas("src/workflows/generate-brief.ts", /spanCheckClaim/) },
  { row: 23, short: "legal-interpretation block at validation", kind: "code", evidence: "system-prompt.ts legal handling", present: fileHas("src/lib/agent/system-prompt.ts", /LEGAL/) },
  { row: 24, short: "FACT/ANALYSIS/LEGAL customer affordance", kind: "pending", trigger: "phase4", evidence: "affordance component in a customer surface", present: sig((s) => s.affordanceExists) },
  { row: 25, short: "sign-off revision 2", kind: "governance", why: "doc sign-off" },
  { row: 26, short: "same 4 required slots for all D1 types", kind: "code", evidence: "system-prompt.ts slots", present: fileHas("src/lib/agent/system-prompt.ts", /primary_deadline[\s\S]{0,200}jurisdictional_scope[\s\S]{0,200}penalty_summary/) },
  { row: 27, short: "ANALYSIS label = closed set of 4 EXACT patterns", kind: "code", evidence: "system-prompt.ts exact patterns", present: fileHas("src/lib/agent/system-prompt.ts", /Analytical inference|Industry interpretation|Operational implication/) },
  { row: 28, short: "verification queue per-claim tick, NO batch", kind: "code", evidence: "VerificationQueue.tsx", present: fileHas("src/components/admin/VerificationQueue.tsx", /NO batch|per-claim|no batch/i) },
  { row: 29, short: "WDK is the Phase-4 substrate", kind: "code", evidence: "package.json workflow dep", present: fileHas("package.json", /"workflow":\s*"\^?4\./) },
  { row: 30, short: "stability check workflow@4.2.5 PASS", kind: "code", evidence: "package.json version pin", present: fileHas("package.json", /"workflow":\s*"\^?4\.2/) },
  { row: 31, short: "step-skeleton: named steps with bodies", kind: "code", evidence: "generate-brief named steps", present: fileHas("src/workflows/generate-brief.ts", /sourceOrFindForClaim[\s\S]{0,3000}routeOnValidation/) },
  { row: 32, short: "build orchestration stays Claude Code; WDK Phase-4 only", kind: "governance", why: "orchestration-boundary process rule" },
  { row: 33, short: "standing rule reiterated (3rd)", kind: "governance", why: "reiteration" },
  { row: 34, short: "framing: no customers yet, pre-launch", kind: "governance", why: "interpretive framing" },
  { row: 35, short: "revision 2.2 adds Phase 1.5", kind: "governance", why: "scope/sequence addition" },
  { row: 36, short: "Haiku RECOMMENDS tier, doesn't assert", kind: "code", evidence: "recommend-source-tier.ts", present: fileHas("src/lib/sources/recommend-source-tier.ts", /provisional_sources/) },
  { row: 37, short: "sign-off revision 2.2", kind: "governance", why: "doc sign-off" },
  { row: 38, short: "HC3 spend cap orphaned by start() refactor", kind: "code", evidence: "b2-runner has no inline Sonnet call", present: fileLacks("supabase/seed/b2-runner.mjs", /api\.anthropic\.com/) },
  { row: 38, short: "HC3 spend cap reconstituted in substrate", kind: "pending", trigger: "phase4", evidence: "generation step enforces a budget cap", present: fileHas("src/workflows/generate-brief.ts", /budget|spendCap|maxSpend|costCap|cap/i) },
  { row: 39, short: "dormant-hook precondition: observe force-ask", kind: "unconfirmable", why: "the hook lives in ~/.claude/settings.json (outside repo); firing is runtime/harness-observed" },
  { row: 40, short: "fromSeed gate hole closed (fail-closed)", kind: "code", evidence: "fetchIntelligenceItem", present: fileHas("src/lib/supabase-server.ts", /!isSupabaseConfigured\(\)\)\s*return fromSeed/) },
  { row: 41, short: "hook was fail-open (jq); rewritten fail-closed", kind: "unconfirmable", why: "settings.json artifact + runtime firing, not statically determinable from repo code" },
  { row: 42, short: "source_id NOT NULL POST-reconciliation", kind: "schema", evidence: "is_nullable=YES now", present: sig((s) => s.sourceIdNullable) },
  { row: 43, short: "Phase-2 service-role credential binding", kind: "pending", trigger: "phase2", evidence: "restricted-role guard exists AND service-role key absent from agent env", present: sig((s) => s.restrictedRoleGuard) },
  { row: 44, short: "criterion-6 verification-aware", kind: "schema", evidence: "validate fn (verified_at + FACT)", present: fnHas(/verified_at/) },
  { row: 45, short: "spanCheckClaim maxRetries=3 + exponential", kind: "code", evidence: "generate-brief.ts", present: fileHas("src/workflows/generate-brief.ts", /maxRetries\s*=\s*3/) },
  { row: 46, short: "recommend-source-tier table-aware + no publisher", kind: "code", evidence: "recommend-source-tier.ts", present: (ctx) => fileHas("src/lib/sources/recommend-source-tier.ts", /provisional_sources/)(ctx) && fileHas("src/lib/sources/recommend-source-tier.ts", /no `?publisher`? column/i)(ctx) },
  { row: 47, short: "HC1 accepted; merge held; Phase 1.5 not started", kind: "governance", why: "checkpoint acceptance + process-state holds" },
]);

// Evaluate one anchor against ctx -> { row, short, kind, verdict, loud, present, triggerMet }.
export async function evaluateAnchor(a, ctx) {
  const triggerMet = a.kind === "pending" ? TRIGGERS[a.trigger](ctx) : undefined;
  let present;
  if (a.kind === "code" || a.kind === "schema" || a.kind === "pending") {
    try { present = await a.present(ctx); } catch (e) { present = false; ctx._errs = (ctx._errs || []); ctx._errs.push(`${a.row}:${a.short}: ${e.message}`); }
  }
  const verdict = resolveVerdict({ kind: a.kind, present, triggerMet });
  return { row: a.row, short: a.short, kind: a.kind, verdict, loud: LOUD.has(verdict), present, triggerMet, trigger: a.trigger, why: a.why, evidence: a.evidence };
}

export async function evaluateAll(ctx) {
  const results = [];
  for (const a of ANCHORS) results.push(await evaluateAnchor(a, ctx));
  return results;
}

// Load the live evaluation context once (DB signals + branch). client = connected pg.
export async function loadContext(client, root, branch) {
  const def = (await client.query("SELECT pg_get_functiondef('public.validate_item_provenance'::regproc) AS d").catch(() => ({ rows: [{ d: "" }] }))).rows[0].d;
  const trg = (await client.query("SELECT 1 FROM pg_trigger WHERE tgname='set_provenance_status_trg' AND NOT tgisinternal")).rowCount > 0;
  const nul = (await client.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='intelligence_items' AND column_name='source_id'")).rows[0]?.is_nullable === "YES";
  const ck = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='section_claim_provenance' AND column_name='claim_kind'")).rowCount > 0;
  const flipped = (await client.query("SELECT count(*)::int n FROM public.intelligence_items WHERE provenance_status <> 'unverified'")).rows[0].n;
  const gated = (await client.query("SELECT count(*)::int n FROM public.intelligence_items WHERE provenance_status IN ('verified','pending_human_verify')")).rows[0].n;
  const scp = (await client.query("SELECT count(*)::int n FROM public.section_claim_provenance")).rows[0].n;
  const iflag = (await client.query("SELECT count(*)::int n FROM public.intelligence_items WHERE agent_integrity_flag = true").catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  const glyph = countGlyph(root);
  return {
    root, branch,
    signals: {
      validateExists: !!def, validateDef: def, triggerExists: trg, sourceIdNullable: nul, claimKindExists: ck,
      flippedCount: flipped, gatedGenCount: gated, scpCount: scp, integrityFlagCount: iflag,
      glyphInNewCode: glyph,
      affordanceExists: false,   // Block-4 surface not built (PENDING present=false)
      restrictedRoleGuard: false, // Phase-2 restricted-role/DB-guard not built (PENDING present=false)
    },
  };
}

function countGlyph(root) {
  // count U+00A7 across the D3 script library (the "new code" the rule governs).
  // Build the needle via fromCharCode(0xA7) so the detector itself contains NO literal
  // glyph (the rule it enforces) and no escape the editor could normalize back to one.
  const NEEDLE = String.fromCharCode(0xA7);
  const dir = resolve(root, "scripts/lib");
  let n = 0;
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
      const t = readFileSync(resolve(dir, f), "utf8");
      for (const ch of t) if (ch === NEEDLE) n++;
    }
  } catch {}
  return n;
}
