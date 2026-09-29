// verbatim-grounding.mjs, the shared ADR-016 / rule 18 verbatim-span grounding check ("a span that is
// not verbatim in a capture" is refused, never invented). Extracted (lane ETS-PROXY, 2026-09-28, F45
// duplicate-code gate) from state-cost-facts-envelope.mjs and carrier-ets-surcharge-envelope.mjs, which
// each carried an identical isVerbatimSpan/groundCandidate pair, never a second, drifting copy of the
// same grounding rule. Both modules import and re-export from here, unchanged for their own callers.
//
// PLAIN ESM, ZERO DEPENDENCIES, no I/O, no clock read, same posture as every other pure module in
// src/lib/contracts/.

function normaliseWhitespace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** Is `span` verbatim (whitespace-insensitive, case-sensitive) inside `captureText`? Pure. */
export function isVerbatimSpan(captureText, span) {
  const normSpan = normaliseWhitespace(span);
  if (!normSpan) return false;
  return normaliseWhitespace(captureText).includes(normSpan);
}

/**
 * Ground one candidate against its capture text. Refuses (never silently drops) a candidate with no span
 * or a paraphrased span, the figure may be real, but an ungrounded claim is refused per ADR-016 / rule 18.
 * @param {{span_text?: string|null}} candidate
 * @param {string|null|undefined} captureText
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function groundCandidate(candidate, captureText) {
  const span = candidate?.span_text;
  if (!span || !String(span).trim()) {
    return { ok: false, reason: "no span_text supplied, a figure with no supporting span is ungrounded, refused per ADR-016 / rule 18" };
  }
  if (!captureText || !String(captureText).trim()) {
    return { ok: false, reason: "no capture text available for this candidate's source_url, cannot verify verbatim span" };
  }
  if (!isVerbatimSpan(captureText, span)) {
    return { ok: false, reason: "span_text is not a verbatim (whitespace-insensitive) substring of the captured source text" };
  }
  return { ok: true };
}
