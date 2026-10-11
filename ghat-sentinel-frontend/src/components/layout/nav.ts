import { BarChart3, BookOpen, ClipboardList, FileText, Gauge, Layers, ListOrdered, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";
export const NAV: { href: string; key: string; icon: LucideIcon }[] = [
  { href: "/", key: "nav.overview", icon: Gauge },
  { href: "/ghats", key: "nav.ghats", icon: Layers },
  { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
  { href: "/prioritization", key: "nav.prioritization", icon: ListOrdered },
  { href: "/intelligence", key: "nav.intelligence", icon: Sparkles },
  { href: "/cases", key: "nav.cases", icon: ClipboardList },
  { href: "/reports", key: "nav.reports", icon: FileText },
  { href: "/citizen", key: "nav.citizen", icon: Users },
  { href: "/methodology", key: "nav.methodology", icon: BookOpen },
  { href: "/settings", key: "nav.settings", icon: Settings },
];
