import { describe, expect, it } from "vitest";
import type { MustDo } from "./schema";
import { sortTodosForDisplay } from "./todoOrder";

const todo = (action: string, extra: Partial<MustDo> = {}): MustDo => ({
  action,
  priority: "medium",
  ...extra,
});

describe("sortTodosForDisplay", () => {
  it("sorts legacy todos by deadline and priority", () => {
    const result = sortTodosForDisplay([
      todo("无日期"),
      todo("较晚", { deadline: "2027-07-31" }),
      todo("较早", { deadline: "2026-09-07" }),
    ]);
    expect(result.map((item) => item.action)).toEqual(["较早", "较晚", "无日期"]);
  });

  it("keeps the user's explicit order even when dates differ", () => {
    const result = sortTodosForDisplay([
      todo("较早", { deadline: "2026-09-07", display_order: 2 }),
      todo("无日期", { display_order: 0 }),
      todo("较晚", { deadline: "2027-07-31", display_order: 1 }),
    ]);
    expect(result.map((item) => item.action)).toEqual(["无日期", "较晚", "较早"]);
  });
});
