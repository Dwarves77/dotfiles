// SHARED-WRITER: intelligence_items, staged_updates, agent_run_searches, integrity_flags
// 2026-09-29-reverse-chained-apply.mjs, one-off reversal for lane REVERSE-CHAINED-APPLY.
//
// WHY THIS EXISTS. GitHub Actions run 36568656803 ("Ledger consume", chained apply pass) was cancelled
// at ~12:42:30 UTC mid-write. Between 12:37:38 and 12:42:30 UTC it minted 33 intelligence_items (all
// provenance_status='quarantined', pipeline_stage=null, never reached a customer surface, verified by
// the gate) plus their 33 staged_updates rows and 32 agent_run_searches pool rows (the 33rd item, the
// razorback-sucker row, is the exact cancellation point: its staged_updates row is status='pending' with
// materialized_item_id=null and it has no agent_run_searches row at all). The set_provenance_status
// trigger and the intake-relevance screen then wrote 51 integrity_flags rows (33 + 18) against those same
// 33 item ids. Operator ruling 2026-09-29: these items "shouldn't [exist]; get rid of them."
//
// INVESTIGATION (read-only, SELECT-only per the lane's HARD RULES, see
// docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md for the full evidence trail):
//   - Every count below was independently re-verified against the live DB this same session
//     ([CONFIRMED], not carried from the coordinator's brief), id-for-id, not just totals.
//   - The 4 agent_runs rows timestamped 12:32 UTC are UNRELATED: source_id-linked NYC/Brazil fetches with
//     intelligence_item_id=null and no URL overlap with the 33 items. They are NOT part of this run's
//     write set and this script never touches agent_runs.
//   - disposition_ledger has ZERO rows for these 33 items/URLs, and the matching portal_link_candidates
//     rows are all still status='candidate' / item_id=null / dispositioned_at=null, the chained-apply
//     run wrote directly via record-only intake and never promoted through the candidate ledger, so
//     there is no DB-side "ledger promotion marker" to reset before these can be re-run later.
//
// WRITE PATH. Reuses fsi-app/scripts/lib/db.mjs's existing guarded helpers verbatim, no new write
// primitive. None of the four touched tables is in db.mjs's DELETE_PROTECTED_TABLES (that set is
// sources / raw_fetches / claim_versions / disposition_ledger only), so the guarded delete path applies
// directly. Delete order is FK-safe, children before parents:
//   integrity_flags (subject_ref, no FK) -> agent_run_searches (FK intelligence_item_id)
//   -> staged_updates (FK materialized_item_id) -> intelligence_items
// guardedDelete snapshots every matched row to fsi-app/scripts/_snapshots/ (or $DISCIPLINE_SNAP_DIR)
// BEFORE deleting, so the write is reversible from the snapshot files even after this script runs.
//
// MODES (default dry; nothing writes without an explicit flag):
//   --dry      (default) prints the four id-list counts and duplicate-check result. No DB call.
//   --apply    runs the four guardedDelete calls in FK-safe order. DESTRUCTIVE.
//   --archive  alternative to --apply: does NOT delete anything. Soft-archives the 33 intelligence_items
//              via guardedUpdateByIds + db.mjs's table-generic archivePatch("intelligence_items",
//              "reverse-chained-apply-36568656803"), same helper census-off-vertical.mjs and
//              screen-reconcile-records.mjs already use for reversible archival. Idempotent (applyMatch
//              re-checks is_archived=false per chunk).
//   --verify   runs the five post-check SELECTs (read-only) and reports counts. Safe to run any time,
//              before or after --apply.
// --apply and --archive are mutually exclusive with each other (not with --verify, which may follow
// either). This lane's dispatch does NOT run --apply or --archive, build + test only.
//
// CITE (required by every db.mjs guarded write; rule 015).
export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "REVERSE-CHAINED-APPLY: undo GitHub Actions run 36568656803 (Ledger consume, chained apply pass, " +
    "cancelled ~2026-09-29 12:42:30 UTC mid-write). Operator ruling 2026-09-29: these 33 items " +
    "\"shouldn't [exist]; get rid of them.\" Write-set confirmed id-for-id against the live DB this " +
    "session (33 intelligence_items, 33 staged_updates, 32 agent_run_searches, 51 integrity_flags); the " +
    "4 agent_runs rows at 12:32 UTC are unrelated fetches and are excluded. See " +
    "docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md for the full evidence trail.",
});

