import { requirePlatformAdmin } from "@/lib/auth/admin";
import { getServiceSupabase } from "@/lib/supabase-service";
import { Masthead } from "@/components/ui/Masthead";
import { InferenceReview, type InferenceReviewRow } from "@/components/admin/InferenceReview";
import { formatLocaleDate } from "@/lib/format";
import { nowFrom, renderNowIso } from "@/lib/render-now";
import { fetchAllByIdChunks } from "@/lib/db/paginate.mjs";
import { currentInferenceRows } from "@/lib/detail/inference-view.mjs";

export default async function AdminInferencesPage() {
  await requirePlatformAdmin("/admin/inferences");
  const sb = getServiceSupabase();

  const { data, error } = await sb
    .from("inference_records")
    .select("inference_id, subject_id, claim_text, status_token, confidence, cited_item_ids, origin_class, trigger_question_ref, computed_at, supersedes")
    .order("computed_at", { ascending: false });

  // Current rows by the ONE rule (inference-view.mjs currentInferenceRows, shared with the customer read): the
  // row nothing supersedes. The earlier `supersedes IS NULL` filter kept the ORIGINAL of every chain and hid
  // each recomputed row (a recompute inserts a new row that points at the old one, migration 338).
  const rows = error ? [] : currentInferenceRows((data as unknown as Array<InferenceReviewRow & { supersedes: string | null }>) || []);

  // Batched citation-title resolve (never per-row): every cited item id across every row, one
  // intelligence_items read, mirrors the retrieval-before-generation discipline this codebase applies
  // to every other batch lookup (never N+1 queries for N rows).
  const allItemIds = Array.from(new Set(rows.flatMap((r) => r.cited_item_ids ?? [])));
  const items = await fetchAllByIdChunks(allItemIds, async (slice) => {
    const { data } = await sb.from("intelligence_items").select("id, title").in("id", slice);
    return (data as Array<{ id: string; title: string | null }>) || [];
  });
  const itemTitles: Record<string, string> = Object.fromEntries(items.map((it) => [it.id, it.title ?? it.id]));

  const nowIso = renderNowIso();

  return (
    <>
      <Masthead
        title="Inferences"
        size="list"
        dateLabel={formatLocaleDate(nowFrom(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
        nowIso={nowIso}
        eyebrowSuffix="Platform admin - learning loop"
        dek={
          error
            ? "Could not read inference_records - see server log."
            : `${rows.length} current inference${rows.length === 1 ? "" : "s"} - read-only`
        }
      />
      <div style={{ padding: "28px 36px 80px" }}>
        {error ? (
          <div
            style={{
              border: "1px dashed var(--sev-critical, #c0392b)",
              background: "var(--color-background)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>
              Could not read inference_records.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>{error.message}</p>
          </div>
        ) : (
          <InferenceReview rows={rows} itemTitles={itemTitles} />
        )}
      </div>
    </>
  );
}
