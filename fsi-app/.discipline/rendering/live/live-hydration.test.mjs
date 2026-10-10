import test from "node:test";
import assert from "node:assert/strict";
import { isHydrationError, headersForRefetch, parseElements, structuralDiff } from "./live-hydration.mjs";

const doc = (body) => `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>x</title><style>.a>b{}</style></head><body>${body}</body></html>`;

test("isHydrationError recognises React's hydration errors, minified and not, and nothing else", () => {
  assert.equal(isHydrationError("Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message"), true);
  assert.equal(isHydrationError("Minified React error #423; visit"), true);
  assert.equal(isHydrationError("Minified React error #425; visit"), true);
  assert.equal(isHydrationError("Hydration failed because the server rendered HTML didn't match the client."), true);
  assert.equal(isHydrationError("Minified React error #419; visit"), false);
  assert.equal(isHydrationError("Cannot read properties of null (reading 'parentNode')"), false);
});

test("headersForRefetch keeps the navigation's headers and drops pseudo and transport-owned ones", () => {
  assert.deepEqual(
    headersForRefetch({ ":authority": "x", Cookie: "a=b", "User-Agent": "UA", "Content-Length": "0", Host: "h", "Accept-Encoding": "gzip" }),
    { cookie: "a=b", "user-agent": "UA" },
  );
});

test("parseElements handles void tags, quoted '>' in attributes, raw-text elements and comments", () => {
  const t = parseElements(doc(`<div id="a" data-x="1>2"><img src="i.png"><br/><!-- <p> --><script>if (a<b) { "</div>" }</script><p>t</p></div>`));
  const body = t.children[0].children[1];
  const a = body.children[0];
  assert.equal(a.attrs.id, "a");
  assert.deepEqual(a.children.map((c) => c.tag), ["img", "br", "script", "p"]);
});

test("structuralDiff: identical structure (text and ignored nodes differ) is null", () => {
  const server = doc(`<div id="root"><p>one</p><div hidden id="S:0"><b>x</b></div><script>1</script></div><template id="B:0"></template>`);
  const client = doc(`<div id="root"><p>TWO</p></div>`);
  assert.equal(structuralDiff(server, client), null);
});

test("structuralDiff: ATTACK a client-only element is named with its path", () => {
  const server = doc(`<main><section data-audit="what-changed-card"><ul><li>a</li></ul></section></main>`);
  const client = doc(`<main><section data-audit="what-changed-card"><ul><li>a</li><li>b</li></ul></section></main>`);
  const d = structuralDiff(server, client);
  assert.ok(d);
  assert.equal(d.path, "body > main:1 > section[what-changed-card]:1 > ul:1 > li:2");
  assert.equal(d.server, "(none)");
  assert.equal(d.client, "<li>");
});

test("structuralDiff: ATTACK a different tag at the same position is named on both sides", () => {
  const server = doc(`<div><a data-part="rail-card" href="/x">k</a></div>`);
  const client = doc(`<div><span data-part="rail-card">k</span></div>`);
  const d = structuralDiff(server, client);
  assert.equal(d.server, "<a rail-card>");
  assert.equal(d.client, "<span rail-card>");
  assert.match(d.path, /^body > div:1 > a\[rail-card\]:1$/);
});

test("structuralDiff: content present on one side only names the first node that is missing on the other", () => {
  const server = doc(`<div id="rail"><div data-audit="skeleton"></div></div>`);
  const client = doc(`<div id="rail"><div data-audit="watchlist-rail"><ul></ul></div></div>`);
  const d = structuralDiff(server, client);
  assert.equal(d.client, "<ul>");
  assert.equal(d.server, "(none)");
  assert.equal(structuralDiff(doc(`<div id="rail"></div>`), client).client, "<div watchlist-rail>");
});
