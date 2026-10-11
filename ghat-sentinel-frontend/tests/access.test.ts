import { describe, expect, it } from "vitest";
import { accessFor, effectiveRole, homeFor, navFor } from "@/lib/access";

describe("route access by role", () => {
  it("public pages are open to visitors", () => {
    for (const p of ["/", "/login", "/register", "/citizen"]) expect(accessFor(p, null)).toBe("ok");
  });
  it("sends visitors to sign in for municipal pages", () => {
    for (const p of ["/cases", "/ghats", "/analytics", "/reports", "/team", "/settings"]) expect(accessFor(p, null)).toBe("login");
  });
  it("officers get the municipal console but not developer status", () => {
    for (const p of ["/analytics", "/prioritization", "/intelligence", "/reports", "/team", "/methodology", "/cases", "/cases/case_x", "/ghats/ghat_a"]) expect(accessFor(p, "officer")).toBe("ok");
    expect(accessFor("/settings", "officer")).toBe("forbidden");
  });
  it("workers only get cases and ghat lookup", () => {
    for (const p of ["/cases", "/cases/case_x", "/ghats", "/citizen"]) expect(accessFor(p, "worker")).toBe("ok");
    for (const p of ["/reports", "/intelligence", "/analytics", "/team", "/settings", "/prioritization"]) expect(accessFor(p, "worker")).toBe("forbidden");
  });
  it("community members only get the citizen guide", () => {
    expect(accessFor("/citizen", "citizen")).toBe("ok");
    for (const p of ["/ghats", "/cases", "/reports", "/analytics", "/settings"]) expect(accessFor(p, "citizen")).toBe("forbidden");
  });
  it("only developers see system status", () => {
    expect(accessFor("/settings", "developer")).toBe("ok");
    expect(navFor("developer").some((n) => n.href === "/settings")).toBe(true);
    for (const r of ["officer", "worker", "citizen"] as const) expect(navFor(r).some((n) => n.href === "/settings")).toBe(false);
  });
  it("lands each role on its own home", () => {
    expect(homeFor("officer")).toBe("/"); expect(homeFor("worker")).toBe("/cases"); expect(homeFor("citizen")).toBe("/citizen");
  });
  it("never links to a page the role cannot open", () => {
    for (const r of ["officer", "worker", "citizen", "developer"] as const) for (const n of navFor(r)) expect(accessFor(n.href, r)).toBe("ok");
  });

  it("presenter accounts see every municipal view but not team management or developer status", () => {
    for (const p of ["/", "/ghats", "/analytics", "/prioritization", "/intelligence", "/cases", "/reports", "/methodology", "/citizen"]) expect(accessFor(p, "demo")).toBe("ok");
    for (const p of ["/team", "/settings"]) expect(accessFor(p, "demo")).toBe("forbidden");
    const hrefs = navFor("demo").map((n) => n.href);
    expect(hrefs).toContain("/reports"); expect(hrefs).not.toContain("/team"); expect(hrefs).not.toContain("/settings");
  });
  it("a presenter previewing another role gets that role's restrictions", () => {
    expect(effectiveRole("demo", "worker")).toBe("worker");
    expect(effectiveRole("demo", null)).toBe("demo");
    expect(effectiveRole("officer", "worker")).toBe("officer"); // only presenters can switch views
    expect(accessFor("/reports", effectiveRole("demo", "worker"))).toBe("forbidden");
    expect(accessFor("/ghats", effectiveRole("demo", "citizen"))).toBe("forbidden");
    expect(accessFor("/reports", effectiveRole("demo", "officer"))).toBe("ok");
  });
});
