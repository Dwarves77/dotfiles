// derive-obligation-objects.mjs, the WRITER of `obligation_objects` (migration 376, spec 01 section 3.2)
// (lane HALF-1, 2026-10-11). Called from derive-obligations.mjs `main`, so every runtime that runs the
// derive-obligations step (the maintenance wrapper in the downstream chain, run-population-flywheel step 8) reaches it.
//
// WHAT IT DOES. Takes CANDIDATE provisions (one per obligation: the pinpoint, the verbatim provision text, the
// duty-holder classes, the applicability trigger, optional dates and scope), proves each against the held capture, and
// plans one `obligation_objects` row per accepted candidate. It never reads prose and decides nothing about what a
// provision SAYS: candidates are produced by a grounded drain batch (population is a later stage, operator ruling
// 2026-10-04), and a candidate file is the only input. No candidates, no reads, no writes.
//
// WHAT IT NEVER DOES.
//  - Invent a field: a date, cost slot, frequency or scope the candidate does not carry stays NULL.
//  - Write a status other than `not_assessed`: yes / no is a position taken by a person (spec 01 section 3.2), never by
//    this writer; a candidate carrying yes or no is refused.
//  - Overwrite or update a row: it is INSERT-only. A changed provision at an existing pinpoint is a NEW version row whose
//    `supersedes` names the current one (spec 01 section 3.2 "version the obligation object, not the document"), so an
//    admin-set value on an existing row can never be overwritten by this writer.
//  - Write a span that is not verbatim: the same rule as the database guard (`obligation_objects_guard`, migration 376:
//    lower(btrim(span)) is a substring of lower(capture), the capture belongs to the instrument item, ADR-016) is checked
//    here first, so a dry run predicts the refusals instead of the database discovering them.
//  - Compute the instrument entity: the guard trigger fills `instrument_entity_id` from the item (migration 283) and the
//    outbox trigger (migration 352's two-argument form) emits the propagation event keyed on it, so every row this
//    writer inserts reaches the flywheel with no code here (rule 17).
//
// BINDING POSITION. A candidate's own `binding_position` (obligation grain) wins; a candidate without one is classified by
// the instrument-level classifier in derive-obligations.mjs (identity, then record-facts, then title, then monitoring_only
// from the candidate's duty holders); a candidate that neither yields is refused as unclassified, never guessed.
//
// IDS. `cl:obligation:<16 hex>` from entityId("obligation", "<item id>|<pinpoint>|v<version>"): deterministic, so a re-run over
// the same batch plans nothing (idempotent at the script layer; the primary key backs it).
import { entityId } from "../../src/lib/entities/entity-id.mjs";
import { currentObligationObjects } from "../../src/lib/workspace/relevance.mjs";
import { BINDING_POSITION, DUTY_HOLDER_CLASSES } from "../../src/lib/contracts/vocabularies.mjs";

export const OBJECT_DERIVATION_VERSION = "oblig-objects-2026-10-11.1";

export const OBJECT_CITE = Object.freeze({
  skill: "surface-spec-01-regulations",
  reason:
    "Write obligation_objects (migration 376, spec 01 section 3.2): fresh rows only, each span proven verbatim in its held " +
    "capture (ADR-016), status not_assessed, a superseding version rather than an overwrite.",
});

/** The columns this writer sets. Everything else (instrument_entity_id, created_at, updated_at) is the database's. */
export const OBJECT_INSERT_COLUMNS = Object.freeze([
  "obligation_id", "instrument_item_id", "version", "supersedes", "pinpoint_citation", "verbatim_text", "plain_language",
  "binding_position", "duty_holder_class", "applicability_trigger", "jurisdiction", "mode", "vertical", "frequency",
  "entry_into_force", "date_of_application", "first_deadline", "enforcement_start", "evidence_required", "retention_period",
  "sanction_class", "severity_score", "statutory_maximum", "cost_formula", "direct_compliance_cost", "effort", "status",
  "date_reviewed", "next_review_due", "source_id", "capture_id",
]);

