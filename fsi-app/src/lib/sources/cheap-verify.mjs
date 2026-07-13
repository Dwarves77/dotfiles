// @ts-check
// CHEAP-VERIFY (Phase 1, operator ruling 2026-07-13, snapshot-first rebuild — CHECKPOINT 1). The DEFAULT verify
// path: re-confirm an item's already-extracted claim spans against its STORED snapshot text, with ZERO model
// calls. It is pure string work — normalize the snapshot to text, then test each claim's verbatim source_span
// for presence. No fetch, no Anthropic call, ~$0. If a claim's span is present in the stored source, the claim
// is still grounded in that source; if a required FACT span is absent, cheap-verify cannot confirm the item and
// the caller escalates (freshness-changed → stale flag; genuinely unverifiable → the LOCKED paid path).
//
// CP1 CONTRACT: nothing in this module spends. Any future need for a model call here MUST be surfaced in the PR
// with a per-item cost estimate before merge — it does not belong in the cheap path.

/** Strip HTML tags + collapse whitespace so a text-extracted span matches against a stored HTML snapshot.
 *  Mirrors the grounding-time text extraction (tags→space, whitespace→single). Pure. @param {string} s */
export function normalizeForMatch(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is a verbatim span present in already-normalized snapshot text? Empty span never matches. Pure.
 * @param {string} span @param {string} normalizedText */
export function spanPresent(span, normalizedText) {
  const n = normalizeForMatch(span);
  if (n.length === 0) return false;
  return normalizedText.includes(n);
}

/**
 * Cheap-verify an item's claims against its stored snapshot body. Pure, no I/O, no spend.
 * @param {Array<{ claim_text?: string, claim_kind?: string, source_span?: string|null }>} claims
 * @param {string} snapshotHtml  the stored snapshot body (raw HTML or text)
 * @returns {{
 *   total: number, matched: number,
 *   factTotal: number, factMatched: number, allFactsMatched: boolean,
 *   hasFacts: boolean,
 *   unmatched: Array<{ claim_text: string, claim_kind: string, source_span: string }>,
 *   pass: boolean, reason: string,
 * }}
 */
export function cheapVerifyClaims(claims, snapshotHtml) {
  const text = normalizeForMatch(snapshotHtml);
  const list = Array.isArray(claims) ? claims : [];
  let matched = 0;
  let factTotal = 0;
  let factMatched = 0;
  const unmatched = [];
  for (const c of list) {
    const kind = String(c?.claim_kind ?? "").toLowerCase();
    const isFact = kind === "fact";
    const present = spanPresent(String(c?.source_span ?? ""), text);
    if (present) matched += 1;
    if (isFact) {
      factTotal += 1;
      if (present) factMatched += 1;
    }
    if (!present) {
      unmatched.push({ claim_text: String(c?.claim_text ?? ""), claim_kind: kind, source_span: String(c?.source_span ?? "") });
    }
  }
  const hasFacts = factTotal > 0;
  const allFactsMatched = hasFacts && factMatched === factTotal;
  // PASS only when there is at least one FACT claim and every FACT span is present in the stored source. An item
  // with no FACT claims at all was never grounded to a checkable span here — cheap-verify cannot confirm it.
  const pass = allFactsMatched;
  const reason = !hasFacts
    ? "no FACT claims to match against the snapshot (never span-grounded) — cheap-verify cannot confirm"
    : allFactsMatched
      ? `all ${factTotal} FACT span(s) present in the stored snapshot`
      : `${factTotal - factMatched} of ${factTotal} FACT span(s) NOT present in the stored snapshot`;
  return { total: list.length, matched, factTotal, factMatched, allFactsMatched, hasFacts, unmatched, pass, reason };
}
