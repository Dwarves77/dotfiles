import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kwrsbpiseruzbfwjpvsp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE"
);

const URL_PATTERNS = [
  ["eur-lex.europa.eu", "EUR-Lex"],
  ["transport.ec.europa.eu", "EUR-Lex"],
  ["environment.ec.europa.eu", "EUR-Lex"],
  ["climate.ec.europa.eu", "EC DG CLIMA Shipping"],
  ["taxation-customs.ec.europa.eu", "EC CBAM Portal"],
  ["mrv.emsa.europa.eu", "THETIS-MRV"],
  ["ec.europa.eu", "European Commission Press Corner"],
  ["consilium.europa.eu", "Council of the European Union Press"],
  ["europa.eu", "EUR-Lex"],
  ["imo.org", "International Maritime Organization"],
  ["icao.int", "International Civil Aviation Organization"],
  ["epa.gov", "US EPA Emissions Regulations"],
  ["arb.ca.gov", "US EPA Emissions Regulations"],
  ["federalregister.gov", "Federal Register"],
  ["legislation.gov.uk", "UK Legislation"],
  ["gov.uk", "UK Legislation"],
  ["iea.org", "IEA Policies and Measures Database"],
  ["theicct.org", "ICCT Freight"],
  ["itf-oecd.org", "International Transport Forum"],
  ["iso.org", "ISO 14083"],
  ["smartfreightcentre.org", "Smart Freight Centre / GLEC Framework"],
  ["ghgprotocol.org", "GHG Protocol"],
  ["sciencebasedtargets.org", "Science Based Targets initiative"],
  ["cdp.net", "CDP Supply Chain"],
  ["ifrs.org", "IFRS / ISSB Sustainability Standards"],
  ["fiata.org", "FIATA Sustainability"],
  ["unfccc.int", "UNFCCC NDC Registry"],
  ["carbonpricingdashboard.worldbank.org", "World Bank Carbon Pricing Dashboard"],
  ["eea.europa.eu", "European Environment Agency"],
  ["icapcarbonaction.com", "ICAP Allowance Price Explorer"],
  ["irena.org", "IRENA Publications"],
  ["ctl.mit.edu", "MIT Center for Transportation and Logistics"],
];

const TYPE_MAP = {
  regulation: "regulation", law: "regulation", legal: "regulation", rule: "regulation",
  standard: "standard", certification: "standard", framework: "framework",
  tool: "tool", data: "tool", initiative: "initiative", industry: "initiative",
  news: "market_signal", academic: "research_finding", innovation: "innovation",
};

function findSource(url, sourceMap) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const [pattern, name] of URL_PATTERNS) {
    if (lower.includes(pattern) && sourceMap.has(name)) return sourceMap.get(name);
  }
  return null;
}

function fixDate(d) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return d + "-01";
  if (/^\d{4}$/.test(d)) return d + "-01-01";
  return new Date().toISOString().slice(0, 10);
}

