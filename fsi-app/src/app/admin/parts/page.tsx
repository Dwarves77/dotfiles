import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { PartsList } from "@/components/admin/PartsList";
import { loadPartEntries } from "@/lib/admin/parts-registry";

export default async function AdminPartsIndexPage() {
  await requirePlatformAdmin("/admin/parts");

  const parts = loadPartEntries();

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="Parts"
        meta={`${parts.length} part${parts.length === 1 ? "" : "s"} · fixture sign-off pages, no database read`}
      />
      <div style={{ padding: "28px 36px 80px" }}>
        <PartsList parts={parts} />
      </div>
    </>
  );
}
