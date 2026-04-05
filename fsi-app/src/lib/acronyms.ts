import { ACRONYMS } from "@/components/ui/Tooltip";

const ACRONYM_PATTERN = new RegExp(
  `\\b(${Object.keys(ACRONYMS).join("|")})\\b`,
  "g"
);

/**
 * Split text into segments of plain text and acronym matches.
 * Returns array of { text, isAcronym } for rendering with tooltips.
 */
export function parseAcronyms(text: string): { text: string; isAcronym: boolean }[] {
  const segments: { text: string; isAcronym: boolean }[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(ACRONYM_PATTERN);
  for (const match of matches) {
    const index = match.index!;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), isAcronym: false });
    }
    segments.push({ text: match[0], isAcronym: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isAcronym: false });
  }

  return segments.length ? segments : [{ text, isAcronym: false }];
}
