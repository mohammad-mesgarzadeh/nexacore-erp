export function canManageOrganization(
  profile: { role?: string; organization_name?: string } | undefined,
): boolean {
  return Boolean(
    profile?.organization_name &&
      (profile.role === "admin" || profile.role === "manager"),
  );
}
