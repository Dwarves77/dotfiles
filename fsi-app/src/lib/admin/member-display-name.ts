interface MemberProfileFields {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

interface MemberWithProfile {
  user_id?: string | null;
  user?: MemberProfileFields | null;
}

/** What a member with no usable profile field renders as. Never a UUID, never blank. */
export const NO_PROFILE_LABEL = "(no profile)";

/** full_name -> display_name -> email -> the absence. */
export function memberDisplayName(m: MemberWithProfile): string {
  const u = m.user;
  const full = u?.full_name?.trim();
  if (full) return full;
  const display = u?.display_name?.trim();
  if (display) return display;
  const email = u?.email?.trim();
  if (email) return email;
  return NO_PROFILE_LABEL;
}
