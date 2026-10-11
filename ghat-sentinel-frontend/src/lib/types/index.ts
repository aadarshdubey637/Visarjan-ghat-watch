export type ComparisonResultKind = "within_criterion" | "outside_criterion" | "insufficient_data" | "not_comparable";
export type PriorityLevel = "high" | "review" | "routine" | "insufficient_data";
export type CaseStatus = "needs_verification" | "under_review" | "action_assigned" | "resolved";
export type Lang = "en" | "hi";
export type WhatsAppLang = "en" | "hi" | "bilingual";
export type ForecastStatus = "experimental_estimate" | "historical_comparison" | "insufficient_data";
export type Festival = "Ganesh" | "Durga";
export type Phase = "pre" | "during" | "after";
export type GenerationMode = "template" | "ai";
export type EvidenceType = "observation" | "calculation" | "guidance" | "resource" | "forecast";
export type CpcbClass = "A" | "B" | "C" | "D" | "E";
export type Role = "officer" | "worker" | "citizen" | "developer" | "demo";

export interface GhatSummary {
  id: string; name: string; water_body: string | null; latitude: number | null; longitude: number | null;
  last_sample_date: string | null; last_sample_year: number | null; first_sample_year: number | null;
  observation_count: number; data_status: "historical" | "no_data"; data_status_note: string;
}
export interface ComparisonResult {
  reading_id: string; criterion_id: string | null; result: ComparisonResultKind; observed_value: number | null;
  unit: string | null; threshold: number | null; comparison_operator: string | null; threshold_upper: number | null;
  sample_date: string | null; source_reference: string | null; reason: string; parameter: string; cpcb_class: CpcbClass;
  sample_period: string; relative_exceedance: number | null;
}
export interface Reading {
  id: string; ghat_id: string; sample_date: string | null; parameter: string; value: number | null; unit: string | null;
  source_file: string; source_record_id: string; sample_year: number; festival: Festival; phase: Phase;
  sample_period: string; flag: string | null; value_as_printed: string | null; source_page: string | null;
  evaluation: ComparisonResult | null;
}
export interface Criterion {
  id: string; parameter: string; intended_use: string; comparison_operator: string; threshold: number | null;
  threshold_upper: number | null; unit: string | null; source_reference: string; cpcb_class: CpcbClass;
}
export interface Factor {
  name: string; label: string; raw_value: number | null; max_points: number; points: number; explanation: string;
}
export interface RankedGhat {
  ghat_id: string; ghat_name: string; priority_level: PriorityLevel; priority_score: number | null; factors: Factor[];
  reasons: string[]; last_sample_date: string | null; last_sample_year: number | null; data_completeness: number | null;
  limitations: string[]; cpcb_class: CpcbClass; evaluated_reading_count: number; outside_reading_ids: string[];
}
export interface RankedResponse {
  items: RankedGhat[]; method: string; cpcb_class: CpcbClass; intended_use: string | null; as_of: string; disclaimer: string;
}
export interface ParameterInfo {
  parameter: string; unit: string | null; observation_count: number; numeric_count: number; missing_count: number;
  censored_count: number; first_year: number | null; last_year: number | null;
}
export interface DataQuality {
  completeness: number | null; numeric_count: number; missing_count: number; censored_count: number;
  seasons_covered: string[]; seasons_missing: string[]; site_match_confidence: string | null; warnings: string[];
}
export interface GhatDetail extends GhatSummary {
  parameters: ParameterInfo[]; cpcb_class: CpcbClass; latest_readings: Reading[]; data_quality: DataQuality; limitations: string[];
}
export interface Paged<T> { items: T[]; total: number; limit: number; offset: number }
export interface ReadingsPage extends Paged<Reading> { limitations: string[] }
export interface TrendPoint {
  reading_id: string; sample_year: number; festival: Festival; phase: Phase; sample_period: string;
  value: number | null; flag: string | null; source_page: string | null;
}
export interface PeriodSummary { sample_year: number; festival: Festival; phase: Phase; n: number; mean: number | null; median: number | null; min: number | null; max: number | null }
export interface TrendSummary {
  festival: Festival; phase: Phase; supported: boolean; observation_count: number; start_year: number | null; end_year: number | null;
  method: string; first_value: number | null; last_value: number | null; change: number | null;
  direction: "increase" | "decrease" | "unchanged" | null; statistically_tested: false; limitations: string[];
}
export interface ParameterTrend {
  parameter: string; unit: string | null; sample_count: number; missing_count: number; censored_count: number;
  start_year: number | null; end_year: number | null; series: TrendPoint[]; period_summary: PeriodSummary[];
  trend_summaries: TrendSummary[]; limitations: string[];
}
export interface TrendsResponse { ghat_id: string; items: ParameterTrend[] }
export interface Overview {
  total_ghats: number; total_readings: number; numeric_readings: number; missing_readings: number; censored_readings: number;
  latest_sample_year: number | null; latest_sample_date: string | null; flagged_readings: number; evaluated_readings: number;
  cpcb_class: CpcbClass; intended_use: string | null; cases_by_status: Record<CaseStatus, number>;
  data_quality_warnings: string[]; statewide_rows: number; generated_at: string;
}
export interface Finding { ghat_id: string; ghat_name: string; reading: Reading }
export interface FindingsPage extends Paged<Finding> { cpcb_class: CpcbClass; intended_use: string | null; note: string }
export interface CriteriaList { items: Criterion[]; classes: Record<string, string>; default_cpcb_class: CpcbClass; note: string }
export interface StatBlock {
  label: string; sample_count: number; excluded_missing: number; excluded_censored: number; excluded_duplicates: number;
  site_count: number | null; median: number | null; mean: number | null; p25: number | null; p75: number | null;
  min: number | null; max: number | null; exceedance_count: number | null; exceedance_rate: number | null; years: number[];
}
export interface Benchmark {
  parameter: string; year: number | null; region: string | null; comparable: boolean; unit: string | null; cpcb_class: CpcbClass;
  criterion_applied: string | null; aggregation_method: string; bhopal: StatBlock | null; statewide: StatBlock | null;
  statewide_excluding_bhopal_office: StatBlock | null; region_stats: StatBlock | null; bhopal_sample_count: number;
  statewide_sample_count: number; missing_data_exclusions: Record<string, number>; source_coverage: Record<string, string[]>;
  warnings: string[]; limitations: string[];
}
export interface OutlookValue { sample_year: number; festival: Festival; phase: Phase; value: number | null; flag: string | null; reading_ids: string[]; n_sites: number | null }
export interface Oct20Outlook {
  forecast_status: ForecastStatus; is_prediction: boolean; target_date: string; ghat_id: string | null; parameter: string;
  prediction: number | null; unit: string | null; method: string | null; historical_sample_count: number;
  date_range_used: [number, number] | null; historical_values: OutlookValue[];
  uncertainty: { method: string; lower: number | null; upper: number | null; std: number | null; note: string } | null;
  assumptions: string[]; limitations: string[];
}
export interface EvidenceItem {
  id: string; type: EvidenceType; text: string; ghat_id: string | null; ghat_name: string | null; parameter: string | null;
  value: number | null; unit: string | null; sample_period: string | null; source_file: string | null;
  source_record_id: string | null; source_page: string | null; source_reference: string | null;
}
interface AiMeta { generated_at: string; generation_mode: GenerationMode; ai_status: string | null }
export interface BriefResponse extends AiMeta { title: string; content: string; language: Lang; evidence: EvidenceItem[]; limitations: string[]; brief_id: string | null }
export interface WhatsAppResponse extends AiMeta { content: string; language: WhatsAppLang; evidence: EvidenceItem[]; limitations: string[]; brief_id: string | null }
export interface AskResponse extends AiMeta { answer: string; language: Lang; evidence: EvidenceItem[]; limitations: string[] }
export interface CitizenGhat {
  ghat_id: string; name: string; water_body: string | null; last_sample_year: number | null; last_sample_date: string | null;
  latest_season: string | null; latest_season_summary: string[]; historical_comparison: string; evaluated_reading_count: number;
  historical_exceedance_rate: number | null; current_conditions: "unknown"; limitations: string[];
}
export interface CitizenGhats { items: CitizenGhat[]; current_conditions_available: false; notice: string }
export interface GuideItem { id: string; title: string; body: string; category: string; approval_status: string; basis: string }
export interface Guide { language: Lang; items: GuideItem[]; notice: string }
export interface ResourceItem {
  id: string; title: string; url: string; issuing_organization: string | null; resource_type: string;
  last_verified: string | null; description: string; verification_note: string;
}
export interface Resources { items: ResourceItem[]; notice: string }
export interface ReviewCase {
  id: string; ghat_id: string; reading_ids: string[]; created_at: string; updated_at: string; priority_level: PriorityLevel | null;
  recommended_action: string; status: CaseStatus; assigned_to: string | null; notes: string; resolution_summary: string | null;
  created_by?: string | null;
}
export interface ReportSection {
  ghat_id: string; ghat_name: string; water_body: string | null; readings: Reading[]; comparisons: ComparisonResult[];
  priority: RankedGhat; exceedance_counts_by_parameter: Record<string, Partial<Record<ComparisonResultKind, number>>>; cases: ReviewCase[];
}
export interface Report {
  title: string; generated_at: string; language: Lang;
  selection: { ghat_ids: string[] | null; start_year: number | null; end_year: number | null; cpcb_class: CpcbClass; intended_use: string | null };
  categories_note: string; criteria: Criterion[]; criteria_selection_note: string; calculations: string[];
  sections: ReportSection[]; historical_context: string[]; outlook: Oct20Outlook | null; ai_explanations: string[]; limitations: string[];
}
export interface Health {
  status: "ok" | "degraded"; timestamp: string; database: "ok" | "error"; data_loaded: boolean; ghats_loaded: number;
  readings_loaded: number; ai_configured: boolean; app: string; env: string;
}
export interface SourceMeta {
  file_name: string; source_url: string | null; retrieved_at: string | null; sha256: string | null; imported_at: string;
  row_count: number; valid_row_count: number; invalid_row_count: number; year_range: [number, number] | null; warnings: string[]; errors: string[];
}
export interface Metadata {
  app: string; version: string; api_prefix: string; docs_url: string; openapi_url: string; total_ghats: number; total_readings: number;
  year_range: [number, number] | null;
  parameters: { parameter: string; unit: string | null; observation_count: number; cpcb_classes_with_limit: string[] }[];
  sources: SourceMeta[]; cpcb_classes: Record<string, string>; default_cpcb_class: CpcbClass; enums: Record<string, string[]>;
  ai_configured: boolean; date_convention: string; limitations: string[];
}

export interface AuthUser { id: string; email: string; name: string; role: Role }
export interface LoginResponse { access_token: string; token_type: "bearer"; expires_in: number; user: AuthUser }
export interface DemoAccount { role: Role; email: string; password: string }
export interface AuthConfig { auth_enabled: boolean; roles: Role[]; demo_accounts: DemoAccount[] }
export interface UserRecord { id: string; email: string; name: string; role: Role; is_active: boolean; created_at: string }
