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
