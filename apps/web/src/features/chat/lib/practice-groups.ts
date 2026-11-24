type DatedItem = { date: string };

const DAY_MS = 86_400_000;
const relativeDay = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function localCalendarDay(date: Date) {
  // Compare calendar dates at UTC midnight so daylight saving cannot skew the count.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

/** Groups an already sorted list by local creation day, preserving its order. */
export function groupPracticeByDay<T extends DatedItem>(
  items: T[],
  now = new Date(),
) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  const today = localCalendarDay(now);
  for (const item of items) {
    const day = localCalendarDay(new Date(item.date));
    const key = String(day);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.items.push(item);
    } else {
      const relative = Number.isNaN(day)
        ? "earlier"
        : relativeDay.format(day - today, "day");
      const label = relative.charAt(0).toUpperCase() + relative.slice(1);
      groups.push({ key, label, items: [item] });
    }
  }
  return groups;
}
