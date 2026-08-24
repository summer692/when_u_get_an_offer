import { describe, expect, it } from "vitest";
import { parseEditableDate } from "./format";

describe("parseEditableDate", () => {
  it("accepts slash, dash, dot, and Chinese date formats", () => {
    expect(parseEditableDate("2026/9/7")).toBe("2026-09-07");
    expect(parseEditableDate("2026-09-07")).toBe("2026-09-07");
    expect(parseEditableDate("2026.09.07")).toBe("2026-09-07");
    expect(parseEditableDate("2026年9月7日")).toBe("2026-09-07");
  });

  it("rejects impossible or malformed dates", () => {
    expect(parseEditableDate("2026/02/29")).toBeNull();
    expect(parseEditableDate("2026/13/01")).toBeNull();
    expect(parseEditableDate("September 7")).toBeNull();
  });

  it("accepts leap day and treats an empty date as unset", () => {
    expect(parseEditableDate("2028/02/29")).toBe("2028-02-29");
    expect(parseEditableDate("  ")).toBeNull();
    expect(parseEditableDate(null)).toBeNull();
  });
});
