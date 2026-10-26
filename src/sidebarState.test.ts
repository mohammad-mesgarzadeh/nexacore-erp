import { describe, expect, it } from "vitest";
import { initialSidebarState, reduceSidebarState } from "./sidebarState";

describe("sidebar state", () => {
  it("collapses the desktop sidebar when closed", () => {
    expect(reduceSidebarState(initialSidebarState, { type: "close" }, false)).toEqual({
      collapsed: true,
      mobileOpen: false,
    });
  });

  it("closes the mobile drawer without changing its desktop width", () => {
    const state = { collapsed: false, mobileOpen: true };
    expect(reduceSidebarState(state, { type: "close" }, true)).toEqual({
      collapsed: false,
      mobileOpen: false,
    });
  });

  it("expands the desktop sidebar after it has been collapsed", () => {
    const state = { collapsed: true, mobileOpen: false };
    expect(reduceSidebarState(state, { type: "expand" }, false)).toEqual({
      collapsed: false,
      mobileOpen: false,
    });
  });

  it("closes the mobile drawer after navigation without collapsing desktop", () => {
    const state = { collapsed: false, mobileOpen: true };
    expect(reduceSidebarState(state, { type: "navigate" }, true)).toEqual({
      collapsed: false,
      mobileOpen: false,
    });
  });

  it("closes the mobile drawer when returning to desktop without changing collapse preference", () => {
    const state = { collapsed: true, mobileOpen: true };
    expect(reduceSidebarState(state, { type: "desktop-breakpoint" }, false)).toEqual({
      collapsed: true,
      mobileOpen: false,
    });
  });

  it("restores the full sidebar when entering the mobile breakpoint", () => {
    const state = { collapsed: true, mobileOpen: true };
    expect(reduceSidebarState(state, { type: "mobile-breakpoint" }, true)).toEqual({
      collapsed: false,
      mobileOpen: false,
    });
  });
});
