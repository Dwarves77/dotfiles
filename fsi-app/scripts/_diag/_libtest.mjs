const U = "https://www.smartfreightcentre.org/en/skills/library/measuring-and-reporting-the-carbon-footprint-of-electric-freight-vehicle-operations-whitepaper/";
const res = await fetch(U, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
console.log(`status: ${res.status} ${res.statusText}  content-type: ${res.headers.get("content-type")}`);
const html = await res.text();
const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const blocked = /request could not be satisfied|request blocked|access denied|just a moment|cloudflare/i.test(text);
console.log(`textLen: ${text.length}  blocked-signature: ${blocked}`);
console.log(`head: ${text.slice(0, 260)}`);
// pull pdf / s3 / download links
const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(h=>/\.pdf|s3\.amazonaws|s3-|download|documents\//i.test(h));
console.log(`\ndocument/pdf links found: ${links.length}`);
for (const l of [...new Set(links)].slice(0,10)) console.log(`  ${l}`);
