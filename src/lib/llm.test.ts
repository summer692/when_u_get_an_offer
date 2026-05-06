import { describe, expect, it } from "vitest";
import {
  applySchoolNameOverride,
  computeInfoGaps,
  inferDepositFromTuitionPercent,
  inheritDepositDeadline,
} from "./llm";
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

  it("deposit required, no deposit deadline, no accept deadline → flag deadline", () => {
    // Only flag when there's no deadline anywhere — when accept_deadline
    // is stated, it usually doubles as the deposit deadline.
    const offer = makeOffer({
      coverage: {
        ...baseCoverage,
        deposit: "required_with_amount",
        deposit_deadline: "absent",
        accept_deadline: "absent",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([
      "留位费截止日期未在 offer 中明确。",
      "接受 offer 截止日期未在 offer 中明确。",
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

  it("Imperial bundled-deadline case: deposit required, accept deadline stated → no separate deposit-deadline gap", () => {
    // Real-world Gemini extraction: offer says "pay 10% deposit to confirm
    // acceptance by 24 Dec" — there's no SEPARATE deposit deadline, the
    // accept deadline serves both. Coverage correctly reports
    // deposit_deadline=absent, but a gap warning here is a false positive.
    const offer = makeOffer({
      fees: { deposit: { amount: 3860, currency: "GBP" } },
      coverage: {
        ...baseCoverage,
        deposit: "required_with_amount",
        deposit_deadline: "absent",
        accept_deadline: "stated",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("LLM misclassifies coverage but the amount is actually extracted → trust extracted data", () => {
    // Real-world 智谱 case: amount £3,860 is correctly in fees.deposit,
    // but coverage.deposit was incorrectly set to "required_no_amount".
    // Cross-validation should suppress the false-positive amount gap.
    const offer = makeOffer({
      fees: { deposit: { amount: 3860, currency: "GBP" } },
      coverage: {
        ...baseCoverage,
        deposit: "required_no_amount",
        deposit_deadline: "absent",
        accept_deadline: "stated",
      },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });

  it("coverage says tuition absent but extracted amount > 0 → no gap", () => {
    const offer = makeOffer({
      fees: { tuition: { amount: 50000, currency: "USD" } },
      coverage: { ...baseCoverage, tuition: "absent" },
    });
    expect(computeInfoGaps(offer)).toEqual([]);
  });
});

describe("inheritDepositDeadline", () => {
  it("deposit task with no deadline inherits accept_deadline", () => {
    const offer: ExtractedOffer = {
      school: "Imperial",
      program: "MSc",
      key_dates: [
        { type: "accept_deadline", date: "2022-12-24", label: "接受截止" },
      ],
      must_do: [
        {
          action: "缴纳 £3860 留位费（学费的 10%）",
          priority: "high",
        },
      ],
    };
    inheritDepositDeadline(offer);
    expect(offer.must_do![0].deadline).toBe("2022-12-24");
  });

  it("deposit task that already has its own deadline is left alone", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      must_do: [
        { action: "缴纳留位费", deadline: "2024-03-15", priority: "high" },
      ],
    };
    inheritDepositDeadline(offer);
    expect(offer.must_do![0].deadline).toBe("2024-03-15");
  });

  it("non-deposit task is left alone even if no deadline", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      must_do: [{ action: "上传成绩单", priority: "medium" }],
    };
    inheritDepositDeadline(offer);
    expect(offer.must_do![0].deadline).toBeUndefined();
  });

  it("no accept_deadline → no inheritance", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      key_dates: [],
      must_do: [{ action: "缴纳留位费", priority: "high" }],
    };
    inheritDepositDeadline(offer);
    expect(offer.must_do![0].deadline).toBeUndefined();
  });
});

describe("applySchoolNameOverride", () => {
  it("Imperial → 帝国理工学院 (real 智谱 misclassification)", () => {
    const offer: ExtractedOffer = {
      school: "Imperial College London",
      school_zh: "伦敦大学学院",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("帝国理工学院");
  });

  it("UCL — verifies the easily-confused pair stays distinct", () => {
    const offer: ExtractedOffer = {
      school: "UCL (University College London)",
      school_zh: "??",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("伦敦大学学院");
  });

  it("school not in lookup → leaves school_zh alone", () => {
    const offer: ExtractedOffer = {
      school: "Some Niche University",
      school_zh: "某冷门大学",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("某冷门大学");
  });

  it("case + whitespace insensitive lookup", () => {
    const offer: ExtractedOffer = {
      school: "  IMPERIAL  College   London ",
      school_zh: "伦敦大学学院",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("帝国理工学院");
  });

  it("strips parenthetical abbreviation suffix — MIT both with and without (MIT)", () => {
    const a: ExtractedOffer = {
      school: "Massachusetts Institute of Technology (MIT)",
      program: "MSc",
      key_dates: [],
    };
    const b: ExtractedOffer = {
      school: "Massachusetts Institute of Technology",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(a);
    applySchoolNameOverride(b);
    expect(a.school_zh).toBe("麻省理工学院");
    expect(b.school_zh).toBe("麻省理工学院");
  });

  it("strips a leading 'The' so 'The University of Hong Kong' hits the same entry as 'University of Hong Kong'", () => {
    const a: ExtractedOffer = {
      school: "The University of Hong Kong",
      program: "MSc",
      key_dates: [],
    };
    const b: ExtractedOffer = {
      school: "University of Hong Kong",
      program: "MSc",
      key_dates: [],
    };
    applySchoolNameOverride(a);
    applySchoolNameOverride(b);
    expect(a.school_zh).toBe("香港大学");
    expect(b.school_zh).toBe("香港大学");
  });

  it("when school_zh is overridden, the wrong name is also replaced in prose fields", () => {
    // Real-world Imperial offer: 智谱 puts the wrong 伦敦大学学院 into school_zh
    // AND threads it through summary + notes + raw_highlights. After
    // override, every mention should be the canonical 帝国理工学院.
    const offer: ExtractedOffer = {
      school: "Imperial College London",
      school_zh: "伦敦大学学院",
      program: "MSc",
      key_dates: [],
      summary:
        "恭喜你获得伦敦大学学院（Imperial College London）的录取！伦敦大学学院在材料科学领域排名靠前。",
      notes: ["伦敦大学学院的录取条件如下"],
      raw_highlights: ["恭喜获得伦敦大学学院 MSc 录取"],
      conditions: [
        {
          item: "提交伦敦大学学院要求的成绩单",
          status: "required",
        },
      ],
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("帝国理工学院");
    expect(offer.summary).not.toContain("伦敦大学学院");
    expect(offer.summary).toContain("帝国理工学院");
    expect(offer.notes![0]).toBe("帝国理工学院的录取条件如下");
    expect(offer.raw_highlights![0]).toBe("恭喜获得帝国理工学院 MSc 录取");
    expect(offer.conditions![0].item).toBe("提交帝国理工学院要求的成绩单");
  });

  it("Hong Kong universities — three distinct entries are all wired up", () => {
    const cases: Array<[string, string]> = [
      ["The University of Hong Kong", "香港大学"],
      ["The Chinese University of Hong Kong", "香港中文大学"],
      [
        "The Hong Kong University of Science and Technology",
        "香港科技大学（HKUST）",
      ],
      ["The Hong Kong Polytechnic University", "香港理工大学"],
      ["City University of Hong Kong", "香港城市大学"],
    ];
    for (const [en, zh] of cases) {
      const offer: ExtractedOffer = {
        school: en,
        program: "MSc",
        key_dates: [],
      };
      applySchoolNameOverride(offer);
      expect(offer.school_zh, en).toBe(zh);
    }
  });
});

describe("inferDepositFromTuitionPercent", () => {
  it("Imperial 10% case: computes deposit from tuition", () => {
    const offer: ExtractedOffer = {
      school: "Imperial College London",
      program: "MSc",
      key_dates: [],
      fees: {
        tuition: { amount: 38600, currency: "GBP" },
      },
      conditions: [
        {
          item: "支付学费的 10% 留位费",
          status: "required",
        },
      ],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit?.amount).toBe(3860);
    expect(offer.fees?.deposit?.currency).toBe("GBP");
    expect(offer.fees?.deposit?.is_estimate).toBe(true);
  });

  it("deposit already extracted → no-op", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: {
        tuition: { amount: 38600, currency: "GBP" },
        deposit: { amount: 5000, currency: "GBP" },
      },
      conditions: [{ item: "10% deposit", status: "required" }],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit?.amount).toBe(5000);
  });

  it("no tuition known → no-op", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      conditions: [{ item: "10% deposit of tuition", status: "required" }],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit).toBeUndefined();
  });

  it("percent unrelated to deposit (e.g. scholarship %) → no-op", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      notes: ["学费减免 20%"],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit).toBeUndefined();
  });

  it("English deposit phrasing", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      raw_highlights: ["10% deposit of your annual tuition is required"],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit?.amount).toBe(5000);
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
