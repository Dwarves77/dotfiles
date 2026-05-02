import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
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

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/onboarding");

  return <OnboardingWizard userId={user.id} userEmail={user.email || ""} />;
}