export const ARCHIVE_REASON = "reverse-chained-apply-36568656803";

// The 33 intelligence_items minted by the cancelled run (created_at 2026-09-29 12:37:38..12:42:30 UTC).
export const ITEM_IDS = Object.freeze([
  "030e0dbe-2398-44c9-8e4f-3f230955f561", "b3a8a815-a592-4aee-be71-577aa64cbe50",
  "6eb0652b-eef4-44c3-b875-5bb84a5892dd", "2a0219af-4a11-49df-a455-2fd424b9d301",
  "0fcab27e-01cd-47b3-8627-80f80cc8592f", "bc2c7b4f-83f2-45e4-8b16-ed1e1f9156f4",
  "5d2680cb-46ac-4076-9aa9-d4b16992fb68", "bc53507d-7449-432e-85de-4063b140f2f9",
  "3c41904a-a9f7-4ae2-a5e2-dbea709eebe2", "ee90b0ca-9077-43a4-af28-b5c7e95d2ddc",
  "8d001b50-29c3-4ce5-b895-83e0bb1b18ae", "898e76cd-a858-4acb-a9cf-1150c87ea427",
  "eda7b06e-dc99-42e4-9df4-938ee99281a3", "d5443d89-524d-4a54-b9ea-69aada2a678c",
  "64003329-a7fc-49a6-b015-c1229f4f4d9e", "d78cc941-3a97-463d-ab06-4f220ef6751b",
  "9df3fb8c-c904-4c3c-b6bf-b1e4dc01c95f", "b1dd086f-9555-4156-98d8-d1f9dc2ff58b",
  "cc68714a-8d89-48f3-a311-fcc6dc0e3130", "8b978c97-1820-4b36-b4a2-606f911e2ead",
  "41aac757-220b-4bfc-bbae-57184499066e", "e099f068-7dce-4a51-b9af-35c69fca49c2",
  "205a8025-b8e3-4a84-966f-58d940373748", "c80e0a24-f26f-489c-8783-5bf7f06df881",
  "068df7bc-4c63-4d57-8495-a8cb65c188fe", "c21e186d-1152-4536-adac-ee7ac42f45c5",
  "f53b73f2-cfab-435e-9774-0f0ccc4e5502", "ec14b353-cfde-471e-9580-da6726122893",
  "fee2aeff-e0f5-454a-9e02-7eeeb70087aa", "06d8c260-14bd-4499-afed-70fd8805c42f",
  "2b63d653-c6c7-4fc8-84b1-c1edb04100a3", "bbecb3e7-ebca-4764-849d-17f8f9a26df6",
  "a0bc44b1-5851-44f0-8e64-269cd9dd4801",
]);

// The 33 staged_updates rows (32 approved+materialized to the ids above, 1 pending, the razorback-
// sucker row, the run's own cancellation point).
export const STAGED_UPDATE_IDS = Object.freeze([
  "a17cf25f-7f0d-4164-bb88-5fbc2c5daba1", "8b62c62d-8130-4910-b88c-1da9518e7b18",
  "f4e0b97e-4ea7-4f07-b569-d7ba2932823f", "a61f0368-b375-4618-8529-91b2963102a8",
  "43242d25-b1a8-4bae-88f5-68ba7e4b2a43", "3635ab13-9eef-4470-915c-11083b7d2e21",
  "e22b370a-bc46-425a-870a-cf951f868f54", "076006de-020d-4db4-85a8-d72fe62f0ab0",
  "b456dfd7-2c1e-4c48-943c-6b614b0a99fd", "3d204afa-677a-4b9f-9e57-904fd5a8bd9d",
  "7127242c-d4d2-4f8b-934a-549ac1f18bb6", "7beb2382-7afe-4157-8606-74f7833ee177",
  "5ea08ec9-c0e7-4de0-8164-c71dbfb6c7b5", "99ab07a6-2dc8-4a13-9695-120c5f4f20e9",
  "2c9c2011-1051-4333-b878-f5647e4a4a72", "4a19235f-59d9-4fc0-9cfa-b46e5b54f666",
  "6e21ce28-ea06-41ce-8ba9-a1b9a9d88da7", "680a9a83-66b1-404b-8d83-152791661ddd",
  "1404ae20-2666-483e-947c-5902a8bac548", "aec9f644-a8f1-4623-a75b-ff471395c024",
  "1c37b609-af6a-405e-87f9-a8cb3fa37ef6", "00927265-3651-417d-bfbc-827951d0329d",
  "d010983f-99b3-441b-b9ee-5f76b011a727", "57f549fe-845c-4602-8542-0aac5a754a3c",
  "86791b3d-2338-4332-ad7e-805abe2aaea6", "8f74f1e1-7235-4240-985e-22c882ae63ad",
  "53240372-7127-4cd0-b7ab-61457638c209", "2d9bda58-e6bc-42a7-850f-3179c043fc7e",
  "8870ff80-91e1-4bbc-908e-8a09404114f8", "a344ac5f-ba40-4529-aacf-11893dd40089",
  "6e6c7e30-3523-41fb-8feb-077b5fa748de", "32fe7a9a-dd44-492c-9cf9-8e0c4e9a79fc",
  "96f18003-3880-4102-8113-9be2feeb6ef8",
]);

