import { describe, expect, it } from "vitest";
import {
  applySchoolNameOverride,
  computeInfoGaps,
  enrichCoverage,
  inferDepositFromTuitionPercent,
  inheritDepositDeadline,
  recomputeAcceptDeadline,
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

  it("explicitly_none deposit — guarantees zero deposit-related gaps even when other fields are missing", () => {
    // Negative: when offer affirmatively says no deposit, the resolver
    // must NEVER emit '留位费金额未明确' nor '留位费截止日期未明确', no
    // matter what other fields look like. Pin this so future logic
    // changes can't accidentally start firing deposit gaps on
    // explicitly_none offers.
    const offer = makeOffer({
      coverage: {
        tuition: "absent",
        deposit: "explicitly_none",
        deposit_deadline: "absent",
        term_start: "absent",
        duration: "absent",
        accept_deadline: "absent",
      },
    });
    const gaps = computeInfoGaps(offer);
    for (const g of gaps) {
      expect(g.includes("留位")).toBe(false);
    }
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

  it("does not restore a deposit deadline that the user manually cleared", () => {
    const offer = makeOffer({
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      must_do: [
        {
          action: "缴纳留位费",
          deadline: null,
          deadline_manually_edited: true,
          priority: "high",
        },
      ],
    });
    inheritDepositDeadline(offer);
    expect(offer.must_do![0].deadline).toBeNull();
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

  it("must_do is undefined → no crash", () => {
    // Negative: must not throw on offers without must_do.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
    };
    expect(() => inheritDepositDeadline(offer)).not.toThrow();
  });

  it("must_do is empty array → no crash, no mutation", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "Test",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      must_do: [],
    };
    inheritDepositDeadline(offer);
    expect(offer.must_do).toEqual([]);
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

  it("idempotent — when LLM already gave the canonical name, prose is not swept", () => {
    // Negative: previous === canonical, function should bail early.
    // This guards against "double replacement" if normalize runs twice.
    const offer: ExtractedOffer = {
      school: "Imperial College London",
      school_zh: "帝国理工学院",
      program: "MSc",
      key_dates: [],
      summary: "你获得帝国理工学院的录取，太棒了。",
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("帝国理工学院");
    expect(offer.summary).toBe("你获得帝国理工学院的录取，太棒了。");
  });

  it("empty previous school_zh — prose untouched even though we have a canonical", () => {
    // Negative: previous is empty, so no string-replace target exists.
    // Function should set school_zh but NOT sweep prose blindly.
    const offer: ExtractedOffer = {
      school: "Imperial College London",
      school_zh: "",
      program: "MSc",
      key_dates: [],
      summary: "Some summary that does not mention any Chinese school name.",
    };
    applySchoolNameOverride(offer);
    expect(offer.school_zh).toBe("帝国理工学院");
    expect(offer.summary).toBe(
      "Some summary that does not mention any Chinese school name.",
    );
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

  it("percent > 50 sanity guard — does NOT bind a pass-rate to deposit", () => {
    // Codex flagged: 'resolver could become aggressive, e.g. binding any
    // percent to deposit'. 87.5% is the BSc grade requirement in real
    // Imperial offers; 'deposit' word also appears elsewhere. We must
    // not compute deposit = tuition × 87.5%.
    const offer: ExtractedOffer = {
      school: "Imperial",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 38600, currency: "GBP" } },
      conditions: [
        {
          item: "Bachelor's degree with 87.5% average required for deposit-eligible admission",
          status: "required",
        },
      ],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit).toBeUndefined();
  });

  it("zero percent in a deposit sentence → no compute", () => {
    // Negative: pct must be > 0. Defends against weird edge cases like
    // '0% deposit promotional offer'.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      notes: ["0% deposit required for early acceptance"],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit).toBeUndefined();
  });

  it("'学费减免 10%' (tuition discount, not deposit) → no compute", () => {
    // Negative: '学费' word is present but no deposit keyword in the
    // sentence. Must not misfire as a deposit calculation.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      notes: ["你已获得学费减免 10%"],
    };
    inferDepositFromTuitionPercent(offer);
    expect(offer.fees?.deposit).toBeUndefined();
  });
});

describe("recomputeAcceptDeadline", () => {
  it("Imperial Gemini case: '28 calendar days' from 2022-11-26 = 2022-12-24", () => {
    const offer: ExtractedOffer = {
      school: "Imperial",
      program: "MSc",
      offer_issue_date: "2022-11-26",
      key_dates: [
        { type: "accept_deadline", date: "2022-12-24", label: "" },
      ],
      summary:
        "You must accept this offer within 28 calendar days of the date of this offer.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2022-12-24");
    expect(offer.deadline_calculation?.confidence).toBe("computed");
    expect(offer.deadline_calculation?.computed_date).toBe("2022-12-24");
    expect(offer.deadline_calculation?.offset_value).toBe(28);
  });

  it("Imperial 智谱 wrong-date case: overrides LLM's 12-14 with computed 12-24", () => {
    // Real-world bug. LLM produced 2022-12-14 (off by 10 days).
    const offer: ExtractedOffer = {
      school: "Imperial",
      program: "MSc",
      offer_issue_date: "2022-11-26",
      key_dates: [
        { type: "accept_deadline", date: "2022-12-14", label: "" },
      ],
      must_do: [
        {
          action: "在 28 天内通过 Imperial Gateway 账户接受录取",
          priority: "high",
        },
      ],
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2022-12-24");
    expect(offer.deadline_calculation?.confidence).toBe("computed");
  });

  it("'within 4 weeks' = 28 days", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [],
      summary: "Please reply within 4 weeks of this offer to accept.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.deadline_calculation?.computed_date).toBe("2024-01-29");
    expect(offer.deadline_calculation?.offset_unit).toBe("weeks");
  });

  it("missing offer_issue_date → confidence missing_base, no override", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      summary: "Reply within 28 days of this offer to accept.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-04-01"); // unchanged
    expect(offer.deadline_calculation?.confidence).toBe("missing_base");
    expect(offer.deadline_calculation?.offset_value).toBe(28);
  });

  it("'business days' offset → ambiguous, no override", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [
        { type: "accept_deadline", date: "2024-01-30", label: "" },
      ],
      summary: "Please respond within 14 business days to accept your offer.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-01-30"); // unchanged
    expect(offer.deadline_calculation?.confidence).toBe("ambiguous");
  });

  it("'工作日' offset → ambiguous, no override", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [
        { type: "accept_deadline", date: "2024-01-30", label: "" },
      ],
      summary: "请在 14 个工作日内接受录取。",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-01-30"); // unchanged
    expect(offer.deadline_calculation?.confidence).toBe("ambiguous");
  });

  it("Chinese '28 天内' phrasing", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [],
      summary: "请在 28 天内回复以接受录取。",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.deadline_calculation?.computed_date).toBe("2024-01-29");
  });

  it("hardcoded date with no relative phrase → no compute, no override", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      summary: "Please accept by 1 April 2024.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-04-01"); // unchanged
    expect(offer.deadline_calculation).toBeUndefined();
  });

  it("non-acceptance '28 days' phrase (e.g. visa) is ignored", () => {
    // Negative: don't hijack '28 days' from a sentence about visa,
    // notice period, etc. Only acceptance-related sentences count.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "2024-01-01",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      summary:
        "ATAS clearance application takes 28 working days. Visa processing 28 days. Please accept by 1 April 2024.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-04-01"); // unchanged
  });

  it("invalid offer_issue_date (e.g. 1900) → treated as missing_base", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      offer_issue_date: "1900-01-01",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      summary: "Reply within 28 days of this offer.",
    };
    recomputeAcceptDeadline(offer);
    expect(offer.key_dates[0].date).toBe("2024-04-01"); // unchanged
    expect(offer.deadline_calculation?.confidence).toBe("missing_base");
  });
});

