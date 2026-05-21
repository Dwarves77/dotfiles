import { redirect } from "next/navigation";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

// Phase C: 4-step full-page wizard (kept accessible for return visits at
// /onboarding so users can re-run sector/notification setup if they want).
//
// Steps:
//   1. Choose path  — Import from LinkedIn (Coming soon stub) | Start fresh
//   2. Identity     — name, role, employer, region, work email (locked)
//   3. Sector       — multi-select via SectorSelector (highlighted niches up top)
//   4. Notifications — NotificationPreferences component
// Final state: confirmation + "Browse the community" CTA → /community
//
// orgId requirement: the wizard's Step 3 writes to workspace_settings.sector_profile
// (the workspace-anchored destination the dashboard reads). Users without a workspace
// are bounced to /workspace/new to create one first, then back here.

export default async function OnboardingPage() {
  const bootstrap = await resolveServerBootstrap();

  if (!bootstrap.user) redirect("/login?redirect=/onboarding");
  if (!bootstrap.orgId) redirect("/workspace/new");

  // LinkedIn import is gated by deployment config: the OAuth client must be
  // provisioned (LINKEDIN_CLIENT_ID present). When unset, the wizard renders
  // the LinkedIn card in a disabled state with explanatory copy rather than
  // crashing on click. Keeping this server-side avoids leaking the client id
  // to the browser bundle.
  const linkedinEnabled = Boolean(process.env.LINKEDIN_CLIENT_ID);

  return (
    <OnboardingWizard
      userId={bootstrap.user.id}
      userEmail={bootstrap.user.email || ""}
      orgId={bootstrap.orgId}
      linkedinEnabled={linkedinEnabled}
    />
  );
}
