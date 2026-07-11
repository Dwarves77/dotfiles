// src/lib/email/send-invitation-email.ts
//
// THE single seam for invitation email delivery (Wave-α Track D d3, 2026-07-11).
//
// INFRA FINDING (verified this dispatch): NO email provider exists anywhere in
// this codebase — no resend/sendgrid/nodemailer/postmark/mailgun/SES dependency
// in package.json, no mail-related env var in .env.local.example, no send call
// in src/. Per the correction-plan deviation rule we do NOT invent a provider:
// this module returns an honest "not configured" result, the invitation-create
// route surfaces that state to the inviter (never silent), and the admin chrome
// renders the token link with a copy affordance as the delivery mechanism.
//
// TODO(operator decision — email provider): pick and configure a transactional
// email provider (e.g. Resend / SendGrid / Postmark / SES), add its API key to
// the environment (+ .env.local.example), and implement the send INSIDE this
// function only. The route contract is already wired: return
// { delivered: true } on success and { delivered: false, reason } on failure —
// every caller surfaces the result to the inviter. Nothing outside this file
// should know which provider is used.

export interface InvitationEmailParams {
  to: string;
  inviteUrl: string;
  orgName?: string;
  proposedRole: string;
}

export interface InvitationEmailResult {
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
