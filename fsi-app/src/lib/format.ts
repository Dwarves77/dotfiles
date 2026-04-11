/** Format an ISO date string to human-readable form */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Handle YYYY-MM, YYYY-MM-DD, or full ISO
  const parts = iso.split(/[-T]/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parts[2] ? parseInt(parts[2]) : undefined;

  if (isNaN(year) || isNaN(month)) return iso;

  if (day) {
    return `${day} ${months[month]} ${year}`;
  }
  return `${months[month]} ${year}`;
}

/** Format a date for timeline display — shorter form */
export function formatTimelineDate(iso: string): string {
  return formatDate(iso);
}

/** Get quarter from date */
export function getQuarter(iso: string): { year: number; quarter: number; label: string } {
  const parts = iso.split(/[-T]/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);

  // Q1 = Jan-Mar (1-3), Q2 = Apr-Jun (4-6), Q3 = Jul-Sep (7-9), Q4 = Oct-Dec (10-12)
  const quarter = Math.ceil(month / 3);

  return { year, quarter, label: `${year} Q${quarter}` };
}
