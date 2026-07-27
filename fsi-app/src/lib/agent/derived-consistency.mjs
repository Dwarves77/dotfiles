// derived-consistency.mjs — the ARITHMETIC-CONSISTENCY guard for Gate B DERIVED mints (operator ruling
// 2026-07-27). A DERIVED claim may be written ONLY if the derived date is arithmetically consistent with its
// basis recurring rule — an annual June-1 rule can only ground June-1 dates or bare years; a May date is
// rejected. This makes a wrong basis match (Tier-1 auto OR Tier-2 judged) structurally difficult: the worst
// case is a rejected mint, never a mis-derivation in the corpus. Pure + deterministic; both tiers call it.

const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
const MON_RE = "(january|february|march|april|may|june|july|august|september|october|november|december)";

/** Parse a recurring rule from a FACT span. Returns {kind:'annual', month, day|null} or null when no
 *  deterministic recurring rule is present. Deterministic: needs an annual signal AND a month (day optional). */
export function parseRecurringRule(span) {
  const s = String(span || "").toLowerCase();
  const annual = /\b(every year|each year|annually|annual|yearly|per year|per annum|each calendar year)\b/.test(s);
  if (!annual) return null;
  // month + optional day: "june 1", "1 june", "by june 1", "june 1st"
  let m = s.match(new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (m) return { kind: "annual", month: MONTHS[m[1]], day: parseInt(m[2], 10) };
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}\\b`));
  if (m) return { kind: "annual", month: MONTHS[m[2]], day: parseInt(m[1], 10) };
  m = s.match(new RegExp(`\\b${MON_RE}\\b`));
  if (m) return { kind: "annual", month: MONTHS[m[1]], day: null }; // month-only annual (e.g. "reported each June")
  return null;
}

/** Parse a derived-date token → {year, month|null, day|null} or null. */
export function parseDerivedDate(token) {
  const t = String(token || "").trim().toLowerCase();
  let m = t.match(new RegExp(`^(\\d{1,2})\\s+${MON_RE}\\s+(\\d{4})$`)); // "1 june 2027"
  if (m) return { day: parseInt(m[1], 10), month: MONTHS[m[2]], year: parseInt(m[3], 10) };
  m = t.match(new RegExp(`^${MON_RE}\\s+(\\d{4})$`)); // "june 2026"
  if (m) return { day: null, month: MONTHS[m[1]], year: parseInt(m[2], 10) };
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); // "2026-06-10"
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  m = t.match(/^(19[89]\d|20[0-4]\d)$/); // bare year in horizon
  if (m) return { year: parseInt(m[1], 10), month: null, day: null };
  return null;
}

/** Is the derived date arithmetically consistent with the recurring rule? Fail-closed on any mismatch or
 *  unparseable input. Annual rule: the date's month (if present) must equal the rule's month, and its day
 *  (if present, and the rule specifies one) must equal the rule's day; a year is required and must be in
 *  a plausible horizon. A bare year is consistent (it is the rule's instance for that year). */
export function isDerivedConsistent(ruleSpanOrObj, token) {
  const rule = typeof ruleSpanOrObj === "string" ? parseRecurringRule(ruleSpanOrObj) : ruleSpanOrObj;
  const date = parseDerivedDate(token);
  if (!rule || !date) return false;
  if (rule.kind !== "annual") return false; // only annual rules supported today (interval = future extension)
  if (date.year == null || date.year < 1990 || date.year > 2049) return false; // horizon
  if (date.month != null && date.month !== rule.month) return false; // month mismatch → reject
  if (date.day != null && rule.day != null && date.day !== rule.day) return false; // day mismatch → reject
  return true;
}