const FREQUENCIES = new Set(["annual", "per_consignment", "per_voyage", "event_triggered"]);
// The alias list obligation_objects_mode_no_alias_check refuses (migration 376), mirrored so the dry run predicts it.
const MODE_ALIASES = new Set(["sea", "maritime", "water", "vessel", "marine", "truck", "lorry", "hgv", "barge", "iww", "inland-waterway", "freighter", "airfreight"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_COLUMNS = ["entry_into_force", "date_of_application", "first_deadline", "enforcement_start", "date_reviewed", "next_review_due"];
const MONEY_KEYS = ["amount", "currency", "price", "cost"];

const nz = (s) => (typeof s === "string" ? s.trim() : "");
const norm = (s) => nz(s).toLowerCase();
const nullable = (v) => (v === undefined ? null : v);

/**
 * Pure: validate one candidate and build its INSERT row, or refuse it with a reason. `existingForPinpoint` is the CURRENT
 * object of the same instrument item at the same pinpoint, when one exists (it decides version and supersedes).
 * @param {object} c candidate
 * @param {{ item?: object|null, capture?: object|null, existingForPinpoint?: object|null, classify?: Function }} ctx
 * @returns {{ ok: true, row: object, bindingSource: string } | { ok: false, reason: string }}
 */
export function buildObjectRow(c, { item = null, capture = null, existingForPinpoint = null, classify = () => null } = {}) {
  if (!c || typeof c !== "object") return { ok: false, reason: "candidate_not_an_object" };
  if (!item) return { ok: false, reason: "instrument_item_missing" };
  if (item.is_archived) return { ok: false, reason: "instrument_item_archived" };
  if (!capture) return { ok: false, reason: "capture_missing" };
  if (capture.intelligence_item_id !== c.instrument_item_id) return { ok: false, reason: "capture_not_of_instrument" };
  if (!nz(c.pinpoint_citation)) return { ok: false, reason: "pinpoint_blank" };
  const span = norm(c.verbatim_text);
  if (!span || typeof capture.result_content !== "string" || !capture.result_content.toLowerCase().includes(span)) {
    return { ok: false, reason: "span_not_verbatim" };
  }
  if (c.status !== undefined && c.status !== null && c.status !== "not_assessed") return { ok: false, reason: "status_not_writer_owned" };

  const classes = Array.isArray(c.duty_holder_class) ? c.duty_holder_class.filter((x) => typeof x === "string" && x.trim()) : [];
  if (!classes.length) return { ok: false, reason: "duty_holder_missing" };
  const unknown = classes.find((x) => !DUTY_HOLDER_CLASSES[x]);
  if (unknown) return { ok: false, reason: `duty_holder_unknown:${unknown}` };

  const t = c.applicability_trigger;
  const triggerOk = t && typeof t === "object" && !Array.isArray(t) && nz(t.attribute) && nz(t.value) && typeof t.attribute === "string" && typeof t.value === "string";
  if (!triggerOk) return { ok: false, reason: "trigger_malformed" };

  if (c.frequency != null && !FREQUENCIES.has(c.frequency)) return { ok: false, reason: "frequency_invalid" };
  if (Array.isArray(c.mode) && c.mode.some((m) => MODE_ALIASES.has(m))) return { ok: false, reason: "mode_alias" };
  for (const col of DATE_COLUMNS) {
    if (c[col] != null && !(typeof c[col] === "string" && DATE_RE.test(c[col]))) return { ok: false, reason: `date_malformed:${col}` };
  }
  if (c.effort != null && (typeof c.effort !== "object" || MONEY_KEYS.some((k) => k in c.effort))) return { ok: false, reason: "effort_carries_money" };

  let position = null;
  let bindingSource = "candidate";
  if (c.binding_position != null) {
    if (!BINDING_POSITION[c.binding_position]) return { ok: false, reason: `binding_position_unknown:${c.binding_position}` };
    position = c.binding_position;
  } else {
    const classified = classify(item, { dutyHolderClasses: classes });
    if (classified) { position = classified.position; bindingSource = classified.source; }
  }
  if (!position) return { ok: false, reason: "binding_position_unresolved" };

  const version = existingForPinpoint ? Number(existingForPinpoint.version) + 1 : 1;
  const supersedes = existingForPinpoint ? existingForPinpoint.obligation_id : null;
  const obligation_id = entityId("obligation", `${c.instrument_item_id}|${norm(c.pinpoint_citation)}|v${version}`);

  const row = {
    obligation_id,
    instrument_item_id: c.instrument_item_id,
    version,
    supersedes,
    pinpoint_citation: c.pinpoint_citation,
    verbatim_text: c.verbatim_text,
    plain_language: nullable(c.plain_language),
    binding_position: position,
    duty_holder_class: classes,
    applicability_trigger: { attribute: t.attribute, value: t.value, ...(t.comparison ? { comparison: t.comparison } : {}) },
    jurisdiction: nullable(c.jurisdiction),
    mode: nullable(c.mode),
    vertical: nullable(c.vertical),
    frequency: nullable(c.frequency),
    entry_into_force: nullable(c.entry_into_force),
    date_of_application: nullable(c.date_of_application),
    first_deadline: nullable(c.first_deadline),
    enforcement_start: nullable(c.enforcement_start),
    evidence_required: nullable(c.evidence_required),
    retention_period: nullable(c.retention_period),
    sanction_class: nullable(c.sanction_class),
    severity_score: nullable(c.severity_score),
    statutory_maximum: nullable(c.statutory_maximum),
    cost_formula: nullable(c.cost_formula),
    direct_compliance_cost: nullable(c.direct_compliance_cost),
    effort: nullable(c.effort),
    status: "not_assessed",
    date_reviewed: nullable(c.date_reviewed),
    next_review_due: nullable(c.next_review_due),
    source_id: nullable(c.source_id),
    capture_id: c.capture_id,
  };
  return { ok: true, row, bindingSource };
}

/**
 * Pure: plan the whole batch. Splits candidates into rows to insert, ones already registered (same provision at the same
 * pinpoint: a no-op re-run) and refusals (reason recorded, never silently dropped).
 * @param {object[]} candidates
 * @param {{ itemsById: Map<string, object>, capturesById: Map<string, object>, existing: object[], classify?: Function }} ctx
 */
export function planObligationObjects(candidates, { itemsById, capturesById, existing, classify }) {
  const current = currentObligationObjects(existing ?? []);
  const byPinpoint = new Map(current.map((o) => [`${o.instrument_item_id}|${norm(o.pinpoint_citation)}`, o]));
  const existingIds = new Set((existing ?? []).map((o) => o.obligation_id));
  const toInsert = [];
  const refused = [];
  let alreadyRegistered = 0;
  const seen = new Set();
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const key = `${c?.instrument_item_id}|${norm(c?.pinpoint_citation)}`;
    const label = { instrument_item_id: c?.instrument_item_id ?? null, pinpoint_citation: c?.pinpoint_citation ?? null };
    if (seen.has(key)) { refused.push({ ...label, reason: "duplicate_in_batch" }); continue; }
    seen.add(key);
    const prior = byPinpoint.get(key) ?? null;
    if (prior && norm(prior.verbatim_text) === norm(c?.verbatim_text)) { alreadyRegistered += 1; continue; }
    const built = buildObjectRow(c, {
      item: itemsById.get(c?.instrument_item_id) ?? null,
      capture: capturesById.get(c?.capture_id) ?? null,
      existingForPinpoint: prior,
      classify,
    });
    if (!built.ok) { refused.push({ ...label, reason: built.reason }); continue; }
    if (existingIds.has(built.row.obligation_id)) { alreadyRegistered += 1; continue; }
    toInsert.push({ row: built.row, bindingSource: built.bindingSource });
  }
  return { toInsert, refused, alreadyRegistered };
}

const empty = (apply) => ({
  mode: apply ? "apply" : "dry-run",
  version: OBJECT_DERIVATION_VERSION,
  candidates: 0,
  to_insert: 0,
  already_registered: 0,
  refused: [],
  inserted: 0,
  binding_position_breakdown: {},
});

/**
 * The object phase. Reads only what the candidates name (their items, captures, and the items' existing objects), plans,
 * and under `apply` inserts through the guarded path. DRY by default; `apply` is the same flag, and therefore the same
 * build-mode gate (chained-dry-guard forces a chained firing dry while scrape_cadence is off), as the register phase.
 * @param {{ candidates?: object[], apply?: boolean, classify?: Function }} opts
 * @param {{ readAllByIds: Function, guardedInsertMany: Function }} deps
 */
export async function deriveObligationObjects({ candidates = [], apply = false, classify } = {}, deps) {
  const out = empty(apply);
  const list = Array.isArray(candidates) ? candidates : [];
  out.candidates = list.length;
  if (!list.length) return out;
  const { readAllByIds, guardedInsertMany } = deps;

  const itemIds = [...new Set(list.map((c) => c?.instrument_item_id).filter(Boolean))];
  const captureIds = [...new Set(list.map((c) => c?.capture_id).filter(Boolean))];
  const items = itemIds.length
    ? await readAllByIds("intelligence_items", "id, title, is_archived, jurisdiction_iso, instrument_identifier, canonical_instrument_key", itemIds)
    : [];
  const captures = captureIds.length
    ? await readAllByIds("agent_run_searches", "id, intelligence_item_id, result_content", captureIds)
    : [];
  const existing = itemIds.length
    ? await readAllByIds("obligation_objects", "obligation_id, instrument_item_id, pinpoint_citation, verbatim_text, version, supersedes", itemIds, { idColumn: "instrument_item_id" })
    : [];

  const plan = planObligationObjects(list, {
    itemsById: new Map(items.map((i) => [i.id, i])),
    capturesById: new Map(captures.map((cap) => [cap.id, cap])),
    existing,
    classify,
  });
  out.to_insert = plan.toInsert.length;
  out.already_registered = plan.alreadyRegistered;
  out.refused = plan.refused;
  for (const { row } of plan.toInsert) out.binding_position_breakdown[row.binding_position] = (out.binding_position_breakdown[row.binding_position] ?? 0) + 1;
  if (!apply || !plan.toInsert.length) return out;

  const res = await guardedInsertMany("obligation_objects", plan.toInsert.map((p) => p.row), { cite: OBJECT_CITE, select: "obligation_id" });
  out.inserted = res.inserted;
  if (res.inserted !== plan.toInsert.length) {
    console.error(`[derive-obligation-objects] MISMATCH, ${plan.toInsert.length} rows prepared, ${res.inserted} confirmed inserted`);
    process.exitCode = 1;
  }
  return out;
}
