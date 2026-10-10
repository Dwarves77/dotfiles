// live-hydration.mjs (lane HYDRA-1, 2026-10-10): what the live smoke records when a page reports a hydration error.
//
// WHY. Run 38027370806 reported "Minified React error #418 (args HTML)" on `/` at 375px. The minified message names no
// component, and the run kept only the first 120 characters. React's argument `HTML` is the structural branch of the
// mismatch (an element or Suspense boundary the server and the client disagree about), so the evidence that names the
// node is the two documents: the HTML the server sent and the DOM the browser holds after hydration. This module is
// the pure half of that capture: recognise the error, build the headers for the second fetch of the same URL, and
// reduce the two documents to the first differing element path. The browser half lives in live-smoke.mjs.
//
// The structural diff is a deliberate approximation: it compares ELEMENT structure under <body>, skips what is not part
// of React's tree (scripts, styles, templates, the streaming fragments the server appends and React removes, Next's
// route announcer and dev portal), and ignores text. A difference it reports is a candidate, named by tag, id and the
// data-audit / data-part attributes the product's parts carry, never a verdict.

const HYDRATION_ERROR = /Minified React error #(?:418|423|425)\b|Hydration failed|hydrated but some attributes|didn't match the client|did not match/i;

/** True when a console / page error text is one of React's hydration mismatch errors. @param {string} text */
export function isHydrationError(text) {
  return HYDRATION_ERROR.test(String(text ?? ""));
}

const DROP_REQUEST_HEADERS = new Set(["content-length", "host", "connection", "accept-encoding"]);

/** Request headers for the second fetch: the navigation's own, minus pseudo headers and transport-owned ones. @param {Record<string,string>} headers */
export function headersForRefetch(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    const key = k.toLowerCase();
    if (key.startsWith(":") || DROP_REQUEST_HEADERS.has(key)) continue;
    out[key] = v;
  }
  return out;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const IGNORED_TAGS = new Set(["script", "style", "template", "noscript", "link", "meta", "title", "next-route-announcer", "nextjs-portal"]);
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/gi;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(src) {
  const attrs = {};
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(src))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return attrs;
}

/** HTML text -> { tag, attrs, children } element tree (no text nodes). Tolerant: an unmatched close tag is ignored. @param {string} html */
export function parseElements(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  TOKEN.lastIndex = 0;
  let m;
  const src = String(html ?? "");
  while ((m = TOKEN.exec(src))) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const node = { tag, attrs: parseAttrs(m[3] ?? ""), children: [] };
      stack[stack.length - 1].children.push(node);
      if (VOID.has(tag) || m[4] === "/") continue;
      if (RAW_TEXT.has(tag)) {
        const close = src.toLowerCase().indexOf(`</${tag}`, TOKEN.lastIndex);
        if (close < 0) break;
        TOKEN.lastIndex = close;
        continue;
      }
      stack.push(node);
    }
  }
  return root;
}

function keep(node) {
  if (IGNORED_TAGS.has(node.tag)) return false;
  const id = node.attrs.id ?? "";
  // The fragments the server streams after the shell and React removes once it swaps a boundary in.
  if ("hidden" in node.attrs && /^[SB]:\d+/.test(id)) return false;
  return true;
}

const kids = (node) => node.children.filter(keep);

function segment(node, index) {
  const a = node.attrs;
  const name = a["data-audit"] || a["data-part"] || "";
  return `${node.tag}${a.id ? `#${a.id}` : ""}${name ? `[${name}]` : ""}:${index + 1}`;
}

function describe(node) {
  if (!node) return "(none)";
  const a = node.attrs;
  const extra = a["data-audit"] || a["data-part"] || (a.class ? a.class.split(/\s+/)[0] : "");
  return `<${node.tag}${a.id ? ` id=${a.id}` : ""}${extra ? ` ${extra}` : ""}>`;
}

const bodyOf = (root) => {
  const html = root.children.find((c) => c.tag === "html");
  return html?.children.find((c) => c.tag === "body") ?? html ?? root;
};

/**
 * First element-structure differences between the server's HTML and the hydrated document's HTML.
 * Returns null when the structures agree, else { path, serverChildren, clientChildren, server, client, others }
 * where `path` is the first difference (a segment per ancestor, tag#id[data-audit]:nth) and `others` lists up to four
 * further differences for context. Text is not compared.
 * @param {string} serverHtml @param {string} clientHtml
 */
export function structuralDiff(serverHtml, clientHtml) {
  const found = [];
  const walk = (s, c, path) => {
    if (found.length >= 5) return;
    const sk = kids(s);
    const ck = kids(c);
    const n = Math.max(sk.length, ck.length);
    for (let i = 0; i < n && found.length < 5; i++) {
      const a = sk[i];
      const b = ck[i];
      if (!a || !b || a.tag !== b.tag) {
        found.push({
          path: [...path, segment(a ?? b, i)].join(" > "),
          serverChildren: sk.map(describe),
          clientChildren: ck.map(describe),
          server: describe(a),
          client: describe(b),
        });
        // Past a mismatch the two sequences are misaligned; stop at this level.
        return;
      }
      walk(a, b, [...path, segment(a, i)]);
    }
  };
  walk(bodyOf(parseElements(serverHtml)), bodyOf(parseElements(clientHtml)), ["body"]);
  if (found.length === 0) return null;
  const [first, ...others] = found;
  return { ...first, others: others.map((o) => ({ path: o.path, server: o.server, client: o.client })) };
}