// The 32 agent_run_searches pool rows (the 33rd item's row never wrote, cancellation point).
export const AGENT_RUN_SEARCH_IDS = Object.freeze([
  "2a4e036f-1a06-4988-a36b-22cebab2f157", "2b276c91-3b7a-4662-ac2c-b6a4b2b09874",
  "cae4fc96-d1f3-4100-9f6c-40771d2f5642", "148d7b0e-c11b-42d8-b987-0c4ee8e8e577",
  "7cf75a15-4dbb-493b-9872-442f6f34d2a6", "b5d894c0-f548-4324-b200-58eb1daab86e",
  "a60ee4b2-27f2-4071-956b-f5c1864c8e36", "8c189ae9-b8be-4124-80f2-54ec917b348f",
  "a10fa451-b941-4434-9118-3df3e70fe7f8", "a3f97514-5fcb-4f0f-a03c-dfe8dab34e49",
  "b6df1233-b841-42e9-b1fb-7d82d0ca3634", "cc5153a5-135e-49b9-88ce-6af51f2fb98f",
  "eb155087-2911-4f04-a2e1-aab8d45c0b00", "8fb25a1d-5926-49ea-b58a-622f02030d21",
  "927b3eb8-d3fa-48e7-acf4-18ab7651cf5e", "5c3fac73-dcce-41ed-8f9d-21c4671dc0ad",
  "764a91b0-3b2d-47ea-97b3-2ce58483e279", "52df6de3-d754-4850-a05e-fbf1498a580d",
  "2b4828c3-10be-4432-9826-3e1934a99899", "8b826218-fd98-459f-b94b-d40ed55fc489",
  "684ccdd1-f3e9-48b0-a312-287037c41052", "99c9e402-d9cd-4fa5-8044-6e36201a5f67",
  "3cc51c44-b337-4000-968a-9451695feff4", "235148f9-62aa-42c2-a346-027f2da44819",
  "896cc22b-9c7e-48d2-8831-a76acd2bcb93", "5252c3d7-46d7-422d-84c8-279e8f5bdcab",
  "82343466-a478-4cb8-ab5b-76a2cafb40c7", "9e20aa83-a5ef-4e79-88b0-a2142a414e0e",
  "dea678f3-69f2-4a37-bfbd-eb9e6afa7e17", "f622a51c-c057-4025-8270-4b56b0e27884",
  "9da4b09d-9835-468f-ae9a-4dd08fd11d7e", "b4824383-a09b-4b3e-931b-5653040dbe51",
]);

