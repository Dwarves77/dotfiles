// Minimal parser for docs/inventories/*.md table rows.
// Inventory files are markdown with mixed prose + markdown tables.
// This helper extracts table rows that consistency checks can inspect.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';

// Read an inventory file. Returns null if absent.
export function readInventory(relPath) {
  const abs = join(getRepoRoot(), relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

// Parse all markdown tables in `content`. Returns array of tables;
// each table is { header: [col-name, ...], rows: [{col1: val1, col2: val2, ...}, ...] }.
// Strips leading/trailing pipes, splits on |, trims whitespace.
export function parseMarkdownTables(content) {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const tables = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) {
      if (current && current.rows.length > 0) tables.push(current);
      current = null;
      continue;
    }
    const cells = parseRow(line);

    // Detect separator row (---|---|---)
    if (cells.every((c) => /^[-:]+$/.test(c.replace(/\s/g, '')))) continue;

    // If this is the first row (header), set up the table
    if (current === null) {
      current = { header: cells, rows: [], startLine: i + 1 };
      continue;
    }

    // Data row: zip cells to header columns
    const row = {};
    for (let j = 0; j < current.header.length; j++) {
      row[current.header[j]] = cells[j] !== undefined ? cells[j] : '';
    }
    row._sourceLine = i + 1;
    current.rows.push(row);
  }

  if (current && current.rows.length > 0) tables.push(current);
  return tables;
}

function parseRow(line) {
  const stripped = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split('|').map((c) => c.trim());
}

// Strip markdown link syntax: [label](url) -> label
export function stripMarkdownLink(s) {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// Strip markdown inline-code: `foo` -> foo
export function stripBackticks(s) {
  return s.replace(/`([^`]+)`/g, '$1');
}

// Common cleanup
export function cleanCell(s) {
  return stripBackticks(stripMarkdownLink(s || '')).trim();
}
