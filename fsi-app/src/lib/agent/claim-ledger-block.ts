import { LEDGER_NAME, LEDGER_OPEN, LEDGER_CLOSE } from "./section-markers.mjs";

// A closed block: opener, anything (including newlines and braces), closer. Non-greedy so two blocks in
// one text are removed separately and the prose between them is kept.
const CLOSED_BLOCK_RE = new RegExp(`${LEDGER_OPEN}[\\s\\S]*?${LEDGER_CLOSE}`, 'g');
// An opener with no closer after it: the ledger is the last thing before the frontmatter, so an
// unterminated one runs to the end of the text it sits in.
const OPEN_ONLY_RE = new RegExp(`${LEDGER_OPEN}[\\s\\S]*$`);
// A closer with no opener (the opener was cut away earlier).
const CLOSE_ONLY_RE = new RegExp(LEDGER_CLOSE, 'g');

/** True when the text carries any ledger sentinel. Pure. */
export function hasClaimLedgerBlock(text: string | null | undefined): boolean {
  return String(text ?? "").includes(LEDGER_NAME);
}

/**
 * Remove every Claim Provenance Ledger block from `text`, valid or not, and return the rest unchanged
 * apart from trailing whitespace left where a block sat at the end. Text without a sentinel is
 * returned byte-identical (the common case). Pure.
 */
export function stripClaimLedgerBlocks(text: string | null | undefined): string {
  const original = String(text ?? "");
  if (!hasClaimLedgerBlock(original)) return original;
  const cleaned = original.replace(CLOSED_BLOCK_RE, "").replace(OPEN_ONLY_RE, "").replace(CLOSE_ONLY_RE, "");
  return cleaned.replace(/\s+$/, "");
}
