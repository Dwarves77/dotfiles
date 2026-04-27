import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { CommunityHub } from "@/components/community/CommunityHub";

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  // Fetch forum sections
  const { data: sections } = await supabase
    .from("forum_sections")
    .select("*")
    .order("sort_order");

  // Fetch recent threads
  const { data: threads } = await supabase
    .from("forum_threads")
    .select("*, profiles!author_id(display_name, verification_tier, affiliation_type)")
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch case studies
  const { data: caseStudies } = await supabase
    .from("case_studies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <CommunityHub
      sections={sections || []}
      recentThreads={threads || []}
      caseStudies={caseStudies || []}
      userId={user?.id || ""}
    />
  );
}
