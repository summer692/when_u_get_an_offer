import { describe, expect, it } from "vitest";
import { computeInfoGaps } from "./llm";
import type { Coverage, ExtractedOffer } from "./schema";

/**
 * Eval suite for computeInfoGaps. Each fixture pins an extracted offer
 * (with its coverage map and/or legacy field shape) to the exact list of
 * 需要核实 strings the user should see. Add a new entry whenever you
 * encounter a real-world offer that produces a wrong gap — a failing
 * test prevents the regression.
 */

const baseCoverage: Coverage = {
  tuition: "stated_full",
  deposit: "absent",
  deposit_deadline: "absent",
  term_start: "stated_date",
  duration: "stated",
  accept_deadline: "stated",
};

function makeOffer(overrides: Partial<ExtractedOffer> = {}): ExtractedOffer {
  return {
    school: "Test University",
    program: "Master of Test",
    key_dates: [],
    coverage: baseCoverage,
    ...overrides,
  };
}

describe("computeInfoGaps — coverage-driven (v10+)", () => {
  it("everything stated → no gaps", () => {
    expect(computeInfoGaps(makeOffer())).toEqual([]);
  });

  it("offer never mentions deposit → no deposit gap", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, deposit: "absent" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("offer says 'no deposit required' → no deposit gap", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, deposit: "explicitly_none" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("deposit required but no amount → flag amount", () => {
    const offer = makeOffer({
      coverage: {
        ...baseCoverage,
        deposit: "required_no_amount",
        deposit_deadline: "stated",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([
      "留位费金额未在 offer 中明确。",
    ]);
  });

  it("deposit required, amount given, but no deadline → flag deadline only", () => {
    const offer = makeOffer({
      coverage: {
        ...baseCoverage,
        deposit: "required_with_amount",
        deposit_deadline: "absent",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([
      "留位费截止日期未在 offer 中明确。",
    ]);
  });

  it("annual estimate tuition (Hopkins case) → no tuition gap", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, tuition: "stated_estimate" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("partial tuition (first installment) → no tuition gap", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, tuition: "stated_partial" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("no tuition at all → flag tuition", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, tuition: "absent" },
    });
    expect(computeInfoGaps(offer)).toContain(
      "学费未在 offer 中明确，请到学校官网核对。",
    );
  });

  it("term-only start (Imperial autumn case) → no term-start gap", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, term_start: "stated_term_only" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("Imperial offer pattern: no deposit mention, term-only start, accept deadline given → no gaps", () => {
    const offer = makeOffer({
      coverage: {
        tuition: "stated_full",
        deposit: "absent",
        deposit_deadline: "absent",
        term_start: "stated_date",
        duration: "stated",
        accept_deadline: "stated",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("missing duration → flag duration", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, duration: "absent" },
    });
    expect(computeInfoGaps(offer)).toEqual(["项目时长未在 offer 中明确。"]);
  });

  it("missing accept deadline → flag", () => {
    const offer = makeOffer({
      coverage: { ...baseCoverage, accept_deadline: "absent" },
    });
    expect(computeInfoGaps(offer)).toEqual([
      "接受 offer 截止日期未在 offer 中明确。",
    ]);
  });
});

describe("computeInfoGaps — legacy heuristic path (no coverage)", () => {
  it("no coverage + filled tuition + term_start_text → only flags duration & accept_deadline", () => {
    const offer: ExtractedOffer = {
      school: "Old University",
      program: "Master of Old",
      term_start_text: "2024 年秋季",
      fees: { tuition: { amount: 50000, currency: "USD" } },
      key_dates: [],
      // no coverage — legacy record
    };
    const gaps = computeInfoGaps(offer);
    expect(gaps).toContain("项目时长未在 offer 中明确。");
    expect(gaps).toContain("接受 offer 截止日期未在 offer 中明确。");
    expect(gaps).not.toContain(
      "学费未在 offer 中明确，请到学校官网核对。",
    );
    expect(gaps).not.toContain("入学时间未在 offer 中明确。");
  });

  it("legacy: explicit no-deposit in summary suppresses deposit gap", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      duration: "1 年",
      term_start_text: "2024 秋",
      fees: { tuition: { amount: 100, currency: "USD" } },
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "接受截止" },
      ],
      summary: "录取条件：无需缴纳留位费。",
    };
    expect(computeInfoGaps(offer)).toEqual([]);
  });
});
