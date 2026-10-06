// Classifies the result of supabase.auth.signUp for the /signup page (lane AUTH-1, 2026-10-06).
//
// Why this exists: signing up with an address that is already registered does not return an error.
// Supabase answers with a success-shaped response whose `user` carries an EMPTY `identities` array
// (auth log action `user_repeated_signup`) and sends no email. The page used to treat any response
// without an error as "confirmation sent", which is false for that case.
//
// Only what the server returned is read here: `error`, `data.user`, `data.user.identities`.
//
// Run: node --test fsi-app/src/lib/auth/classify-signup-result.test.mjs

/**
 * @param {{ data?: { user?: { identities?: unknown } | null } | null, error?: unknown } | null | undefined} result
 * @returns {"error" | "already_registered" | "confirmation_sent"}
 */
export function classifySignUpResult(result) {
  if (result && result.error) return "error";
  const user = result && result.data ? result.data.user : null;
  if (user && Array.isArray(user.identities) && user.identities.length === 0) {
    return "already_registered";
  }
  return "confirmation_sent";
}
