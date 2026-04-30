import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { SectorOnboarding } from "@/components/onboarding/SectorOnboarding";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/onboarding");

  return <SectorOnboarding userId={user.id} userEmail={user.email || ""} />;
}
