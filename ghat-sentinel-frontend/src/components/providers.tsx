"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import type { Lang } from "@/lib/types";
import { translate } from "@/lib/i18n";
import { ApiError } from "@/lib/api/client";
import { AuthProvider } from "@/components/auth-provider";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({ lang: "en", setLang: () => {}, t: (k) => k });
export const useLang = () => useContext(LangCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1 } },
  }));
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => { try { const s = localStorage.getItem("gs:lang"); if (s === "hi" || s === "en") setLangState(s); } catch { /* ignore */ } }, []);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("gs:lang", l); } catch { /* ignore */ } };
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LangCtx.Provider value={{ lang, setLang, t: (k) => translate(lang, k) }}>
          {children}
          <Toaster richColors position="bottom-right" />
        </LangCtx.Provider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
