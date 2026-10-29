const listeners = new Set<(tables: string[]) => void>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
export function changed(table = "*") {
  pending.add(table);
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    const tables = [...pending];
    pending.clear();
    for (const listener of listeners) listener(tables);
  }, 150);
  timer.unref();
}
export function onDatabaseChange(listener: (tables: string[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
