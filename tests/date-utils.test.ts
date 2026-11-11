import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  getExpiryBadge,
  getLocalToday,
  getRemainingDays,
  isValidDateStr,
} from "../lib/date-utils";

describe("date-utils", () => {
  it("getLocalToday returns YYYY-MM-DD format", () => {
    const today = getLocalToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidDateStr(today)).toBe(true);
  });

  describe("addDays", () => {
    it("adds days correctly within the same month", () => {
      expect(addDays("2026-11-11", 5)).toBe("2026-11-16");
    });

    it("subtracts days correctly (e.g. yesterday)", () => {
      expect(addDays("2026-11-11", -1)).toBe("2026-11-10");
    });

    it("crosses month and year boundaries", () => {
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
      expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });
  });

  describe("addMonths", () => {
    it("adds regular months", () => {
      expect(addMonths("2026-05-15", 1)).toBe("2026-06-15");
      expect(addMonths("2026-11-11", 1)).toBe("2026-12-11");
      expect(addMonths("2026-11-11", 3)).toBe("2027-02-11");
      expect(addMonths("2026-11-11", 12)).toBe("2027-11-11");
    });

    it("handles month-end alignment on non-leap year (e.g. Jan 31 -> Feb 28)", () => {
      expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
      expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
      expect(addMonths("2026-05-31", 1)).toBe("2026-06-30");
    });

    it("handles month-end alignment on leap year (e.g. 2024-01-31 -> 2024-02-29)", () => {
      expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    });
  });

  describe("getRemainingDays and getExpiryBadge", () => {
    const base = "2026-11-11";

    it("calculates remaining days accurately", () => {
      expect(getRemainingDays("2026-11-11", base)).toBe(0);
      expect(getRemainingDays("2026-11-12", base)).toBe(1);
      expect(getRemainingDays("2026-11-14", base)).toBe(3);
      expect(getRemainingDays("2026-11-18", base)).toBe(7);
      expect(getRemainingDays("2026-11-20", base)).toBe(9);
      expect(getRemainingDays("2026-11-10", base)).toBe(-1);
      expect(getRemainingDays("2026-11-01", base)).toBe(-10);
    });

    it("provides badges according to remaining urgency", () => {
      expect(getExpiryBadge("2026-11-05", base)).toEqual({
        text: "已过期 6 天",
        level: "expired",
        days: -6,
      });

      expect(getExpiryBadge("2026-11-11", base)).toEqual({
        text: "今天到期",
        level: "today",
        days: 0,
      });

      expect(getExpiryBadge("2026-11-13", base)).toEqual({
        text: "还剩 2 天",
        level: "imminent",
        days: 2,
      });

      expect(getExpiryBadge("2026-11-17", base)).toEqual({
        text: "还剩 6 天",
        level: "warning",
        days: 6,
      });

      expect(getExpiryBadge("2026-12-11", base)).toEqual({
        text: "还剩 30 天",
        level: "normal",
        days: 30,
      });
    });
  });
});

