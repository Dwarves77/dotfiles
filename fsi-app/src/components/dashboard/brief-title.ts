// Pure helpers for DashboardMasthead's title derivation (UI system handoff 2026-09-06, README
// screen 1). Split out of the "use client" component (which carries JSX) so these have a plain
// node --test companion, same posture as src/lib/dashboard/row-fields.ts.

/** "<first name>'S BRIEF" -> workspace name -> the literal "YOUR BRIEF". */
export function deriveBriefTitle(firstName: string | null, orgName: string): string {
  if (firstName) return `${firstName.toUpperCase()}'S BRIEF`;
  if (orgName) return orgName.toUpperCase();
  return "YOUR BRIEF";
}

/** First token of a bootstrap `display_name` (full_name ?? display_name ?? email —
 *  src/app/api/workspace/bootstrap/logic.ts), usable as a first name even when the fallback
 *  resolved to an email address. */
export function firstTokenOf(displayName: string | null | undefined): string | null {
  const name = displayName?.trim();
  if (!name) return null;
  const firstToken = name.split("@")[0].split(/\s+/)[0];
  return firstToken || null;
}
