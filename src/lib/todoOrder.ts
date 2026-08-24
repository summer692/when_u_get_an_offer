import type { MustDo } from "./schema";

const PRIORITY = { high: 0, medium: 1, low: 2 } as const;

/**
 * Use a saved user-defined order when one exists. Legacy/extracted todos
 * without an explicit order retain the automatic deadline/priority sort.
 */
export function sortTodosForDisplay(todos: MustDo[]): MustDo[] {
  const hasManualOrder = todos.some((item) =>
    Number.isFinite(item.display_order),
  );

  if (hasManualOrder) {
    return [...todos].sort(
      (a, b) =>
        (a.display_order ?? Number.MAX_SAFE_INTEGER) -
        (b.display_order ?? Number.MAX_SAFE_INTEGER),
    );
  }

  return [...todos].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const da = new Date(`${a.deadline}T23:59:59`).getTime();
      const db = new Date(`${b.deadline}T23:59:59`).getTime();
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    }
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return PRIORITY[a.priority] - PRIORITY[b.priority];
  });
}
