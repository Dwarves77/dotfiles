// src/lib/agent/claim-ledger-block.ts
//
// Lane P3 (2026-10-05). The ONE definition of the Claim Provenance Ledger block's text shape and the
// ONE function that removes it from prose. Pure, dependency-free.
//
// THE DEFECT THIS CLOSES [CONFIRMED against the live rows, read-only, 2026-10-05]. The agent emits the
// ledger as a block between two sentinels, before the YAML frontmatter. parseAgentOutput stripped the
// block from the stored body ONLY when the block parsed as a valid ledger; when the JSON was malformed
// (item 9d18608f: a stray character at line 220, item 5e0af336: line 10) or a FACT record lacked its
// span (item 58bf0406), locateClaimLedger threw, the catch fell back to "no inline claims" and the block
// stayed in the body, which was then stored as full_brief and split into sections, so the literal ledger
// text became customer-visible prose (the last section of the brief). The claims fall back harmlessly
// (the grounding step re-extracts them); the TEXT must never fall back into the body.
//
// So the strip here is deliberately independent of validity: a ledger block is removed whether or not
// it parses, in any section, and so is an opener that never closed (output cut off mid-ledger) and a
// stray closing sentinel.

// A closed block: opener, anything (including newlines and braces), closer. Non-greedy so two blocks in
// one text are removed separately and the prose between them is kept.
const CLOSED_BLOCK_RE = /<<<CLAIM_PROVENANCE_LEDGER[\s\S]*?CLAIM_PROVENANCE_LEDGER>>>/g;
// An opener with no closer after it: the ledger is the last thing before the frontmatter, so an
// unterminated one runs to the end of the text it sits in.
const OPEN_ONLY_RE = /<<<CLAIM_PROVENANCE_LEDGER[\s\S]*$/;
// A closer with no opener (the opener was cut away earlier).
const CLOSE_ONLY_RE = /CLAIM_PROVENANCE_LEDGER>>>/g;

/** True when the text carries any ledger sentinel. Pure. */
export function hasClaimLedgerBlock(text: string | null | undefined): boolean {
  return String(text ?? "").includes("CLAIM_PROVENANCE_LEDGER");
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
