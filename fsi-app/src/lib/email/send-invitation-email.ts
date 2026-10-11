interface InvitationEmailParams {
  to: string;
  inviteUrl: string;
  orgName?: string;
  proposedRole: string;
}

interface InvitationEmailResult {
  /** true only when a provider accepted the message. */
  delivered: boolean;
  /** false when no provider is configured — the caller must show the copy-link path. */
  configured: boolean;
  /** Human-readable, safe to show the inviter. */
  reason?: string;
}

/**
 * Send (or honestly decline to send) an invitation email.
 * Never throws — delivery state is data the inviter must see, not an exception.
 */
export async function sendInvitationEmail(
  _params: InvitationEmailParams
): Promise<InvitationEmailResult> {
  // No provider configured (see header). When one lands, implement here and
  // gate on its env var so unconfigured environments keep the honest state.
  return {
    delivered: false,
    configured: false,
    reason: "No email provider is configured on this deployment.",
  };
}
