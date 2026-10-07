import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { ItemCorrectionsPanel } from "@/components/admin/corrections/ItemCorrectionsPanel";
import { loadItemTargets } from "@/components/admin/corrections/load-item-targets.mjs";
import { loadItemScreen } from "@/components/admin/corrections/model.mjs";
import type { ItemTargets } from "@/components/admin/corrections/types";

// /admin/items/[id] , the admin Corrections screen for one item (lane G7-UI, 2026-10-06, plan Stage 7).
// Platform admin only: loadItemScreen runs requirePlatformAdmin FIRST (no session redirects to /login, a signed in
// non admin redirects to /), and a refusal means the item is never read. Not a customer surface: customers keep
// the four detail pages; this is where an admin overrides a machine value on one item.
export const dynamic = "force-dynamic";

export default async function AdminItemCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const targets = (await loadItemScreen({
    requireAdmin: () => requirePlatformAdmin(`/admin/items/${id}`),
    load: async () => loadItemTargets(await createSupabaseServerClient(), id),
  })) as ItemTargets | null;
  if (!targets) notFound();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
        Back to the admin dashboard
      </Link>
      <ItemCorrectionsPanel targets={targets} />
    </main>
  );
}