describe("enrichCoverage", () => {
  it("absent + value present → upgrades to rule_detected_but_missing (tuition)", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      coverage: { ...baseCoverage, tuition: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.tuition).toBe("rule_detected_but_missing");
  });

  it("absent deposit + computed amount → upgrades to rule_detected_but_missing", () => {
    // Real-world Imperial pattern: LLM coverage said deposit required_no_amount
    // but didn't fill the structured field; inferDepositFromTuitionPercent
    // filled it. Here we cover the simpler 'absent → rule_detected' case.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { deposit: { amount: 3860, currency: "GBP" } },
      coverage: { ...baseCoverage, deposit: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.deposit).toBe("rule_detected_but_missing");
  });

  it("explicitly_none + amount present → conflict", () => {
    // Genuine contradiction: LLM read "no deposit required" yet a deposit
    // amount made it into fees. User should be alerted.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { deposit: { amount: 1000, currency: "USD" } },
      coverage: { ...baseCoverage, deposit: "explicitly_none" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.deposit).toBe("conflict");
  });

  it("term_start absent + term_start_text filled → rule_detected_but_missing", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      term_start_text: "2024 年秋季",
      coverage: { ...baseCoverage, term_start: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.term_start).toBe("rule_detected_but_missing");
  });

  it("duration absent + duration filled → rule_detected_but_missing", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      duration: "1 年",
      coverage: { ...baseCoverage, duration: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.duration).toBe("rule_detected_but_missing");
  });

  it("accept_deadline absent + key_date present (e.g. recomputed) → rule_detected_but_missing", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      coverage: { ...baseCoverage, accept_deadline: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.accept_deadline).toBe("rule_detected_but_missing");
  });

  it("no coverage object → no-op (legacy offers)", () => {
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
    };
    enrichCoverage(offer);
    expect(offer.coverage).toBeUndefined();
  });

  it("does NOT downgrade an already-stated coverage", () => {
    // Negative: stated_full should stay stated_full even if extracted
    // tuition exists. Only "absent" gets upgraded.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      coverage: { ...baseCoverage, tuition: "stated_full" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.tuition).toBe("stated_full");
  });

  it("info_gaps still suppress correctly when coverage is enriched", () => {
    // Behavioral guarantee: post-enrichment, a tuition that was 'absent'
    // but is now 'rule_detected_but_missing' should NOT trigger the
    // tuition gap. computeInfoGapsFromCoverage's absent-only check
    // continues to work.
    const offer: ExtractedOffer = {
      school: "Test",
      program: "MSc",
      key_dates: [
        { type: "accept_deadline", date: "2024-04-01", label: "" },
      ],
      fees: { tuition: { amount: 50000, currency: "USD" } },
      term_start_text: "2024 秋",
      duration: "1 年",
      coverage: { ...baseCoverage, tuition: "absent" },
    };
    enrichCoverage(offer);
    expect(offer.coverage?.tuition).toBe("rule_detected_but_missing");
    expect(computeInfoGaps(offer)).toEqual([]);
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
