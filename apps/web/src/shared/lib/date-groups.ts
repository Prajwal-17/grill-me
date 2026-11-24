/** Labels creation dates in the user's local calendar. */
export function dateGroup(value: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = new Date(value);
  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  return "Earlier";
}
