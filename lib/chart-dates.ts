/**
 * Which dates a chart may put on an axis.
 *
 * A row is published as the filing prints it, with a note, even when the
 * date cannot be real: Kennedy's May 2025 filing prints a Nike sale on
 * 04/04/2225, published as printed on Trevor Brown's decision, Sep 6,
 * 2026. That row belongs in the table and the counts. It must never
 * stretch a time axis: with it, the directory sparklines ran 2025 to
 * 2225 and every trade collapsed into the first pixel.
 *
 * Rule: a trade date later than today is not drawn. The row stays in
 * every table and total; the chart's caption does not need to mention
 * it because the row's own note already says what the filing prints.
 */
export function isChartableDate(isoDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const t = new Date(`${isoDate}T00:00:00`);
  if (isNaN(t.getTime())) return false;
  const cap = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  return t.getTime() <= cap.getTime();
}

/** The rows of a list that a chart may draw. */
export function chartableRows<T extends { date: string | null }>(rows: T[], today: Date = new Date()): T[] {
  return rows.filter((r) => isChartableDate(r.date, today));
}
