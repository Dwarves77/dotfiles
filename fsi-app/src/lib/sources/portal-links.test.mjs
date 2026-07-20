// Red-then-green for portal deep-link extraction (P2-5 / S2-08).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPortalLinks } from "./portal-links.mjs";

const PORTAL = "https://transport.ec.example";

const HTML = `
<nav><a href="/about">About us</a><a href="/contact">Contact</a><a href="#main">Skip</a></nav>
<main>
  <a href="/legislation/reg-2025-40">Regulation (EU) 2025/40 — packaging</a>
  <a href="https://transport.ec.example/law/afir-2023-1804/">AFIR deployment rules</a>
  <a href="https://www.transport.ec.example/consultation/open-2026">Open consultation: HDV CO2</a>
  <a href="https://other-site.example/regulation/x">External regulation</a>
  <a href="/news/team-photo.png">Photo</a>
  <a href="/legislation/reg-2025-40#annex">Same reg, anchor</a>
  <a href="mailto:info@ec.example">Mail</a>
  <a href="/">Home</a>
</main>`;

test("extracts same-host instrument links, resolved absolute", () => {
  const links = extractPortalLinks(HTML, PORTAL);
  const urls = links.map((l) => l.url);
  assert.ok(urls.includes("https://transport.ec.example/legislation/reg-2025-40"));
  assert.ok(urls.includes("https://transport.ec.example/law/afir-2023-1804"));
});

test("www variant of the portal host counts as same-host", () => {
  const urls = extractPortalLinks(HTML, PORTAL).map((l) => l.url);
  assert.ok(urls.some((u) => u.includes("/consultation/open-2026")));
});

test("excludes cross-host, nav, assets, mailto, anchors, and the root itself", () => {
  const urls = extractPortalLinks(HTML, PORTAL).map((l) => l.url);
  assert.ok(!urls.some((u) => u.includes("other-site.example")));
  assert.ok(!urls.some((u) => u.includes("/about") || u.includes("/contact")));
  assert.ok(!urls.some((u) => u.includes(".png")));
  assert.ok(!urls.some((u) => u.startsWith("mailto:")));
  assert.ok(!urls.includes("https://transport.ec.example"));
});

test("dedupes hash variants of the same instrument", () => {
  const urls = extractPortalLinks(HTML, PORTAL).map((l) => l.url);
  assert.equal(urls.filter((u) => u.endsWith("/legislation/reg-2025-40")).length, 1);
});

test("anchor text captured and tag-stripped", () => {
  const links = extractPortalLinks(HTML, PORTAL);
  const reg = links.find((l) => l.url.endsWith("/legislation/reg-2025-40"));
  assert.equal(reg.anchorText, "Regulation (EU) 2025/40 — packaging");
});

test("instrument signal may come from anchor text when the path is opaque", () => {
  const html = `<a href="/doc/12345">New directive on fleet emissions</a><a href="/doc/9">Cafeteria menu</a>`;
  const links = extractPortalLinks(html, PORTAL);
  assert.equal(links.length, 1);
  assert.ok(links[0].url.endsWith("/doc/12345"));
});

test("cap bounds output; bad inputs return empty", () => {
  const many = Array.from({ length: 100 }, (_, i) => `<a href="/regulation/${i}">Rule ${i}</a>`).join("");
  assert.equal(extractPortalLinks(many, PORTAL).length, 40);
  assert.deepEqual(extractPortalLinks(null, PORTAL), []);
  assert.deepEqual(extractPortalLinks(HTML, "not a url"), []);
});

test("opts.cap overrides DEFAULT_CAP in both directions (raise for cap-completion re-harvest)", () => {
  const many = Array.from({ length: 100 }, (_, i) => `<a href="/regulation/${i}">Rule ${i}</a>`).join("");
  // A raised cap (the census cap-completion re-harvest) admits more than the 40 default, up to what exists.
  assert.equal(extractPortalLinks(many, PORTAL, { cap: 200 }).length, 100);
  // A lowered cap still bounds output.
  assert.equal(extractPortalLinks(many, PORTAL, { cap: 10 }).length, 10);
  // A cap at exactly the link count admits all of them (measured-N, not capped-N).
  assert.equal(extractPortalLinks(many, PORTAL, { cap: 100 }).length, 100);
});
