import { MARKET_SERIES_PRODUCERS, producerFor } from "./series-registry.mjs";

/**
 * Class order for the headline row (ruling step 2, verbatim: "Order: fuels · carbon (EUA, when a
 * series exists) · FX · other indices"). A class with no family today simply contributes nothing and
 * leaves no hole; the day its first series lands it takes its place here with no code change. Carbon
 * is the live example: eex-eua is a registered producer with zero rows.
 */
export const FAMILY_CLASS_ORDER = Object.freeze(["fuel", "carbon", "fx", "index"]);

/** Fallback class for a series whose key prefix matches no registry entry at all (buildSeriesBoard's
 *  `unregistered` bucket). "other indices" is the ruling's own last class, so an unclaimed signal
 *  sorts last and is never dropped. */
const UNREGISTERED_FAMILY_CLASS = "index";

/**
 * @typedef {object} SeriesFamily
 * @property {string} familyKey        stable identity, "<class>:<signal>"
 * @property {string} familyClass      one of FAMILY_CLASS_ORDER
 * @property {string} label            the card's own label for this signal. For the five families the
 *   artboard draws, this is artboard 04's own card copy verbatim ("Diesel · EU avg before tax",
 *   "Euro-Super 95 · EU avg", "Heavy fuel oil 3.5%S", "Residual fuel oil 1%S", "EUR/USD · ECB ref."),
 *   because the image is the spec. It is used ONLY when the card shows that family's declared primary
 *   member; a card showing a different member of the same family falls back to that observation's own
 *   market_series.label, since a label naming the EU average would be false over a New York spot.
 * @property {string|null} freightMode the freight mode whose cost this signal drives, or null
 * @property {string} memberNoun       plural noun for the fold ("+3 rates", "+1 quote")
 * @property {string[]} memberSeriesKeys  every market_series.series_key that quotes this signal
 * @property {string} primarySeriesKey    the member whose observation the card shows
 */

/**
 * The declared families: every case where MORE THAN ONE series quotes the same signal, plus carbon,
 * which is declared ahead of its data on purpose (see EEX below). Anything absent from this list
 * resolves to a family of its own, so this list is short by design and stays short.
 *
 * Membership was read from the live table on 2026-09-08 (16 series keys observed, see this lane's
 * session-log entry for the enumeration), not guessed from the registry.
 */
