export const appRoutePaths = {
  dashboard: "/",
  reports: "/reports",
  accounting: "/accounting",
  humanResources: "/hr",
} as const;

const routePages = new Map<string, keyof typeof appRoutePaths>(
  Object.entries(appRoutePaths).map(([page, path]) => [path, page as keyof typeof appRoutePaths]),
);

export function getAppRoutePage(pathname: string): keyof typeof appRoutePaths | null {
  return routePages.get(pathname) ?? null;
}

export function isNavigationItemActive(pathname: string, itemPath: string): boolean {
  return pathname === itemPath;
}
