// anthropic-text.ts - the one home for "join every text block in an Anthropic Messages response
// into a single string", extracted (lane lint-a, 2026-10-02) because the same five-line pattern
// (filter to text blocks, map to .text, join) was inlined ad hoc in three sibling classification
// routes (canonical-sources/recommend-classification, canonical-sources/bulk-classify,
// sources/recommend-classification) and F45 (duplicate-code) flagged the growth. Two other
// pre-existing call sites (spot-check/recurring/route.ts, lib/llm/haiku-classify.ts,
// lib/llm/spend-client.ts) use their own inline casts rather than this helper; left as-is, this
// lane's write set is src/app, not src/lib/llm's existing callers.
//
// Takes a local structural type rather than importing the SDK's own content-block type: this
// module makes no API call, but discipline rule 016 (canonical Anthropic path) matches on the
// SDK package's import string regardless of type-only intent, so a structural type that every
// real content-block variant already satisfies avoids that import without weakening the
// signature (a Messages response's content array is still assignable here as-is).
interface TextLikeBlock {
  type: string;
  text?: string;
}

/** Concatenates every text block in an Anthropic Messages `content` array, in order, with no
 *  separator (non-text blocks, e.g. tool-use or thinking blocks from an interleaved response,
 *  are skipped). */
export function extractTextFromContent(content: TextLikeBlock[]): string {
  return content
    .filter((b): b is TextLikeBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}
