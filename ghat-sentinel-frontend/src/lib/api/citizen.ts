import { request } from "./client";
import type { CitizenGhats, Guide, Lang, Resources } from "../types";
export const getCitizenGhats = (signal?: AbortSignal) => request<CitizenGhats>("/citizen/ghats", { signal });
export const getGuide = (language: Lang, signal?: AbortSignal) => request<Guide>("/citizen/guide", { query: { language }, signal });
export const getResources = (signal?: AbortSignal) => request<Resources>("/citizen/resources", { signal });
