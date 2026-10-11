import { BarChart3, BookOpen, ClipboardList, FileText, Gauge, Layers, ListOrdered, ShieldCheck, Sparkles, UserCog, Users, type LucideIcon } from "lucide-react";
import type { Role } from "./types";

export const STAFF_ROLES: Role[] = ["officer", "worker", "developer", "demo"];
export const isStaff = (role: Role | null | undefined) => !!role && STAFF_ROLES.includes(role);
export const ROLE_LABEL: Record<Role, string> = { officer: "Municipal officer", worker: "Field worker", citizen: "Community member", developer: "Developer", demo: "Presenter" };
/** Views a presenter account can preview without signing out. */
export const VIEW_AS: Exclude<Role, "developer" | "demo">[] = ["officer", "worker", "citizen"];

type Rule = { prefix: string; roles: Role[] | "public" };
// Most specific first. "/" is handled by the home page itself (landing / dashboard / redirect).
const RULES: Rule[] = [
  { prefix: "/login", roles: "public" },
  { prefix: "/register", roles: "public" },
  { prefix: "/citizen", roles: "public" },
  { prefix: "/settings", roles: ["developer"] },
  { prefix: "/team", roles: ["officer", "developer"] },
  { prefix: "/analytics", roles: ["officer", "developer"] },
  { prefix: "/prioritization", roles: ["officer", "developer"] },
  { prefix: "/intelligence", roles: ["officer", "developer"] },
  { prefix: "/reports", roles: ["officer", "developer"] },
  { prefix: "/methodology", roles: ["officer", "developer"] },
  { prefix: "/ghats", roles: ["officer", "worker", "developer"] },
  { prefix: "/cases", roles: ["officer", "worker", "developer"] },
];

export type Access = "ok" | "login" | "forbidden";
export function accessFor(path: string, role: Role | null): Access {
  if (path === "/") return "ok";
  // The presenter account sees everything an officer sees, except account management and developer status.
  if (role === "demo") { if (path.startsWith("/team") || path.startsWith("/settings")) return "forbidden"; role = "officer"; }
  const rule = RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  if (!rule || rule.roles === "public") return "ok";
  if (!role) return "login";
  return rule.roles.includes(role) ? "ok" : "forbidden";
}
export const isPublicPath = (path: string) => path === "/" || accessFor(path, null) === "ok";
export const homeFor = (role: Role): string => (role === "citizen" ? "/citizen" : role === "worker" ? "/cases" : "/");
/** The role whose experience is shown: a presenter can preview officer, worker and community views. */
export const effectiveRole = (role: Role | null | undefined, viewAs: Role | null): Role | null => (role === "demo" && viewAs ? viewAs : role ?? null);

export interface NavItem { href: string; key: string; icon: LucideIcon; label?: string }
const OVERVIEW: NavItem = { href: "/", key: "nav.overview", icon: Gauge };
const GHATS: NavItem = { href: "/ghats", key: "nav.ghats", icon: Layers };
const CITIZEN: NavItem = { href: "/citizen", key: "nav.citizen", icon: Users };
export function navFor(role: Role): NavItem[] {
  if (role === "demo") return navFor("officer").filter((n) => n.href !== "/team");
  if (role === "citizen") return [CITIZEN];
  if (role === "worker") return [{ href: "/cases", key: "nav.mycases", icon: ClipboardList }, GHATS, CITIZEN];
  const officer: NavItem[] = [
    OVERVIEW, GHATS,
    { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
    { href: "/prioritization", key: "nav.prioritization", icon: ListOrdered },
    { href: "/intelligence", key: "nav.intelligence", icon: Sparkles },
    { href: "/cases", key: "nav.cases", icon: ClipboardList },
    { href: "/reports", key: "nav.reports", icon: FileText },
    { href: "/team", key: "nav.team", icon: UserCog },
    { href: "/methodology", key: "nav.methodology", icon: BookOpen },
    CITIZEN,
  ];
  // Backend/system health is a developer tool, not something officers or citizens need.
  return role === "developer" ? [...officer, { href: "/settings", key: "nav.status", icon: ShieldCheck }] : officer;
}
