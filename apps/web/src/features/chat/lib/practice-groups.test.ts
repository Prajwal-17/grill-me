import { describe, expect, test } from "bun:test";
import { groupPracticeByDay } from "./practice-groups";

describe("home practice date groups", () => {
  test("groups local calendar days, including older dates and year boundaries", () => {
    const now = new Date(2026, 0, 2, 12);
    const items = [
      { id: 1, date: new Date(2026, 0, 2, 10).toISOString() },
      { id: 2, date: new Date(2026, 0, 1, 23).toISOString() },
      { id: 3, date: new Date(2025, 11, 30, 10).toISOString() },
      { id: 4, date: new Date(2025, 11, 30, 8).toISOString() },
      { id: 5, date: new Date(2025, 11, 29, 8).toISOString() },
    ];
    const groups = groupPracticeByDay(items, now);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      [1],
      [2],
      [3, 4],
      [5],
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "3 days ago",
      "4 days ago",
    ]);
  });

  test("counts calendar days even near midnight and across daylight saving changes", () => {
    const now = new Date(2026, 2, 10, 0, 1);
    const items = [
      { date: new Date(2026, 2, 9, 23, 59).toISOString() },
      { date: new Date(2026, 2, 8, 23, 59).toISOString() },
      { date: new Date(2026, 2, 1, 23, 59).toISOString() },
    ];
    expect(groupPracticeByDay(items, now).map((group) => group.label)).toEqual([
      "Yesterday",
      "2 days ago",
      "9 days ago",
    ]);
  });
});