// The 51 integrity_flags rows (33 set_provenance_status_trigger + 18 intake-relevance), subject_ref
// matched exactly (string-equal) to ITEM_IDS above, zero orphans.
export const INTEGRITY_FLAG_IDS = Object.freeze([
  "edccfdfb-a727-4942-bda5-3d34ca04b6e6", "07f6d600-febf-40a7-9a8e-6161fef1bdfb",
  "0be7910d-3028-420b-be02-f23d743612ad", "ebc48569-ac09-44b8-8967-553dd10f0f57",
  "c7b2553c-26e2-4bf1-a7f5-df6f3633307b", "66760aa1-7524-4afe-8277-c2a6a24fe398",
  "c08da73e-637b-4342-a122-7c825000903f", "2a3740ac-4912-4c7a-8cbb-f65f2451c5a9",
  "98e415d6-3360-4853-85a5-48b76c138923", "6e6d98ad-3018-4980-85b8-7d8618293ac3",
  "298f659a-b699-4f1e-a155-f2be7177418e", "47cc2018-00fb-4bda-a779-334322f55f46",
  "2fe9386f-ce5a-47bc-a5f5-fd1220faedb4", "4df58378-bb07-40fc-be36-891f8ba3619f",
  "9382ab98-d3d5-4b97-9c22-fb51401f7dd7", "7c69a4c9-5f7d-4b4f-a1e0-5a49f9d61899",
  "42961a5b-64d4-4be3-b8f2-4cdc3fe03c0a", "8ff264b9-5a35-4e24-be84-69a1542b7f78",
  "57c82657-8d9d-40ea-9e7f-e84033cfa1fa", "3492a74d-fc88-4f79-8cdb-b134f37b93d9",
  "a2497fd8-a15c-4efd-816c-f783aa21ceed", "ce40960e-bc84-48c8-99ce-551b23f2a856",
  "434a8e88-7234-408d-a742-d88be058e671", "8e461679-c4a3-4e67-be20-0633cefc2675",
  "e7c31cac-45bd-49af-b5c5-96f8ca99d5f1", "44984dc7-864b-4e27-963b-a7984975a7b5",
  "afebdd40-3190-427c-833f-229b6e09e77b", "3184f1d9-d480-4df9-ad2e-b61c338e4e2d",
  "22197483-c71f-4c99-9b0a-3dbce7582345", "da19a0fb-f05d-4aea-9802-e9af663c6d2f",
  "102be039-812d-4c56-bcba-8fd3696008dc", "4929021c-dc07-4846-ad4a-6939ccae0bbf",
  "975033dc-9556-403f-ad75-e5814919af12", "29402dc8-0beb-4303-899a-976135e057e8",
  "a618ce40-e3e0-4d08-8a09-d75540196682", "469ba49c-fba9-4421-b05c-041d34b6236a",
  "1ce244da-0c95-4e78-8b8e-0aaf9ed336f8", "1c88150c-d411-4624-a05f-cef21e291780",
  "81a185d9-b00e-461e-a1a1-0beb584246fc", "f07ff69d-0910-444e-b0c9-f77911f0a9be",
  "3fa46588-0098-47c5-b5be-b1349c4fc336", "5c1d3c3c-176e-495c-9f04-49373c093e37",
  "e146f430-8220-4e2e-8d49-fd420aee6f7d", "ed1ebafe-0f1e-4cfc-87e1-73067fecafdc",
  "e83de81c-bbdc-42c2-b4c2-6eaf4b72556a", "1906ccb5-91fe-4945-97bd-61c1edb7f8b5",
  "fa7d55f6-4e2c-45ed-a505-51787b3421ee", "cf772874-d330-46ce-8f38-fd1fb4cb0716",
  "bac88465-7a7e-4756-a031-901e01ae6bb5", "f1459854-cdd9-4666-997e-a6e5d4ef0b16",
  "9f714fcd-dc03-4fee-8403-6d015b4717c4",
]);

