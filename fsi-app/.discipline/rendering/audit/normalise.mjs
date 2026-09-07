// Design-audit value normalisation (lane uxaudit-harness, 2026-09-07). PURE — no browser, no
// filesystem, no npm dep — so run-test-suite.sh's node --test list proves it (normalise.test.mjs)
// while run-audit.mjs consumes the same functions against real getComputedStyle output.
//
// WHY IT EXISTS. The design source states values the way a designer writes them (`#DC2626`,
// `rgba(0,0,0,.12)`, `0.04em`, `2px solid #1A1A1A`); a browser reports them the way CSSOM
// serialises them (`rgb(220, 38, 38)`, `rgba(0, 0, 0, 0.12)`, `0.56px`, `2px solid rgb(26, 26, 26)`).
// A string compare between those two forms is false MISMATCH noise, which is exactly the failure
// mode that makes an audit unbelievable (CLAUDE.md rule 14). Everything here reduces both sides to
// ONE canonical form before comparing, and nothing here decides what the right value IS — that
// lives in the spec JSON files.
//
// WILDCARD. A single `*` token matches any one token. It exists for exactly one honest reason:
// getComputedStyle resolves `grid-template-columns` to USED pixel widths, so an `1fr` track reports
// the container's leftover width and cannot be stated as a design constant. `3px 56px * 88px 84px
// 76px 40px 44px` therefore checks every fixed track exactly and admits the one elastic track. It is
// not a general escape hatch; a spec that wildcards a stated design value is hiding a mismatch.

/** Chrome's CSSOM alpha serialisation, matched to 4dp. */
function fmtAlpha(a) {
  const n = Math.round(a * 10000) / 10000;
  return String(n);
}

function fmtNum(n) {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

/** #RGB / #RGBA / #RRGGBB / #RRGGBBAA -> canonical rgb()/rgba(). */
function hexToCanonical(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (h.length === 8) {
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return `rgba(${r},${g},${b},${fmtAlpha(a)})`;
  }
  return `rgb(${r},${g},${b})`;
}

/** rgb()/rgba() in any spacing or legacy/modern syntax -> canonical form. */
function rgbToCanonical(fn) {
  const inner = fn.slice(fn.indexOf('(') + 1, fn.lastIndexOf(')'));
  const parts = inner.split(/[,/\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const r = Math.round(num(parts[0]));
  const g = Math.round(num(parts[1]));
  const b = Math.round(num(parts[2]));
  if (parts.length >= 4) {
    const raw = parts[3];
    const a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
    if (a >= 1) return `rgb(${r},${g},${b})`;
    return `rgba(${r},${g},${b},${fmtAlpha(a)})`;
  }
  return `rgb(${r},${g},${b})`;
}

const NAMED = {
  transparent: 'rgba(0,0,0,0)',
  white: 'rgb(255,255,255)',
  black: 'rgb(0,0,0)',
};

/**
 * Rewrite every colour token inside `value` (a bare colour, or colours embedded in a shorthand or a
 * gradient) to canonical rgb()/rgba(). Non-colour text is untouched.
 */
export function normaliseColours(value) {
  let out = String(value);
  out = out.replace(/\brgba?\([^()]*\)/gi, (m) => rgbToCanonical(m) ?? m);
  out = out.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => hexToCanonical(m) ?? m);
  out = out.replace(/\b(transparent|white|black)\b/gi, (m) => NAMED[m.toLowerCase()] ?? m);
  return out;
}

/** `12.00px` -> `12px`, `0.560px` -> `0.56px`, `0` -> `0px` when a unit is expected elsewhere. */
export function normaliseNumbers(value) {
  return String(value).replace(/(-?\d*\.?\d+)(px|%|em|rem|deg|ch)?/g, (m, n, unit) =>
    unit ? `${fmtNum(parseFloat(n))}${unit}` : `${fmtNum(parseFloat(n))}`,
  );
}

/** `0.04em` -> px, using the element's own computed font-size. Returns null when not an em value. */
export function emToPx(token, fontSizePx) {
  const m = /^(-?\d*\.?\d+)em$/.exec(String(token).trim());
  if (!m || !Number.isFinite(fontSizePx)) return null;
  return parseFloat(m[1]) * fontSizePx;
}

/** Collapse runs of whitespace; trim. Used for both CSS values and textContent. */
export function collapse(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function canonicalToken(token, fontSizePx) {
  let t = collapse(token);
  // Unitless zero is zero of any unit in CSS; CSSOM always serialises it with a unit, the design
  // source usually does not (`border-radius: 0 8px 8px 0`).
  if (/^-?0(\.0+)?$/.test(t)) t = '0px';
  const em = emToPx(t, fontSizePx);
  if (em != null) t = `${fmtNum(em)}px`;
  t = normaliseColours(t);
  t = normaliseNumbers(t);
  return t.toLowerCase();
}

/** Both tokens parse as the same-unit length within 0.05px (sub-pixel layout rounding). */
function numericallyEqual(a, b) {
  const ma = /^(-?\d*\.?\d+)px$/.exec(a);
  const mb = /^(-?\d*\.?\d+)px$/.exec(b);
  if (!ma || !mb) return false;
  return Math.abs(parseFloat(ma[1]) - parseFloat(mb[1])) <= 0.05;
}

/**
 * Compare one expected design value against one measured computed value.
 *
 * @param {string} expected  as written in the spec JSON (design source form)
 * @param {string} actual    getComputedStyle output (or textContent for a `text` key)
 * @param {{fontSizePx?: number}} [ctx] the element's own computed font-size, for `em` expectations
 * @returns {{ok: boolean, expected: string, actual: string}}
 */
export function compareValue(expected, actual, ctx = {}) {
  const fs = ctx.fontSizePx;
  const rawExpected = collapse(expected);
  const rawActual = collapse(actual);
  if (rawExpected === '*') return { ok: true, expected: rawExpected, actual: rawActual };
  // `contains:<substring>` — for a computed value whose exact serialisation is not itself a design
  // statement (a font-family FALLBACK STACK: the design names the face, theme.css owns the stack).
  if (rawExpected.startsWith('contains:')) {
    const needle = rawExpected.slice('contains:'.length).trim().toLowerCase();
    return { ok: rawActual.toLowerCase().includes(needle), expected: rawExpected, actual: rawActual };
  }

  const eTokens = rawExpected.split(' ');
  const aTokens = rawActual.split(' ');
  if (eTokens.length !== aTokens.length) {
    // Fall back to a whole-string canonical compare: a shorthand can serialise with a different
    // token count (`border-radius: 0 8px 8px 0` stays four, but `background` gains an image layer).
    const e = canonicalToken(rawExpected, fs);
    const a = canonicalToken(rawActual, fs);
    return { ok: e === a, expected: rawExpected, actual: rawActual };
  }
  for (let i = 0; i < eTokens.length; i++) {
    if (eTokens[i] === '*') continue;
    const e = canonicalToken(eTokens[i], fs);
    const a = canonicalToken(aTokens[i], fs);
    if (e === a) continue;
    if (numericallyEqual(e, a)) continue;
    return { ok: false, expected: rawExpected, actual: rawActual };
  }
  return { ok: true, expected: rawExpected, actual: rawActual };
}
