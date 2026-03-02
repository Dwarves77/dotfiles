// ── Blob Download Helper ──
// Creates a temporary URL, triggers download, then cleans up.
// This avoids clipboard API and window.open, both of which fail in sandboxed environments.

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/html"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function safeName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_");
}