// source_url for each of the 33 items, same order as ITEM_IDS, used only by --verify's fifth
// post-check (portal_link_candidates matches by url; item_id was null on every one of these rows at
// investigation time, per the read-only pass, so url is the only reliable key here).
export const SOURCE_URLS = Object.freeze([
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601779",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601410",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601734",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601737",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601778",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601781",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601793",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202690590",
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202690591",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14204/lake-ontario-national-marine-sanctuary-delay-of-effective-date",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14205/amendment-of-class-d-airspace-and-removal-of-class-e4-airspace-over-nashua-nh",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14207/safety-zones-recurring-events-in-captain-of-the-port-duluth-zone",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14224/safety-zone-cuyahoga-river-cleveland-oh",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14240/references-to-electronic-filing-systems-in-rules-of-practice-in-filings-pursuant-to-the-protocol",
  "https://www.federalregister.gov/documents/2026/07/15/2026-14248/establishment-of-class-e-airspace-crown-point-in",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14298/accepted-consensus-standards-for-light-sport-category-aircraft-airplane-glider-powered-lift-and",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14299/endangered-and-threatened-wildlife-and-plants-revised-designation-of-critical-habitat-for-the",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14303/fep-agency-designation-procedures-revising-location-of-fep-agency-lists",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14315/special-local-regulations-marine-events-within-the-southwest-district",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14316/special-local-regulations-marine-events-in-the-coast-guard-sector-detroit-captain-of-the-port-zone",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14318/air-plan-approval-and-air-quality-designation-ohio-attainment-plan-and-redesignation-of-the-canton",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14322/air-plan-approval-iowa-revisions-to-iowa-air-quality-regulations",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14333/financial-assistance-regulations-conflict-of-interest-and-conflict-of-commitment-policy-requirements",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14366/atlantic-highly-migratory-species-atlantic-bluefin-tuna-fisheries-harpoon-category-quota-transfer",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14368/privacy-act-of-1974-implementation",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14369/fisheries-of-the-northeastern-united-states-summer-flounder-fishery-quota-transfer-from-north",
  "https://www.federalregister.gov/documents/2026/07/16/2026-14391/amendment-of-class-d-airspace-and-class-e-airspace-over-new-bedford-ma",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14446/standard-instrument-approach-procedures-and-takeoff-minimums-and-obstacle-departure-procedures",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14447/standard-instrument-approach-procedures-and-takeoff-minimums-and-obstacle-departure-procedures",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14461/implementing-voluntary-agreements-under-the-defense-production-act",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14481/airworthiness-directives-bell-textron-canada-limited-helicopters",
  "https://www.federalregister.gov/documents/2026/07/17/2026-14492/endangered-and-threatened-wildlife-and-plants-reclassification-of-the-razorback-sucker-from",
]);

export const EXPECTED_COUNTS = Object.freeze({
  items: 33,
  staged_updates: 33,
  agent_run_searches: 32,
  integrity_flags: 51,
});

/** Pure. Checks each id list's length against EXPECTED_COUNTS and checks for in-list duplicates.
 *  No I/O, no DB, the same check --dry prints and the unit test asserts directly. */
export function checkIdListIntegrity() {
  const lists = {
    items: ITEM_IDS,
    staged_updates: STAGED_UPDATE_IDS,
    agent_run_searches: AGENT_RUN_SEARCH_IDS,
    integrity_flags: INTEGRITY_FLAG_IDS,
  };
  const counts = {};
  const duplicates = {};
  let ok = true;
  for (const [name, list] of Object.entries(lists)) {
    counts[name] = list.length;
    const seen = new Set(list);
    const dupes = list.length - seen.size;
    duplicates[name] = dupes;
    if (list.length !== EXPECTED_COUNTS[name] || dupes !== 0) ok = false;
  }
  return { ok, counts, expected: EXPECTED_COUNTS, duplicates };
}

