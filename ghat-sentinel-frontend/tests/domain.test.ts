import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS, ASSESSMENT, CASE_STATUSES, OPEN_STATUSES, PRIORITY, compareSeason, criterionText, fmtNum, pct,
  readingValueText, refLinesFromReadings, safeHttpsUrl, sortSeasonLabels,
} from "@/lib/domain";
import type { ComparisonResult, Reading } from "@/lib/types";

const ev = (o: Partial<ComparisonResult>): ComparisonResult => ({
  reading_id: "r", criterion_id: "c", result: "within_criterion", observed_value: 1, unit: "mg/l", threshold: 5,
  comparison_operator: ">=", threshold_upper: null, sample_date: null, source_reference: "ref", reason: "", parameter: "DO",
  cpcb_class: "B", sample_period: "2024 Durga (during)", relative_exceedance: null, ...o,
});

describe("season ordering", () => {
  it("sorts by year, then Ganesh before Durga", () => {
    expect(sortSeasonLabels(["2024 Durga", "2023 Durga", "2024 Ganesh", "2023 Ganesh"])).toEqual(["2023 Ganesh", "2023 Durga", "2024 Ganesh", "2024 Durga"]);
    expect(compareSeason({ sample_year: 2024, festival: "Ganesh" }, { sample_year: 2024, festival: "Durga" })).toBeLessThan(0);
  });
});

describe("missing data is never zero", () => {
  it("shows the flag text for a null value", () => {
    expect(readingValueText({ value: null, unit: "mg/l", flag: "BDL", value_as_printed: "BDL" })).toBe("BDL");
    expect(readingValueText({ value: null, unit: "mg/l", flag: null, value_as_printed: null })).toBe("not sampled");
  });
  it("keeps a real zero as 0 with its unit", () => {
    expect(readingValueText({ value: 0, unit: "mg/l", flag: null, value_as_printed: "0" })).toBe("0 mg/l");
  });
  it("does not repeat the pH unit", () => {
    expect(readingValueText({ value: 7.36, unit: "pH", flag: null, value_as_printed: "7.36" })).toBe("7.36");
  });
  it("formats numbers and percentages, with a dash for null", () => {
    expect(fmtNum(null)).toBe("—"); expect(fmtNum(3)).toBe("3"); expect(fmtNum(3.5)).toBe("3.5"); expect(fmtNum(0.03)).toBe("0.03");
    expect(pct(0.8646, 1)).toBe("86.5%"); expect(pct(null)).toBe("—");
  });
});

describe("criteria text and reference lines (from backend evaluation only)", () => {
  it("renders operators", () => {
    expect(criterionText(ev({ comparison_operator: ">=", threshold: 5 }))).toBe("≥ 5 mg/l");
    expect(criterionText(ev({ comparison_operator: "<=", threshold: 3 }))).toBe("≤ 3 mg/l");
    expect(criterionText(ev({ comparison_operator: "between_inclusive", threshold: 6.5, threshold_upper: 8.5, unit: "pH" }))).toBe("6.5–8.5 pH (inclusive)");
  });
  it("returns null when no criterion applies", () => {
    expect(criterionText(ev({ threshold: null, comparison_operator: null }))).toBeNull();
    expect(criterionText(null)).toBeNull();
  });
  it("draws two lines for a range and none without a criterion", () => {
    const range = refLinesFromReadings([{ evaluation: ev({ comparison_operator: "between_inclusive", threshold: 6.5, threshold_upper: 8.5 }) }] as Reading[]);
    expect(range.map((r) => r.value)).toEqual([6.5, 8.5]);
    expect(refLinesFromReadings([{ evaluation: ev({ threshold: null, comparison_operator: null }) }] as Reading[])).toEqual([]);
    expect(refLinesFromReadings([{ evaluation: null }] as Reading[])).toEqual([]);
  });
});

describe("labels and workflow", () => {
  it("never words within_criterion as safe", () => {
    expect(ASSESSMENT.within_criterion.label.toLowerCase()).not.toContain("safe");
    expect(ASSESSMENT.not_comparable.tone).toBe("neutral");
    expect(PRIORITY.insufficient_data.label.toLowerCase()).not.toContain("low");
  });
  it("mirrors the backend case transitions", () => {
    expect(ALLOWED_TRANSITIONS.needs_verification).toEqual(["under_review"]);
    expect(ALLOWED_TRANSITIONS.resolved).toEqual(["under_review"]);
    expect(new Set(ALLOWED_TRANSITIONS.under_review)).toEqual(new Set(["action_assigned", "resolved", "needs_verification"]));
    expect(CASE_STATUSES).toHaveLength(4); expect(OPEN_STATUSES).not.toContain("resolved");
  });
  it("only allows https links", () => {
    expect(safeHttpsUrl("https://cpcb.gov.in/x")).toContain("https://");
    expect(safeHttpsUrl("http://example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
});
