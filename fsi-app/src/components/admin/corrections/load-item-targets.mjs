// load-item-targets.mjs , what the item Corrections screen shows as each correctable target's CURRENT value
// (lane G7-UI, 2026-10-06). Server side, read only, the client injected (the page passes its cookie scoped
// platform admin client). Every read is paginated or chunked, so no list is silently cut at 1000 rows.
//
// Facts are the item's FACT claims (a correction targets a claim by id; the API refuses a non fact claim).
// Connections are the edges on either side, with the other item's title.
import { fetchAllRows, fetchAllByIdChunks } from "../../../lib/db/paginate.mjs";
import { TAG_COLUMNS } from "../../../lib/corrections/item-corrections.mjs";

/** @returns {Promise<object|null>} the ItemTargets shape (types.ts), or null when the item does not exist */
export async function loadItemTargets(sb, itemId) {
  const { data: item, error } = await sb
    .from("intelligence_items")
    .select("id, title, full_brief, topic_tags, operational_scenario_tags, compliance_object_tags")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(`item read failed: ${error.message}`);
  if (!item) return null;

  const sections = await fetchAllRows((from, to) =>
    sb.from("intelligence_item_sections").select("id, section_key, section_order, content_md").eq("item_id", itemId).order("id", { ascending: true }).range(from, to),
  );
  const claims = await fetchAllRows((from, to) =>
    sb.from("section_claim_provenance").select("id, claim_text, claim_kind, source_span, section_row_id").eq("intelligence_item_id", itemId).eq("claim_kind", "FACT").order("id", { ascending: true }).range(from, to),
  );
  const outgoing = await fetchAllRows((from, to) =>
    sb.from("item_cross_references").select("id, target_item_id, relationship").eq("source_item_id", itemId).order("id", { ascending: true }).range(from, to),
  );
  const incoming = await fetchAllRows((from, to) =>
    sb.from("item_cross_references").select("id, source_item_id, relationship").eq("target_item_id", itemId).order("id", { ascending: true }).range(from, to),
  );

  const edges = [
    ...outgoing.map((e) => ({ other: e.target_item_id, relationship: e.relationship })),
    ...incoming.map((e) => ({ other: e.source_item_id, relationship: e.relationship })),
  ];
  const titles = new Map();
  const others = await fetchAllByIdChunks(
    edges.map((e) => e.other),
    async (slice) => {
      const { data, error: tErr } = await sb.from("intelligence_items").select("id, title").in("id", slice);
      if (tErr) throw new Error(`connected item read failed: ${tErr.message}`);
      return data ?? [];
    },
  );
  for (const o of others) titles.set(o.id, o.title);

  const seen = new Set();
  const connections = [];
  for (const e of edges) {
    if (seen.has(e.other)) continue;
    seen.add(e.other);
    connections.push({ other_item_id: e.other, other_title: titles.get(e.other) ?? "An item that could not be read", relationship: e.relationship });
  }

  const tags = {};
  for (const col of TAG_COLUMNS) tags[col] = Array.isArray(item[col]) ? item[col] : [];

  return {
    item_id: item.id,
    title: item.title ?? "Untitled item",
    full_brief: typeof item.full_brief === "string" ? item.full_brief : "",
    tags,
    facts: claims.map((c) => ({ id: c.id, claim_text: c.claim_text, source_span: c.source_span ?? null })),
    sections: [...sections].sort((a, b) => (a.section_order ?? 0) - (b.section_order ?? 0)).map((s) => ({ section_key: s.section_key, content_md: s.content_md })),
    connections,
  };
}
