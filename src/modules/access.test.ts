import { describe, expect, it } from "vitest";
import { canManageOrganization } from "./access";

const profile = (role: string, organization_name = "Analytical Engines") => ({
  role,
  organization_name,
});

describe("organization management access", () => {
  it("allows organization administrators and managers to manage modules", () => {
    expect(canManageOrganization(profile("admin"))).toBe(true);
    expect(canManageOrganization(profile("manager"))).toBe(true);
    expect(canManageOrganization(profile("admin", "New organization"))).toBe(true);
  });

  it("keeps staff and accounts without an organization restricted", () => {
    expect(canManageOrganization(profile("staff"))).toBe(false);
    expect(canManageOrganization(profile("admin", ""))).toBe(false);
    expect(canManageOrganization(undefined)).toBe(false);
  });
});
