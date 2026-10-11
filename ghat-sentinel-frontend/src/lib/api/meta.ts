import { request } from "./client";
import type { CpcbClass, CriteriaList, Health, Metadata } from "../types";
export const getHealth = (signal?: AbortSignal) => request<Health>("/health", { signal });
export const getMetadata = (signal?: AbortSignal) => request<Metadata>("/metadata", { signal });
export const getCriteria = (cpcb_class?: CpcbClass, signal?: AbortSignal) => request<CriteriaList>("/criteria", { query: { cpcb_class }, signal });
