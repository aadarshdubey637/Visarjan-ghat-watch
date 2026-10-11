import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: { default: "Ghat Sentinel", template: "%s · Ghat Sentinel" },
  description: "Turn historical water-quality data into transparent environmental insights and actionable field verification.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Ghat Sentinel", description: "Environmental Intelligence. Evidence. Action.", images: ["/og.svg"] },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body className="font-sans antialiased"><Providers><AppShell>{children}</AppShell></Providers></body></html>
  );
}
