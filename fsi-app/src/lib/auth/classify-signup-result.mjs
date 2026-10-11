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
