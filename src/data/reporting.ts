export type ReportFilters = {
  from?: string;
  to?: string;
  status?: string;
  kind?: string;
  account?: number;
};

export function buildReportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "status", "kind", "account"] as const) {
    const value = filters[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}
