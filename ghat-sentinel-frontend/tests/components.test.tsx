import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssessmentBadge, GenerationBadge, PriorityBadge } from "@/components/shared/badges";
import { ParameterMatrix, buildMatrix } from "@/components/ghats/parameter-matrix";
import { renderWhatsApp } from "@/components/intelligence/parts";
import { CountUp } from "@/components/shared/count-up";
import type { ComparisonResult, Reading } from "@/lib/types";

const reading = (parameter: string, phase: Reading["phase"], value: number | null, result: ComparisonResult["result"], flag: string | null = null, unit: string | null = "mg/l"): Reading => ({
  id: `${parameter}-${phase}`, ghat_id: "g", sample_date: null, parameter, value, unit, source_file: "bhopal.csv", source_record_id: "7", sample_year: 2025,
  festival: "Ganesh", phase, sample_period: `2025 Ganesh (${phase})`, flag, value_as_printed: flag, source_page: "26",
  evaluation: { reading_id: "x", criterion_id: result === "not_comparable" ? null : "c", result, observed_value: value, unit, threshold: result === "not_comparable" ? null : 5,
    comparison_operator: result === "not_comparable" ? null : ">=", threshold_upper: null, sample_date: null, source_reference: null, reason: `reason ${result}`,
    parameter, cpcb_class: "B", sample_period: "p", relative_exceedance: null },
});

describe("badges carry text, not just colour", () => {
  it("labels every assessment", () => {
    const { unmount } = render(<AssessmentBadge result="outside_criterion" />);
    expect(screen.getByText("Outside criterion")).toBeInTheDocument(); unmount();
    render(<AssessmentBadge result="not_comparable" />);
    expect(screen.getByText("No applicable criterion")).toBeInTheDocument();
  });
  it("never calls insufficient data low risk", () => {
    render(<PriorityBadge level="insufficient_data" />);
    expect(screen.getByText("Insufficient data")).toBeInTheDocument();
  });
  it("tells template text from AI wording", () => {
    const { unmount } = render(<GenerationBadge mode="template" aiStatus="AI is not configured" />);
    expect(screen.getByText("Deterministic template")).toBeInTheDocument(); expect(screen.getByText("AI is not configured")).toBeInTheDocument(); unmount();
    render(<GenerationBadge mode="ai" aiStatus={null} />);
    expect(screen.getByText("AI-worded")).toBeInTheDocument();
  });
});

describe("parameter matrix", () => {
  const rows = [
    reading("Dissolved oxygen", "pre", 6, "within_criterion"), reading("Dissolved oxygen", "during", 0, "outside_criterion"), reading("Dissolved oxygen", "after", null, "insufficient_data", "not sampled"),
    reading("COD", "during", 39.2, "not_comparable"),
  ];
  it("groups by parameter and takes the most severe result", () => {
    const m = buildMatrix(rows);
    expect(m).toHaveLength(2);
    expect(m.find((r) => r.parameter === "Dissolved oxygen")!.worst).toBe("outside_criterion");
    expect(m.find((r) => r.parameter === "COD")!.worst).toBe("not_comparable");
  });
  it("shows flags for missing values and a real zero as 0", () => {
    render(<ParameterMatrix readings={rows} sortBy="parameter" />);
    expect(screen.getAllByText(/not sampled/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^0 mg\/l$/)).toBeInTheDocument();
    expect(screen.getAllByText("No class limit").length).toBeGreaterThan(0);
  });
  it("can sort the worst assessment first", () => {
    render(<ParameterMatrix readings={rows} sortBy="result" />);
    const first = screen.getAllByRole("row")[1];
    expect(first).toHaveTextContent("Dissolved oxygen");
  });
});

describe("WhatsApp rendering is plain text with safe bold", () => {
  it("bolds *x* and never creates HTML from the text", () => {
    const { container } = render(<div>{renderWhatsApp("*Khatlapura ghat* - <img src=x onerror=alert(1)>\nline two")}</div>);
    expect(container.querySelector("strong")?.textContent).toBe("Khatlapura ghat");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("count-up", () => {
  it("lands on the exact value", async () => {
    render(<CountUp value={1524} durationMs={20} />);
    await screen.findByText("1,524");
  });
});
