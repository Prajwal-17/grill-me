import { expect, test } from "bun:test";
import { formatWorkDuration, workDuration } from "./work-duration";

test("completed work stays frozen while active work uses the current time", () => {
  const start = "2026-11-18T00:00:00Z";
  const end = "2026-11-18T00:01:05Z";
  const now = Date.parse("2026-11-18T00:02:00Z");
  expect(workDuration(start, end, false, now)).toBe(65_000);
  expect(workDuration(start, null, true, now)).toBe(120_000);
  expect(workDuration(start, null, false, now)).toBeNull();
  expect(workDuration(null, end, false, now)).toBeNull();
  expect(workDuration("invalid", end, false, now)).toBeNull();
  expect(workDuration(end, start, false, now)).toBe(0);
});

test("work durations stay readable across minute and hour boundaries", () => {
  expect(formatWorkDuration(0)).toBe("0s");
  expect(formatWorkDuration(59_999)).toBe("59s");
  expect(formatWorkDuration(65_000)).toBe("1m 5s");
  expect(formatWorkDuration(3_665_000)).toBe("1h 1m 5s");
});
