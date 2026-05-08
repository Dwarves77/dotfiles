/**
 * tier1-uk-nations-execute.mjs — authorized writes for Tier 1 Wave B
 * (UK 4 nations: England env body + Westminster at GB-wide; Scotland +
 * Wales + Northern Ireland sub-national environmental body + parliament).
 *
 * Cloned from pr-a1-execute.mjs / tier1-us-northeast-execute.mjs.
 *
 * Authorized scope per dispatch on 2026-05-07:
 *   - GB-wide: DEFRA, Westminster (UK Parliament). DEFRA's environmental
 *     remit is UK-wide (Wales/Scotland have parallel devolved bodies but
 *     DEFRA itself remains the lead UK department), so jurisdiction_iso=["GB"]
 *     is more accurate than ["GB-ENG"]. Westminster is the UK Parliament.
 *   - GB-SCT: SEPA + Scottish Parliament.
 *   - GB-WLS: Natural Resources Wales (NRW) + Senedd Cymru.
 *   - GB-NIR: NIEA / DAERA + NI Assembly.
 *
 * No retags. The two retag candidates surfaced in prior investigation
 * (united-kingdom-regional-operations-profile, g6 UK DfT Decarbonisation)
 * read as UK-wide and remain at jurisdiction_iso=["GB"].
 *
 * Preflight findings (read-only, 2026-05-07):
 *   - 0 hits for any of the 8 canonical URLs.
 *   - GB-ENG: 0 rows. GB-SCT: 0 rows. GB-WLS: 0 rows.
 *   - GB-NIR: 2 unrelated rows (DfI, Utility Regulator NI) — no collision
 *     with DAERA / NI Assembly canonical URLs.
 *   - GB: 23 existing rows; none match the 2 GB-wide URLs being inserted.
 *
 * Total inserts: 8.
 *
 * Halt-on:
 *   - URL collision (existence check returns hit on canonical URL)
 *   - Verification mismatch after insert
 *   - Insert count > 10
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "tier1-uk-nations-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// Insert spec: each row, with canonical URL existence check.
// DEFRA + Westminster scoped to ["GB"] (UK-wide). Sub-national bodies use
// devolved ISO codes.
const INSERTS = [
  {
    label: "defra",
    nation: "GB",
    iso: ["GB"],
    name: "UK Department for Environment, Food & Rural Affairs (DEFRA)",
    url: "https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs",
    description:
      "UK lead department for environmental policy, food, farming, fisheries, biosecurity, and rural affairs. UK-wide remit on environmental policy with devolved counterparts (NRW, SEPA, NIEA/DAERA) for implementation in Scotland, Wales, and Northern Ireland. Authoritative for UK-wide environmental regulation, biosecurity for high-value cargo (artwork, livestock-adjacent shipments, plant-derived materials), and CITES enforcement coordination.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "westminster",
    nation: "GB",
    iso: ["GB"],
    name: "UK Parliament (Westminster)",
    url: "https://www.parliament.uk/",
    description:
      "The UK Parliament at Westminster. Authoritative source for UK-wide primary legislation (Acts), Hansard debates, select committee reports, and bill tracking. Covers reserved matters including international trade, customs, aviation, maritime, and UK-wide tax / disclosure regimes affecting freight and supply-chain compliance.",
    intelligence_types: ["legislation"],
  },
  {
    label: "sepa",
    nation: "GB-SCT",
    iso: ["GB-SCT"],
    name: "Scottish Environment Protection Agency (SEPA)",
    url: "https://www.sepa.org.uk/",
    description:
      "Scotland's principal environmental regulator. Pollution prevention, emissions, waste, and environmental authorisations affecting freight, ports (Grangemouth, Aberdeen, Cromarty Firth), and warehousing operations within Scotland. Devolved counterpart to DEFRA / Environment Agency for environmental policy implementation in Scotland.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "scottish_parliament",
    nation: "GB-SCT",
    iso: ["GB-SCT"],
    name: "Scottish Parliament (Holyrood)",
    url: "https://www.parliament.scot/",
    description:
      "The devolved legislature of Scotland. Authoritative for Scottish primary and secondary legislation across devolved matters including environment, transport (within Scotland), planning, and climate-change targets. Relevant for freight operations on Scottish road networks, Scottish ports, and corporate disclosure rules implemented at the devolved level.",
    intelligence_types: ["legislation"],
  },
  {
    label: "nrw",
    nation: "GB-WLS",
    iso: ["GB-WLS"],
    name: "Natural Resources Wales (Cyfoeth Naturiol Cymru)",
    url: "https://naturalresources.wales/",
    description:
      "Wales's principal environmental regulator and natural-resource manager. Environmental permitting, pollution control, waste regulation, and biosecurity affecting freight, the Port of Milford Haven and other Welsh ports, and warehousing operations within Wales. Devolved counterpart to DEFRA / Environment Agency for environmental policy implementation in Wales.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "senedd",
    nation: "GB-WLS",
    iso: ["GB-WLS"],
    name: "Senedd Cymru / Welsh Parliament",
    url: "https://senedd.wales/",
    description:
      "The devolved legislature of Wales. Authoritative for Welsh primary and secondary legislation across devolved matters including environment, transport (within Wales), planning, and Wales-specific climate and waste regimes. Relevant for freight operations on Welsh road networks, Welsh ports, and devolved disclosure / sustainability requirements.",
    intelligence_types: ["legislation"],
  },
  {
    label: "daera",
    nation: "GB-NIR",
    iso: ["GB-NIR"],
    name: "Northern Ireland Environment Agency / DAERA (Department of Agriculture, Environment and Rural Affairs)",
    url: "https://www.daera-ni.gov.uk/topics/environment",
    description:
      "Northern Ireland's principal environmental regulator (NIEA, sitting within DAERA). Environmental authorisations, pollution control, waste, biosecurity, and SPS controls — particularly relevant given the NI/RoI border and the Windsor Framework. Affects freight, the Port of Belfast and other NI ports, and cross-border supply-chain operations.",
    intelligence_types: ["regulation", "guidance"],
  },
  {
    label: "ni_assembly",
    nation: "GB-NIR",
    iso: ["GB-NIR"],
    name: "Northern Ireland Assembly (Stormont)",
    url: "http://www.niassembly.gov.uk/",
    description:
      "The devolved legislature of Northern Ireland. Authoritative for NI primary and secondary legislation across devolved matters including environment, transport (within NI), planning, and NI-specific climate and disclosure regimes. Relevant for freight operations across NI, Belfast/Larne ports, and the special arrangements under the Windsor Framework affecting cross-border movement of goods.",
    intelligence_types: ["legislation"],
  },
];

// HARD CONSTRAINT: halt if scope blew up.
if (INSERTS.length > 10) {
  step(
    "scope_check",
    false,
    `INSERTS.length=${INSERTS.length} exceeds dispatch ceiling of 10`
  );
}
step(
  "scope_check",
  true,
  `${INSERTS.length} planned inserts within dispatch ceiling of 10`
);

const insertedIds = {};

for (const ins of INSERTS) {
  // Existence check on canonical URL — try a small set of trivial variants
  // (with/without trailing slash, http/https swap) to catch obvious dupes.
  const variants = new Set([
    ins.url,
    ins.url.replace(/\/$/, ""),
    ins.url.replace(/^http:\/\//, "https://"),
    ins.url.replace(/^http:\/\//, "https://").replace(/\/$/, ""),
    ins.url.replace(/^https:\/\//, "http://"),
    ins.url.replace(/^https:\/\//, "http://").replace(/\/$/, ""),
  ]);
  const { data: existing } = await supabase
    .from("sources")
    .select("id, tier, status, admin_only, name, url, jurisdiction_iso")
    .or([...variants].map((u) => `url.eq.${u}`).join(","));

  if (existing && existing.length > 0) {
    // Halt: URL collision — should not happen given preflight.
    step(
      `${ins.label}_url_collision`,
      false,
      `Found existing row at canonical URL — ${JSON.stringify(existing)}`
    );
  }

  const { data: inserted, error: e } = await supabase
    .from("sources")
    .insert({
      name: ins.name,
      url: ins.url,
      description: ins.description,
      tier: 1,
      tier_at_creation: 1,
      status: "active",
      admin_only: false,
      jurisdictions: [],
      jurisdiction_iso: ins.iso,
      intelligence_types: ins.intelligence_types,
      domains: [1],
      access_method: "scrape",
      update_frequency: "weekly",
      notes:
        "Tier 1 Wave B — UK 4 nations. Inserted per Tier 1 region authorization. DEFRA + Westminster scoped GB (UK-wide); SEPA/NRW/DAERA + devolved parliaments scoped to GB-SCT / GB-WLS / GB-NIR. Parallels US Northeast/Midwest/South/West waves at tier 1.",
    })
    .select("id, tier, name")
    .maybeSingle();
  if (e || !inserted) {
    step(`${ins.label}_insert`, false, e?.message ?? "no row returned");
  }
  insertedIds[ins.label] = inserted.id;
  step(
    `${ins.label}_insert`,
    true,
    `id=${inserted.id} tier=${inserted.tier} name=${inserted.name}`
  );

  // Per-step read-back verification.
  const { data: r } = await supabase
    .from("sources")
    .select("id, tier, jurisdiction_iso, status, admin_only, url, name")
    .eq("id", inserted.id)
    .maybeSingle();
  const ok =
    r &&
    r.tier === 1 &&
    r.status === "active" &&
    r.admin_only === false &&
    Array.isArray(r.jurisdiction_iso) &&
    JSON.stringify(r.jurisdiction_iso.slice().sort()) ===
      JSON.stringify(ins.iso.slice().sort()) &&
    r.url === ins.url;
  step(
    `${ins.label}_verify`,
    ok,
    `tier=${r?.tier} status=${r?.status} admin_only=${r?.admin_only} jurisdiction_iso=${JSON.stringify(r?.jurisdiction_iso)} url=${r?.url}`
  );
}

// ─── Final invariant: each nation has env_body + parliament at T1 ─────
// Snapshot per nation showing inserted rows.
const nationSnapshot = {};
for (const code of ["GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR"]) {
  const { data } = await supabase
    .from("sources")
    .select("id, name, tier, status, admin_only, url, jurisdiction_iso")
    .contains("jurisdiction_iso", [code]);
  nationSnapshot[code] = data ?? [];
}

// GB-wide rows we just inserted.
const { data: gbInserts } = await supabase
  .from("sources")
  .select("id, name, tier, status, admin_only, url, jurisdiction_iso")
  .in("id", [insertedIds.defra, insertedIds.westminster].filter(Boolean));
nationSnapshot["GB (DEFRA + Westminster only)"] = gbInserts ?? [];

console.log(
  "\nFinal UK nations snapshot:\n",
  JSON.stringify(nationSnapshot, null, 2)
);

writeFileSync(
  resolve("..", "docs", "tier1-uk-nations-execute-log.json"),
  JSON.stringify(
    {
      completed: true,
      total_inserts: Object.keys(insertedIds).length,
      inserted_ids: insertedIds,
      per_nation_counts: {
        "GB (UK-wide DEFRA + Westminster)": 2,
        "GB-SCT": 2,
        "GB-WLS": 2,
        "GB-NIR": 2,
      },
      retags_skipped: [
        "united-kingdom-regional-operations-profile (read as UK-wide; left at GB)",
        "g6 UK DfT Decarbonisation (read as UK-wide; left at GB)",
      ],
      log,
    },
    null,
    2
  ),
  "utf8"
);
console.log("\n[OK] Tier 1 UK 4 nations writes complete.");
console.log(`Total inserts: ${Object.keys(insertedIds).length}`);
console.log("Log: docs/tier1-uk-nations-execute-log.json");
