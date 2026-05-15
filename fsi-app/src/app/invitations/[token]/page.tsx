import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { InvitationLandingPage } from "@/components/onboarding/InvitationLandingPage";

// /invitations/[token] — the public-facing invitation accept/decline page.
// Anyone with the URL lands here. If unauthenticated they're sent through
// /login, which routes them back here on success. If they ARE the invitee
// (email match), they see Accept/Decline. If they're a different signed-in
// user, they see "this invitation is for someone else" with a sign-out link.
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/invitations/${token}`);
  }

  return <InvitationLandingPage token={token} userEmail={user.email || ""} />;
}
