/**
 * Account tab-row cross-page restore (UI system handoff 2026-09-06, README
 * screen 14/15: the merged Account tab row — see UserProfilePage.tsx and
 * SettingsPage.tsx's own headers). Settings' first seven tab-row entries
 * link back to `/profile?tab=<key>`; this is the pure predicate that
 * decides which Profile sub-tab to land on, split into its own plain-.ts
 * module so it is unit-testable with `node --test` + jiti without mounting
 * JSX (this repo's established constraint — see
 * src/components/app-shell-banner.ts's own header for the precedent).
 *
 * An unknown or missing `tab` value — a stale bookmark, a typo'd link, a
 * future tab key this version doesn't know — falls back to "personal"
 * rather than rendering nothing: a wrong-but-valid default beats a blank
 * page.
 */

export const PROFILE_TAB_KEYS = [
  "personal",
  "organization",
  "members",
  "sectors",
  "jurisdictions",
  "verifier",
  "activity",
] as const;

export type ProfileTabKey = (typeof PROFILE_TAB_KEYS)[number];

export function resolveInitialProfileTab(rawTabParam: string | null | undefined): ProfileTabKey {
  return (PROFILE_TAB_KEYS as readonly string[]).includes(rawTabParam ?? "")
    ? (rawTabParam as ProfileTabKey)
    : "personal";
}
