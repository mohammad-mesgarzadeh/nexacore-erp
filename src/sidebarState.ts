export type SidebarState = {
  collapsed: boolean;
  mobileOpen: boolean;
};

export type SidebarAction =
  | { type: "close" }
  | { type: "expand" }
  | { type: "toggle-collapse" }
  | { type: "open-mobile" }
  | { type: "navigate" }
  | { type: "desktop-breakpoint" }
  | { type: "mobile-breakpoint" };

export const initialSidebarState: SidebarState = {
  collapsed: false,
  mobileOpen: false,
};

export function reduceSidebarState(
  state: SidebarState,
  action: SidebarAction,
  isMobile: boolean,
): SidebarState {
  switch (action.type) {
    case "close":
      return isMobile
        ? { ...state, mobileOpen: false }
        : { collapsed: true, mobileOpen: false };
    case "expand":
      return { ...state, collapsed: false };
    case "toggle-collapse":
      return { ...state, collapsed: !state.collapsed };
    case "open-mobile":
      return { ...state, mobileOpen: true };
    case "navigate":
    case "desktop-breakpoint":
      return { ...state, mobileOpen: false };
    case "mobile-breakpoint":
      return { collapsed: false, mobileOpen: false };
  }
}
