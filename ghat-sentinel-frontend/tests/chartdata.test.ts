import { describe, expect, it } from "vitest";
import { buildSeasonRows, linesByPhase } from "@/lib/chartdata";
import type { TrendPoint } from "@/lib/types";

const pt = (year: number, festival: "Ganesh" | "Durga", phase: "pre" | "during" | "after", value: number | null, flag: string | null = null): TrendPoint => ({
  reading_id: `${year}${festival}${phase}`, sample_year: year, festival, phase, sample_period: `${year} ${festival} (${phase})`, value, flag, source_page: "1",
});

describe("season rows", () => {
  const points = [pt(2024, "Durga", "during", 3), pt(2023, "Ganesh", "during", 5), pt(2023, "Durga", "during", null, "BDL")];
  it("orders seasons chronologically", () => {
    expect(buildSeasonRows([{ id: "a", label: "A", points }]).seasons).toEqual(["2023 Ganesh", "2023 Durga", "2024 Durga"]);
  });
  it("keeps missing values as null (a gap), never zero, and records the gap", () => {
    const { rows, gaps } = buildSeasonRows([{ id: "a", label: "A", points }]);
    const durga23 = rows.find((r) => r.season === "2023 Durga")!;
    expect(durga23.a).toBeNull(); expect(durga23.a__flag).toBe("BDL");
    expect(gaps).toEqual([{ line: "A", season: "2023 Durga", period: "2023 Durga (during)", flag: "BDL" }]);
  });
  it("leaves a null where a line has no sample in a season", () => {
    const { rows } = buildSeasonRows([{ id: "a", label: "A", points: [pt(2023, "Ganesh", "during", 1)] }, { id: "b", label: "B", points: [pt(2024, "Durga", "during", 2)] }]);
    expect(rows.find((r) => r.season === "2023 Ganesh")!.b).toBeNull();
    expect(rows.find((r) => r.season === "2024 Durga")!.a).toBeNull();
  });
});

describe("phase lines", () => {
  it("orders pre, during, after", () => {
    const lines = linesByPhase([pt(2023, "Ganesh", "after", 1), pt(2023, "Ganesh", "pre", 2), pt(2023, "Ganesh", "during", 3)]);
    expect(lines.map((l) => l.id)).toEqual(["pre", "during", "after"]);
  });
});