/**
 * @param {{ mode?: "dry"|"apply"|"archive"|"verify" }} opts
 * @param {{
 *   guardedDelete?: Function,
 *   guardedUpdateByIds?: Function,
 *   archivePatch?: Function,
 *   readAllByIds?: Function,
 * }} deps only required for apply/archive/verify modes.
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const integrity = checkIdListIntegrity();
  const summary = { step: "reverse-chained-apply-2026-09-29", mode, integrity, applied: {}, read_back: {}, exitCode: 0 };

  if (!integrity.ok) {
    summary.note = "REFUSED, id-list integrity check failed (see .integrity). No DB call made.";
    summary.exitCode = 1;
    return summary;
  }

  if (mode === "dry") {
    summary.note = `dry: ${integrity.counts.items} items / ${integrity.counts.staged_updates} staged_updates / ` +
      `${integrity.counts.agent_run_searches} agent_run_searches / ${integrity.counts.integrity_flags} integrity_flags ` +
      "queued for reversal. No DB call made. Run --apply (delete) or --archive (soft-archive items only) to act.";
    return summary;
  }

  if (mode === "apply") {
    // FK-safe order: children before parents. integrity_flags has no FK (subject_ref is text) but goes
    // first anyway so a failure partway through never leaves a flag pointing at an already-deleted item.
    const flags = await deps.guardedDelete("integrity_flags", INTEGRITY_FLAG_IDS, { cite: CITE });
    const searches = await deps.guardedDelete("agent_run_searches", AGENT_RUN_SEARCH_IDS, { cite: CITE });
    const staged = await deps.guardedDelete("staged_updates", STAGED_UPDATE_IDS, { cite: CITE });
    const items = await deps.guardedDelete("intelligence_items", ITEM_IDS, { cite: CITE });
    summary.applied = {
      integrity_flags: flags.deleted,
      agent_run_searches: searches.deleted,
      staged_updates: staged.deleted,
      intelligence_items: items.deleted,
    };
    summary.snapshots = {
      integrity_flags: flags.snapshots,
      agent_run_searches: searches.snapshots,
      staged_updates: staged.snapshots,
      intelligence_items: items.snapshots,
    };
    summary.note = "apply: deleted per .applied (snapshots written first, reversible from .snapshots).";
    return summary;
  }

  if (mode === "archive") {
    const res = await deps.guardedUpdateByIds(
      "intelligence_items",
      ITEM_IDS,
      deps.archivePatch("intelligence_items", ARCHIVE_REASON),
      { cite: CITE, applyMatch: (q) => q.eq("is_archived", false) },
    );
    summary.applied = { intelligence_items_archived: res.updated };
    summary.snapshots = { intelligence_items: res.snapshots };
    summary.note = `archive: archived ${res.updated} of ${ITEM_IDS.length} items with archive_reason='${ARCHIVE_REASON}' (no delete).`;
    return summary;
  }

  if (mode === "verify") {
    const [items, staged, searches, flags, candidates] = await Promise.all([
      deps.readAllByIds("intelligence_items", "id", ITEM_IDS),
      deps.readAllByIds("staged_updates", "id", STAGED_UPDATE_IDS),
      deps.readAllByIds("agent_run_searches", "id", AGENT_RUN_SEARCH_IDS),
      deps.readAllByIds("integrity_flags", "id", INTEGRITY_FLAG_IDS),
      deps.readAllByIds("portal_link_candidates", "id, status", SOURCE_URLS, { idColumn: "url" }),
    ]);
    summary.read_back = {
      intelligence_items_remaining: items.length,
      staged_updates_remaining: staged.length,
      agent_run_searches_remaining: searches.length,
      integrity_flags_remaining: flags.length,
      portal_link_candidates_touched: candidates.filter((c) => c.status !== "candidate").length,
    };
    const allZero = Object.values(summary.read_back).every((n) => n === 0);
    summary.note = allZero
      ? "verify: all five post-check SELECTs returned 0, reversal confirmed clean."
      : "verify: at least one post-check SELECT returned non-zero, reversal is NOT complete or NOT yet run.";
    if (!allZero) summary.exitCode = 1;
    return summary;
  }

  summary.note = `REFUSED, unknown mode '${mode}'. Use --dry (default), --apply, --archive, or --verify.`;
  summary.exitCode = 1;
  return summary;
}

// --- CLI entrypoint --------------------------------------------------------------------------
import { resolve as resolvePath } from "node:path";
import { fileURLToPath as toPath } from "node:url";

const IS_MAIN = process.argv[1] && resolvePath(process.argv[1]) === toPath(import.meta.url);
if (IS_MAIN) {
  const argv = process.argv.slice(2);
  const mode = argv.includes("--apply") ? "apply"
    : argv.includes("--archive") ? "archive"
    : argv.includes("--verify") ? "verify"
    : "dry";

  let deps = {};
  if (mode !== "dry") {
    const { loadLocalEnvFile } = await import("../../lib/env-file.mjs");
    loadLocalEnvFile();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("reverse-chained-apply-2026-09-29: no DB creds (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), cannot run here (exit 2).");
      process.exit(2);
    }
    const { guardedDelete, guardedUpdateByIds, archivePatch, readAllByIds } = await import("../../lib/db.mjs");
    deps = { guardedDelete, guardedUpdateByIds, archivePatch, readAllByIds };
  }

  const summary = await main({ mode }, deps);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(typeof summary.exitCode === "number" ? summary.exitCode : 0);
}
