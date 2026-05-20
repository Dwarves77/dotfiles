#!/usr/bin/env node
// Mint a new dispatch UUID for a session.
//
// Usage:
//   node fsi-app/.discipline/dispatch/start.mjs <slug>
//
// Prints the UUID to stdout. Operator records it and adds
// `Dispatch-UUID: <uuid>` to every commit message body during the dispatch.
//
// UUID format: <YYYY-MM-DD>-<random-hex-8>-<dispatch-slug>
//   - Date prefix: groups by day; auditable
//   - Random hex: disambiguates same-day dispatches
//   - Slug: human-readable; lowercase, hyphenated, no spaces

import { randomBytes } from 'node:crypto';

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function randomHex8() {
  return randomBytes(4).toString('hex');
}

export function mintUuid(slug, opts = {}) {
  const cleanSlug = slugify(slug);
  if (!cleanSlug) throw new Error('Dispatch slug required (lowercase, hyphenated, non-empty).');
  const date = opts.date || isoDate();
  const hex = opts.hex || randomHex8();
  return `${date}-${hex}-${cleanSlug}`;
}

function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Error: dispatch slug required.');
    console.error('Usage: node fsi-app/.discipline/dispatch/start.mjs <slug>');
    console.error('Example: node fsi-app/.discipline/dispatch/start.mjs sprint-architecture');
    process.exit(2);
  }
  let uuid;
  try {
    uuid = mintUuid(slug);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  // Print the UUID alone on stdout so operators can pipe / capture it.
  console.log(uuid);
  // Print usage hint to stderr (won't pollute pipe)
  console.error('');
  console.error('Add this trailer to every commit body during the dispatch:');
  console.error(`  Dispatch-UUID: ${uuid}`);
  console.error('');
  console.error('Audit later with:');
  console.error(`  node fsi-app/.discipline/dispatch/audit.mjs ${uuid}`);
}

// Detect direct invocation (vs import for testing)
const invokedDirectly = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
                        process.argv[1].endsWith('start.mjs');
if (invokedDirectly) main();
