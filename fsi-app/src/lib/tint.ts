export function tint(cssVar: string, percent: number): string {
  return `color-mix(in srgb, ${cssVar} ${percent}%, transparent)`;
}
