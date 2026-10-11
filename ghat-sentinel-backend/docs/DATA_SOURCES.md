# Data sources

All data come from the public Track 2 repository of Bhopal Impact Lab 2026:
<https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/tree/main/track-2-visarjan-ghat-watch>
(see also `docs/DATA_DICTIONARY.md`, copied from that repository).

The CSVs are **downloaded, not committed** (`data/raw/` is git-ignored): the upstream repository shows no data
licence, so the files are fetched by `scripts/download_data.py` rather than redistributed. Retrieval time and SHA-256
are recorded in `data/raw/sources.json` and in the `data_sources` table (`GET /api/v1/metadata`).

| File | Source URL (raw) | Records | Coverage |
|---|---|---|---|
| `bhopal_ghats_2023_2025.csv` | `.../track-2-visarjan-ghat-watch/data/bhopal_ghats_2023_2025.csv` | 1,524 rows, all valid | 2023-2025, Ganesh and Durga, pre/during/after, 7 ghats, 13 parameters |
| `mp_immersion_sites_2023_2025.csv` | `.../data/mp_immersion_sites_2023_2025.csv` | 21,600 rows, all valid (140 flagged duplicates, 879 `needs_check`) | 2023-2025, statewide by MPPCB regional office |
| `cpcb_water_quality_criteria.csv` | `.../data/cpcb_water_quality_criteria.csv` | 19 rows, all valid | CPCB classes A-E, 8 parameters |

Base URL for all three: `https://raw.githubusercontent.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/main/track-2-visarjan-ghat-watch/`.

Verified on 2026-10-11 (UTC): the script downloaded all three files; the Bhopal and statewide files were byte-identical
(SHA-256 `6068f686d2e7...` and `ae6df3c34dec...`) to an independent `git clone`. The criteria file had the same content
as the clone and differed only in line endings (the Windows clone converted them to CRLF).

## Columns actually inspected

- **Bhopal:** `year, festival, site, water_body, phase, parameter, value, unit_assumed, flag, value_as_printed,
  parameter_as_printed, site_as_printed, site_match_confidence, source_page`
- **Statewide:** `year, festival, regional_office, phase, parameter, value, unit_assumed, flag, value_as_printed,
  parameter_as_printed, site_as_printed, needs_check, source_page` (no standard site name; the region is the MPPCB
  regional office)
- **Criteria:** `class, designated_best_use, parameter, limit_type (max|min|range), limit, unit`

## Mapping to the database

Reading ID `bhopal-NNNNN` = CSV data row NNNNN (header excluded); `source_page` is the page in the MPPCB PDF report;
`unit_assumed` -> `unit` (blank pH unit becomes `pH`); `flag` is kept as is; empty `value` stays null. Statewide
duplicates (same office/year/festival/phase/parameter/printed site/printed value, from tables spanning two pages)
are stored with `is_duplicate = true` and excluded from benchmarks.

## Known limitations (from the data dictionary and our checks)

- Units are assumed; the original reports print none.
- The Bhopal file was spot-checked by the curators (six tables); the statewide file was not checked table by table.
- No exact sample dates, no coordinates.
- Bairagarh and Malikhedi have no Durga 2025 table; "Rani Kamlapati ghat / Kamla Park kund" (confidence `medium`) may
  be two places.
- Only 4 metals were tested (chromium, lead, zinc, copper); suspended solids is missing for some seasons.

## Other sources referenced

`app/resources/public_guidance/resources.json` lists the MPPCB reports, CPCB criteria page, a news report on the NGT
ban and a calendar page for the Durga visarjan date. They are exactly the links listed in the Track 2 problem statement;
this backend does not crawl the web or re-check them at request time.
