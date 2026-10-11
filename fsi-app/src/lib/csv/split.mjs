export function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** Split CSV text into a header row + data rows (array of raw string arrays). Strips BOM and
 *  normalises CRLF. Blank lines are skipped (never counted as a row, matching the admin bulk-import
 *  route's own convention). */
export function splitCsvText(raw) {
  const text = String(raw ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1)
    .map((l) => splitCsvLine(l))
    .filter((cells) => !cells.every((c) => c.trim() === ""));
  return { header, rows };
}
