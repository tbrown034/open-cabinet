import { describe, expect, it } from "vitest";
import { chartableRows, isChartableDate } from "./chart-dates";
import { buildMonthAxis } from "./monthly-activity";

describe("chartable dates", () => {
  const today = new Date(2026, 8, 6);
  it("keeps today and the past, drops a printed date in the future, and malformed dates", () => {
    expect(isChartableDate("2026-09-06", today)).toBe(true);
    expect(isChartableDate("2025-04-04", today)).toBe(true);
    expect(isChartableDate("2225-04-04", today)).toBe(false);
    expect(isChartableDate("2026-09-07", today)).toBe(false);
    expect(isChartableDate(null, today)).toBe(false);
    expect(isChartableDate("N/A", today)).toBe(false);
  });
  it("filters rows, and the month axis ends at the last real month", () => {
    const rows = [{ date: "2025-04-04" }, { date: "2225-04-04" }, { date: "2026-03-01" }];
    expect(chartableRows(rows, today).map((r) => r.date)).toEqual(["2025-04-04", "2026-03-01"]);
    const axis = buildMonthAxis(rows.map((r) => ({ ...r, type: "Sale" })), "2025-01", today);
    expect(axis[axis.length - 1]).toBe("2026-03");
  });
});