async function migrate() {
  // Load sources
  const { data: sources } = await supabase.from("sources").select("id, name");
  const sourceMap = new Map(sources.map((s) => [s.name, s.id]));
  console.log("Sources loaded:", sourceMap.size);

  // Load resources
  const { data: resources } = await supabase.from("resources").select("*");
  console.log("Resources to migrate:", resources.length);

  // Step 1: Insert intelligence items
  let linked = 0, unlinked = 0;
  const items = resources.map((r) => {
    const sourceId = findSource(r.url, sourceMap);
    if (sourceId) linked++; else unlinked++;
    return {
      legacy_id: r.id,
      title: r.title,
      summary: r.note || "",
      what_is_it: r.what_is_it || "",
      why_matters: r.why_matters || "",
      key_data: r.key_data || [],
      tags: r.tags || [],
      domain: 1,
      category: r.topic || null,
      item_type: TYPE_MAP[r.type] || "regulation",
      source_id: sourceId,
      source_url: r.url || "",
      jurisdictions: r.jurisdiction ? [r.jurisdiction] : ["global"],
      transport_modes: r.modes || [],
      priority: r.priority,
      reasoning: r.reasoning || "",
      added_date: r.added_date,
      is_archived: r.is_archived || false,
      archive_reason: r.archive_reason || null,
      archive_note: r.archive_note || null,
      archived_date: r.archived_date || null,
    };
  });

  const { error: insertErr } = await supabase.from("intelligence_items").insert(items);
  if (insertErr) { console.log("STEP 1 FAILED:", insertErr.message); return; }
  console.log("Step 1: " + items.length + " items (" + linked + " linked, " + unlinked + " unlinked)");

  // Build legacy_id -> new UUID map
  const { data: newItems } = await supabase.from("intelligence_items").select("id, legacy_id");
  const idMap = new Map(newItems.map((i) => [i.legacy_id, i.id]));

  // Step 2: Timelines
  const { data: timelines } = await supabase.from("timelines").select("*");
  if (timelines?.length) {
    const tl = timelines.filter((t) => idMap.has(t.resource_id)).map((t) => ({
      item_id: idMap.get(t.resource_id),
      milestone_date: fixDate(t.date),
      label: t.label,
      is_completed: t.status === "past",
      sort_order: t.sort_order || 0,
    }));
    const { error } = await supabase.from("item_timelines").insert(tl);
    console.log("Step 2: " + tl.length + " timelines" + (error ? " ERROR: " + error.message : ""));
  } else console.log("Step 2: 0 timelines");

  // Step 3: Changelog
  const { data: changelog } = await supabase.from("changelog").select("*");
  if (changelog?.length) {
    const cl = changelog.filter((c) => idMap.has(c.resource_id)).map((c) => ({
      item_id: idMap.get(c.resource_id),
      change_date: c.date,
      change_type: c.type,
      field: c.fields?.[0] || "unknown",
      previous_value: c.prev_value || "",
      new_value: c.now_value || "",
      impact: c.impact || null,
    }));
    const { error } = await supabase.from("item_changelog").insert(cl);
    console.log("Step 3: " + cl.length + " changelog" + (error ? " ERROR: " + error.message : ""));
  } else console.log("Step 3: 0 changelog");

  // Step 4: Disputes
  const { data: disputes } = await supabase.from("disputes").select("*");
  if (disputes?.length) {
    const dp = disputes.filter((d) => idMap.has(d.resource_id)).map((d) => ({
      item_id: idMap.get(d.resource_id),
      is_active: d.active,
      note: d.note,
      disputing_sources: d.sources || [],
    }));
    const { error } = await supabase.from("item_disputes").insert(dp);
    console.log("Step 4: " + dp.length + " disputes" + (error ? " ERROR: " + error.message : ""));
  } else console.log("Step 4: 0 disputes");

  // Step 5: Cross-references
  const { data: xrefs } = await supabase.from("cross_references").select("*");
  if (xrefs?.length) {
    const valid = ["related", "supersedes", "implements", "conflicts", "amends", "depends_on"];
    const xr = xrefs
      .filter((x) => idMap.has(x.source_id) && idMap.has(x.target_id))
      .map((x) => ({
        source_item_id: idMap.get(x.source_id),
        target_item_id: idMap.get(x.target_id),
        relationship: valid.includes(x.relationship) ? x.relationship : "related",
      }));
    const { error } = await supabase.from("item_cross_references").upsert(xr, { onConflict: "source_item_id,target_item_id" });
    console.log("Step 5: " + xr.length + " xrefs" + (error ? " ERROR: " + error.message : ""));
  } else console.log("Step 5: 0 xrefs");

  // Step 6: Supersessions
  const { data: supers } = await supabase.from("supersessions").select("*");
  if (supers?.length) {
    const sp = supers
      .filter((s) => idMap.has(s.old_id) && idMap.has(s.new_id))
      .map((s) => ({
        old_item_id: idMap.get(s.old_id),
        new_item_id: idMap.get(s.new_id),
        supersession_date: fixDate(s.date),
        severity: s.severity,
        note: s.note || "",
      }));
    const { error } = await supabase.from("item_supersessions").insert(sp);
    console.log("Step 6: " + sp.length + " supersessions" + (error ? " ERROR: " + error.message : ""));
  } else console.log("Step 6: 0 supersessions");

  // Step 7: Trust events
  const { data: linkedItems } = await supabase
    .from("intelligence_items")
    .select("source_id")
    .not("source_id", "is", null);
  const uniqueSources = [...new Set(linkedItems.map((i) => i.source_id))];
  if (uniqueSources.length) {
    const events = uniqueSources.map((sid) => ({
      source_id: sid,
      event_type: "discovery",
      details: {
        type: "discovery",
        discovered_via: "manual_add",
        items_migrated: linkedItems.filter((i) => i.source_id === sid).length,
      },
      created_by: "system",
    }));
    const { error } = await supabase.from("source_trust_events").insert(events);
    console.log("Step 7: " + events.length + " trust events" + (error ? " ERROR: " + error.message : ""));
  }

  console.log("\n=== MIGRATION COMPLETE ===");
}

migrate().catch((e) => console.log("Fatal:", e.message));
