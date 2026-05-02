import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { UserProfilePage } from "@/components/profile/UserProfilePage";

// Phase C: refactored profile.
// Editable user_profiles fields, sector multi-select, jurisdiction chips,
// transport mode chips, verifier badge application form, and a stat strip.
//
// Tabs: Personal | Workspace org | Members | Billing | Sectors | Jurisdictions
//       | Verifier badge | Activity
// Functional in Phase C: Personal, Sectors, Jurisdictions, Verifier badge,
// Activity. Workspace org / Members / Billing show "Coming soon — multi-tenant
// in Phase D" panels.

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/profile");

  return <UserProfilePage userId={user.id} userEmail={user.email || ""} />;
}
