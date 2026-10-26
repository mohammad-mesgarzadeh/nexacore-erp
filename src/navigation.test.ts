import { describe, expect, it } from "vitest";
import { appRoutePaths, getAppRoutePage, isNavigationItemActive } from "./navigation";

const modulePaths = ["/", "/sales", "/customers", "/inventory", "/products", "/procurement", "/suppliers", "/manage/organization", "/accounting", "/hr", "/reports", "/settings"];

describe("sidebar active route selection", () => {
  it("selects Products without selecting Inventory", () => {
    expect(modulePaths.filter((path) => isNavigationItemActive("/products", path))).toEqual(["/products"]);
  });

  it("selects Inventory without selecting Products", () => {
    expect(modulePaths.filter((path) => isNavigationItemActive("/inventory", path))).toEqual(["/inventory"]);
  });

  it("keeps exact active routes correct through direct loads and browser history navigation", () => {
    const routeSnapshots = ["/products", "/inventory", "/products", "/sales", "/inventory"];
    const activeBySnapshot = routeSnapshots.map((pathname) =>
      modulePaths.filter((path) => isNavigationItemActive(pathname, path)),
    );

    expect(activeBySnapshot).toEqual([
      ["/products"],
      ["/inventory"],
      ["/products"],
      ["/sales"],
      ["/inventory"],
    ]);
  });

  it("does not treat nested or similarly prefixed routes as a different sidebar module", () => {
    expect(isNavigationItemActive("/products/42", "/products")).toBe(false);
    expect(isNavigationItemActive("/inventory-adjustments", "/inventory")).toBe(false);
  });

  it("resolves Reports and Dashboard to separate pages and active navigation items", () => {
    expect(getAppRoutePage(appRoutePaths.reports)).toBe("reports");
    expect(getAppRoutePage(appRoutePaths.dashboard)).toBe("dashboard");
    expect(modulePaths.filter((path) => isNavigationItemActive(appRoutePaths.reports, path))).toEqual([appRoutePaths.reports]);
    expect(modulePaths.filter((path) => isNavigationItemActive(appRoutePaths.dashboard, path))).toEqual([appRoutePaths.dashboard]);
  });

  it("preserves distinct route selections during direct navigation and browser history changes", () => {
    const snapshots = [appRoutePaths.reports, appRoutePaths.dashboard, appRoutePaths.reports];
    expect(snapshots.map(getAppRoutePage)).toEqual(["reports", "dashboard", "reports"]);
  });
});