export const SERIES_FAMILIES = Object.freeze([
  Object.freeze({
    familyKey: "fuel:diesel",
    familyClass: "fuel",
    label: "Diesel · EU avg before tax",
    freightMode: "road",
    memberNoun: "quotes",
    // Two quotes of one signal: the EU-wide pre-tax average, and the EIA's New York ultra-low-sulfur
    // spot. Different units (EUR/1000L against $/GAL), which is precisely why they are folded onto one
    // card rather than compared: series-deltas.mjs refuses cross-unit comparison, and so does the fold.
    memberSeriesKeys: Object.freeze([
      "eu-oil-bulletin:automotive-diesel",
      "eia-v2:diesel-no2-low-sulfur-eer-epd2f-pf4-y35ny-dpg",
    ]),
    primarySeriesKey: "eu-oil-bulletin:automotive-diesel",
  }),
  Object.freeze({
    familyKey: "fuel:gasoline",
    familyClass: "fuel",
    label: "Euro-Super 95 · EU avg",
    freightMode: "road",
    memberNoun: "quotes",
    memberSeriesKeys: Object.freeze([
      "eu-oil-bulletin:eurosuper-95",
      "eia-v2:gasoline-rbob-regular-eer-epmrr-pf4-y05la-dpg",
    ]),
    primarySeriesKey: "eu-oil-bulletin:eurosuper-95",
  }),
  Object.freeze({
    familyKey: "fuel:heavy-fuel-oil",
    familyClass: "fuel",
    label: "Heavy fuel oil 3.5%S",
    freightMode: "ocean",
    memberNoun: "quotes",
    memberSeriesKeys: Object.freeze(["eu-oil-bulletin:heavy-fuel-oil-3-5pct"]),
    primarySeriesKey: "eu-oil-bulletin:heavy-fuel-oil-3-5pct",
  }),
  Object.freeze({
    familyKey: "fuel:residual-fuel-oil",
    familyClass: "fuel",
    label: "Residual fuel oil 1%S",
    freightMode: "ocean",
    memberNoun: "quotes",
    memberSeriesKeys: Object.freeze(["eu-oil-bulletin:residual-fuel-oil-1pct"]),
    primarySeriesKey: "eu-oil-bulletin:residual-fuel-oil-1pct",
  }),
  Object.freeze({
    familyKey: "fuel:jet-fuel",
    familyClass: "fuel",
    label: "Jet fuel · EIA kerosene spot",
    freightMode: "air",
    memberNoun: "quotes",
    memberSeriesKeys: Object.freeze(["eia-v2:jet-fuel-kerosene-eer-epjk-pf4-rgc-dpg"]),
    primarySeriesKey: "eia-v2:jet-fuel-kerosene-eer-epjk-pf4-rgc-dpg",
  }),
  Object.freeze({
    // The ruling's own worked example: "All ECB FX reference rates are one family; show EUR/USD only
    // and fold the rest under '+3 rates' on the same card". The "+3" is this family's own member count
    // minus one, computed by headline-series-select.mjs from the members it actually saw. It is never a
    // literal: the day a fifth rate is tracked the card reads "+4 rates" with no edit.
    familyKey: "fx:ecb-reference-rates",
    familyClass: "fx",
    label: "EUR/USD · ECB ref.",
    freightMode: null,
    memberNoun: "rates",
    memberSeriesKeys: Object.freeze([
      "ecb-fx:eur-usd",
      "ecb-fx:eur-gbp",
      "ecb-fx:eur-cny",
      "ecb-fx:eur-jpy",
    ]),
    primarySeriesKey: "ecb-fx:eur-usd",
  }),
  Object.freeze({
    // DECLARED AHEAD OF ITS DATA, deliberately. eex-eua is a registered but unbuilt producer
    // (series-registry.mjs, implemented:false, zero rows), and the ruling says "carbon (EUA, when a
    // series exists)". A family with no observed member contributes nothing to the row, so this entry
    // is inert today and correct the day the first auction row lands, which is the point: the carbon
    // slot needs no code change to open. Proven by the ordering test that inserts a carbon family.
    familyKey: "carbon:eua",
    familyClass: "carbon",
    label: "EUA · EU ETS auction clearing",
    freightMode: null,
    memberNoun: "quotes",
    memberSeriesKeys: Object.freeze(["eex-eua:eua-primary"]),
    primarySeriesKey: "eex-eua:eua-primary",
  }),
]);

function seriesKeyPrefix(seriesKey) {
  return String(seriesKey || "").split(":")[0];
}

/**
 * The ordering class a series takes when no declared family claims it: its producer's own declared
 * class, or UNREGISTERED_FAMILY_CLASS when the prefix matches no registry entry.
 * @param {string} seriesKey
 * @returns {string}
 */
function familyClassForSeriesKey(seriesKey) {
  const entry = producerFor(seriesKeyPrefix(seriesKey));
  return entry?.familyClass ?? UNREGISTERED_FAMILY_CLASS;
}

/**
 * Resolve one series_key to its family. Never returns null: an unclaimed series is its own family.
 *
 * @param {string} seriesKey
 * @param {{ families?: readonly SeriesFamily[] }} [opts] override the declared list (tests only).
 * @returns {SeriesFamily & { declared: boolean }}
 */
export function resolveSeriesFamily(seriesKey, { families = SERIES_FAMILIES } = {}) {
  const key = String(seriesKey || "");
  const declared = families.find((f) => f.memberSeriesKeys.includes(key));
  if (declared) return { ...declared, declared: true };

  const familyClass = familyClassForSeriesKey(key);
  return {
    familyKey: `${familyClass}:${key}`,
    familyClass,
    label: "", // no declared label: the caller uses the observation's own market_series.label
    freightMode: null,
    memberNoun: "series",
    memberSeriesKeys: [key],
    primarySeriesKey: key,
    declared: false,
  };
}

/**
 * Registry position of a series' producer, used as an ordering tiebreak inside one class (the
 * registry is the intended reading order of the producers themselves). An unknown prefix sorts after
 * every known one.
 * @param {string} seriesKey
 * @returns {number}
 */
export function producerOrderForSeriesKey(seriesKey) {
  const prefix = seriesKeyPrefix(seriesKey);
  const i = MARKET_SERIES_PRODUCERS.findIndex((p) => p.keyPrefix === prefix);
  return i === -1 ? MARKET_SERIES_PRODUCERS.length : i;
}
