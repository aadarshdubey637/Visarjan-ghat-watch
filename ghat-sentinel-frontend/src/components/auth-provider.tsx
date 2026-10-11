"use client";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "@/lib/api";
import { TOKEN_KEY, UNAUTH_EVENT, getToken } from "@/lib/api/client";
import { effectiveRole as computeEffective, isStaff, VIEW_AS } from "@/lib/access";
import type { AuthConfig, AuthUser, LoginResponse, Role } from "@/lib/types";

interface AuthState {
  user: AuthUser | null;
  /** True once the stored session (if any) has been checked with the backend. */
  ready: boolean;
  config: AuthConfig | null;
  staff: boolean;
  /** Presenter accounts can preview another role's screens; everyone else sees their own. */
  viewAs: Role | null;
  setViewAs: (r: Role | null) => void;
  effectiveRole: Role | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (b: { name: string; email: string; password: string; role?: "citizen" | "officer" | "worker" }) => Promise<AuthUser>;
  logout: () => void;
}
const Ctx = createContext<AuthState>({
  user: null, ready: false, config: null, staff: false, viewAs: null, setViewAs: () => {}, effectiveRole: null,
  login: async () => { throw new Error("no provider"); }, register: async () => { throw new Error("no provider"); }, logout: () => {},
});
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [viewAs, setViewAsState] = useState<Role | null>(null);
  useEffect(() => { try { const v = window.localStorage.getItem("gs:viewAs") as Role | null; if (v && (VIEW_AS as string[]).includes(v)) setViewAsState(v); } catch { /* ignore */ } }, []);
  const setViewAs = useCallback((r: Role | null) => { setViewAsState(r); try { if (r) window.localStorage.setItem("gs:viewAs", r); else window.localStorage.removeItem("gs:viewAs"); } catch { /* ignore */ } }, []);

  const store = useCallback((r: LoginResponse) => {
    try { window.localStorage.setItem(TOKEN_KEY, r.access_token); } catch { /* storage blocked: session lasts until reload */ }
    qc.clear(); setUser(r.user); return r.user;
  }, [qc]);
  const logout = useCallback(() => {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    qc.clear(); setUser(null); setViewAs(null);
  }, [qc, setViewAs]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let cfg: AuthConfig | null = null;
      try { cfg = await api.getAuthConfig(); } catch { /* backend down: stay logged out */ }
      if (!alive) return;
      setConfig(cfg);
      // With auth disabled the backend treats everyone as a developer; /auth/me reports that principal.
      if (getToken() || cfg?.auth_enabled === false) {
        try { const me = await api.getMe(); if (alive) setUser(me); }
        catch { try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }
      }
      if (alive) setReady(true);
    })();
    const onUnauth = () => logout();
    window.addEventListener(UNAUTH_EVENT, onUnauth);
    return () => { alive = false; window.removeEventListener(UNAUTH_EVENT, onUnauth); };
  }, [logout]);

  const value = useMemo<AuthState>(() => ({
    user, ready, config, staff: isStaff(user?.role), viewAs, setViewAs, effectiveRole: computeEffective(user?.role, viewAs),
    login: async (email, password) => store(await api.login(email, password)),
    register: async (b) => store(await api.registerCitizen(b)),
    logout,
  }), [user, ready, config, viewAs, setViewAs, store, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
