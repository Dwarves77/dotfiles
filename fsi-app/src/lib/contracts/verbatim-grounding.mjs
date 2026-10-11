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
