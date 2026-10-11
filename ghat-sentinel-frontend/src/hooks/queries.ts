"use client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import * as api from "@/lib/api";
import type { CaseStatus, CpcbClass, Lang, Role } from "@/lib/types";

/** Municipal data (ghats, analytics, cases…) is only requested for staff accounts; citizens and visitors never trigger it. */
function useStaffEnabled() { return useAuth().staff; }

// ── public ────────────────────────────────────────────────────────────────────────────
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: ({ signal }) => api.getHealth(signal), refetchInterval: 60_000, staleTime: 30_000 });
export const useCitizenGhats = () => useQuery({ queryKey: ["citizen-ghats"], queryFn: ({ signal }) => api.getCitizenGhats(signal) });
export const useGuide = (lang: Lang) => useQuery({ queryKey: ["guide", lang], queryFn: ({ signal }) => api.getGuide(lang, signal) });
export const useResources = () => useQuery({ queryKey: ["resources"], queryFn: ({ signal }) => api.getResources(signal) });

// ── staff only ─────────────────────────────────────────────────────────────────────────
export const useMetadata = () => { const on = useStaffEnabled(); return useQuery({ queryKey: ["metadata"], queryFn: ({ signal }) => api.getMetadata(signal), staleTime: 300_000, enabled: on }); };
export const useGhats = () => { const on = useStaffEnabled(); return useQuery({ queryKey: ["ghats"], queryFn: ({ signal }) => api.listGhats({ limit: 100 }, signal), staleTime: 300_000, enabled: on }); };
export const useRanked = (p: { cpcb_class?: CpcbClass; startYear?: number | null; endYear?: number | null } = {}) => {
  const on = useStaffEnabled(); return useQuery({ queryKey: ["ranked", p], queryFn: ({ signal }) => api.getRanked(p, signal), enabled: on });
};
export const useOverview = (cls?: CpcbClass) => { const on = useStaffEnabled(); return useQuery({ queryKey: ["overview", cls], queryFn: ({ signal }) => api.getOverview(cls, signal), enabled: on }); };
export const useGhat = (id: string, cls?: CpcbClass) => { const on = useStaffEnabled(); return useQuery({ queryKey: ["ghat", id, cls], queryFn: ({ signal }) => api.getGhat(id, cls, signal), enabled: on && !!id }); };
export const useTrends = (id: string | undefined, parameter: string | undefined, startYear?: number | null, endYear?: number | null) => {
  const on = useStaffEnabled();
  return useQuery({ queryKey: ["trends", id, parameter, startYear, endYear], queryFn: ({ signal }) => api.getTrends(id!, { parameter, startYear, endYear }, signal), enabled: on && !!id && !!parameter });
};
export const useReadings = (id: string, p: { parameter?: string; startYear?: number | null; endYear?: number | null; limit: number; offset: number; cpcb_class?: CpcbClass }) => {
  const on = useStaffEnabled();
  return useQuery({ queryKey: ["readings", id, p], queryFn: ({ signal }) => api.getReadings(id, { ...p, evaluate: true }, signal), enabled: on && !!id, placeholderData: (prev) => prev });
};
export const useCases = (p: { status?: CaseStatus; ghat_id?: string; limit?: number; offset?: number } = {}) => {
  const on = useStaffEnabled();
  return useQuery({ queryKey: ["cases", p], queryFn: ({ signal }) => api.listCases(p, signal), staleTime: 10_000, placeholderData: (prev) => prev, enabled: on });
};
export const useCase = (id: string) => { const on = useStaffEnabled(); return useQuery({ queryKey: ["case", id], queryFn: ({ signal }) => api.getCase(id, signal), enabled: on && !!id }); };
export const useOutlook = (p: { ghat_id?: string; parameter?: string; year?: number }) => {
  const on = useStaffEnabled(); return useQuery({ queryKey: ["outlook", p], queryFn: ({ signal }) => api.getOutlook(p, signal), enabled: on });
};
export const useBenchmark = (p: { parameter: string; year?: number | null; region?: string; phase?: string } | null) => {
  const on = useStaffEnabled(); return useQuery({ queryKey: ["benchmark", p], queryFn: ({ signal }) => api.getBenchmark(p!, signal), enabled: on && !!p?.parameter });
};
export const useFindings = (p: { ghat_id?: string; parameter?: string; cpcb_class?: CpcbClass; limit?: number; offset?: number } = {}) => {
  const on = useStaffEnabled(); return useQuery({ queryKey: ["findings", p], queryFn: ({ signal }) => api.getFindings(p, signal), staleTime: 60_000, placeholderData: (prev) => prev, enabled: on });
};
export const useCriteria = (cls?: CpcbClass) => {
  const on = useStaffEnabled();
  return useQuery({ queryKey: ["criteria", cls], queryFn: ({ signal }) => api.getCriteria(cls, signal), staleTime: 300_000, select: (d) => d.items, enabled: on });
};

/** Users for the Team page and the case-assignment dropdown (officers and developers only). */
export const useUsers = (role?: Role) => {
  const { user } = useAuth(); const on = user?.role === "officer" || user?.role === "developer";
  return useQuery({ queryKey: ["users", role], queryFn: ({ signal }) => api.listUsers({ role }, signal), enabled: on, staleTime: 30_000 });
};

/** Parameters that have a CPCB limit under the selected class, from /metadata (not hardcoded). */
export function evaluableParameters(meta: { parameters: { parameter: string; cpcb_classes_with_limit: string[] }[] } | undefined, cls: string = "B") {
  return meta?.parameters.filter((p) => p.cpcb_classes_with_limit.includes(cls)).map((p) => p.parameter) ?? [];
}
