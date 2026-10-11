# Analytics methodology

## 1. Criteria selection and comparison

- Source: `cpcb_water_quality_criteria.csv` (CPCB classes A-E), loaded into the `criteria` table with a source
  reference per row.
- **The class (intended use) is always explicit.** The project default is **class B, outdoor bathing (organised)**,
  the reasonable start suggested in the problem statement. Override per request with `cpcb_class=A..E`.
- A criterion is applied only when the parameter is listed for that class. Dataset names map to criteria names through
  an explicit table (`BOD` -> `BOD (5 days 20C)`, `Conductivity` -> `Electrical conductivity at 25C`). Class B
  therefore scores **pH, dissolved oxygen and BOD** (total coliform has a limit but no data). Conductivity is only
  comparable under class E. COD, solids, turbidity and the four metals have no CPCB limit in the file.
- Operators: `max` -> `<=`, `min` -> `>=`, `range` -> `between_inclusive` (the file does not say whether range limits
  are inclusive; inclusive is the documented assumption). `<`, `>` and `between_exclusive` are also supported.
- Outcomes: `within_criterion`, `outside_criterion`, `insufficient_data` (no numeric value, including BDL/ND and
  "not sampled"), `not_comparable` (no limit for that parameter/class, or incompatible unit).
- Units are normalised before comparison; the only equivalences are documented ones (pH = dimensionless,
  micromhos/cm = µS/cm). Anything else is `not_comparable`.
- Every result carries `criterion_id`, operator, threshold, unit and `source_reference`. No AI is involved.

## 2. Missing data

`value` is null for blanks, `not sampled`, `*`, `**`, `DRY`, `na` (missing) and `BDL`/`ND` (below detection / not
detected: very low, not zero, not missing). Nothing is zero-filled or interpolated. Completeness = rows with a numeric
value or a BDL/ND flag divided by all rows.

## 3. Trends

Per ghat and parameter the API returns the full series and per-period summaries (n, mean, median, min, max). A trend
summary is produced only for **like-with-like** data: the same festival, phase = "during immersion", earliest vs
latest season, and only when at least two such seasons have numeric values. The result is a descriptive difference
(`first_value`, `last_value`, `change`, `direction`) with `statistically_tested: false`. No significance is ever
claimed (at most 3 seasons exist).

## 4. Review priority (project-defined heuristic)

Score 0-100 over evaluable readings (numeric readings with a limit in the selected class):

| Factor | Points | Definition |
|---|---|---|
| exceedance_rate | 40 | 40 x outside / evaluable |
| severity | 20 | 20 x min(1, worst distance past the limit / the limit) |
| recurrence | 25 | 25 x seasons with an exceedance / seasons with evaluable data |
| staleness | 15 | 15 x min(1, years since latest sample / 3) |

Levels: `high` >= 60, `review` >= 35, `routine` < 35, and `insufficient_data` (score null) when fewer than 6
evaluable readings exist. Every factor's raw value, points and explanation is returned. This is not an official CPCB
index and not a probability of contamination; weights and thresholds are judgement calls documented here and in
`app/services/prioritization.py`. A low score is never evidence of good water quality.

## 5. Statewide benchmarking

`/analytics/benchmark?parameter=...&year=...&region=...&phase=...` pools numeric observations (all phases unless
filtered) and reports n, median, mean, quartiles, min/max, exceedance rate (when a criterion applies), site counts and
exclusions (missing, BDL/ND, duplicates). It refuses to compare (`comparable: false`, blocks null, warnings) when units
differ, either side has fewer than 3 numeric samples, or Bhopal's sampling periods are not covered by the statewide
data. The statewide file's `R.O. Bhopal` office overlaps the Bhopal dataset, so an independent "statewide excluding
R.O. Bhopal" block is provided. The API never says Bhopal is best or worst.

## 6. October 20 outlook

For one ghat and parameter it collects previous **Durga, "during" immersion** values. Outcomes:

- `experimental_estimate`: at least 5 previous seasons for that single ghat -> median of those values, with the
  empirical range and sample SD as uncertainty (not a statistical prediction interval).
- `historical_comparison`: 2-4 seasons (or pooled over ghats) -> past values only, `prediction: null`.
- `insufficient_data`: fewer than 2 seasons.

With the real data only 3 Durga seasons (2023-2025) exist, so no estimate is produced. Historical samples were taken on
unrecorded days of each season, not specifically on 20 October.

## 7. Why historical readings do not prove current conditions

The samples are snapshots from past immersion seasons. Water quality changes with rainfall, lake levels, crowding and
cleaning. Nothing in this API measures today's water, and citizen answers say so explicitly.
