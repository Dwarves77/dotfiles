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
