import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { ActionCard } from "@/components/ui/ActionCard";
import { ACTION_CARD_FIXTURES } from "@/lib/detail/action-card-fixtures";

/** Static watch-button stand-in: the live `WatchButton` calls the workspace watch API on mount,
 *  which this NO-DATABASE-READ fixture page must not do (same precedent as the FactCard gallery's
 *  own static fixtures). Visually matches `ActionButton` chrome (ActionRow.tsx). */
function StaticWatchButton() {
  return (
    <button
      type="button"
      disabled
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-115)",
        fontWeight: 700,
        padding: "8px 14px",
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: "var(--radius-control)",
        border: "1px solid rgba(0,0,0,.25)",
        background: "var(--card)",
        color: "var(--ink)",
        cursor: "default",
      }}
    >
      {"☆"} Watch
    </button>
  );
}

export default async function AdminPartsActionCardPage() {
  await requirePlatformAdmin("/admin/parts/action-card");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="ActionCard"
        meta={`${ACTION_CARD_FIXTURES.length} fixtures · no database read`}
      />
      <div style={{ padding: "28px 36px 80px", display: "flex", flexDirection: "column", gap: 32, maxWidth: 720 }}>
        {ACTION_CARD_FIXTURES.map((fx) => (
          <div key={fx.id}>
            <p style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>{fx.title}</p>
            <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: "0 0 12px" }}>{fx.note}</p>
            <ActionCard
              band={fx.band}
              kindLabel={fx.kindLabel}
              tier={fx.tier}
              meta={fx.meta}
              tags={fx.tags}
              onExport={() => {}}
              onShare={() => {}}
              watch={<StaticWatchButton />}
              where={fx.where}
              whoPays={fx.whoPays}
              yourLanes={fx.yourLanes}
              timeline={fx.timeline}
            />
          </div>
        ))}
      </div>
    </>
  );
}
