import { request } from "./client";
import type { AuthConfig, AuthUser, LoginResponse, Paged, Role, UserRecord } from "../types";

export const getAuthConfig = (signal?: AbortSignal) => request<AuthConfig>("/auth/config", { signal });
export const login = (email: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: { email, password } });
export const registerCitizen = (b: { name: string; email: string; password: string; role?: "citizen" | "officer" | "worker" }) => request<LoginResponse>("/auth/register", { method: "POST", body: b });
export const getMe = (signal?: AbortSignal) => request<AuthUser>("/auth/me", { signal });

export const listUsers = (p: { role?: Role; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
  request<Paged<UserRecord>>("/users", { query: { limit: 100, ...p }, signal });
export const createUser = (b: { name: string; email: string; password: string; role: Role; phone?: string | null }) => request<UserRecord>("/users", { method: "POST", body: b });
export const patchUser = (id: string, b: { is_active?: boolean; name?: string; phone?: string | null }) => request<UserRecord>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: b });
