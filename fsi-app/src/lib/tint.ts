/**
 * tint, the one way to get a translucent tint of a CSS custom-property color from inline style
 * objects (lane R12-13, 2026-10-01, CF-BROKEN-2 / A6).
 *
 * THE BUG THIS REPLACES. 24 sites across src/components/sources/** and
 * src/components/resource/IntelligenceMetadataStrip.tsx built a tint by STRING-CONCATENATING a
 * two-digit suffix onto a `var(--token)` reference, e.g. `"var(--color-error)" + "15"` ->
 * `"var(--color-error)15"`. That string is not a color in any CSS grammar: `var(--x)` is a
 * complete, self-terminating value, and appending digits after the closing paren produces an
 * invalid declaration the browser drops, so the tinted background/border never painted. The
 * percentage was never applied; the suffix was never alpha.
 *
 * THE FIX. `color-mix(in srgb, var(--token) N%, transparent)` is a real CSS value: it mixes the
 * token's color at N% strength into transparent, i.e. "the token color at N% opacity" without
 * needing a second hex literal or a fixed `--token-tint` variable per percentage used. This file is
 * the one place that builds that string, so a future change to the mix function or color space is
 * one edit, not 24.
 */
export function tint(cssVar: string, percent: number): string {
  return `color-mix(in srgb, ${cssVar} ${percent}%, transparent)`;
}
