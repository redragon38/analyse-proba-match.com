export function calendarDay(date: Date, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const v = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}
export function metricNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function googleMetric(report: any, name: string): number | null {
  const index =
    report?.metricHeaders?.findIndex((h: any) => h.name === name) ?? -1;
  return index < 0
    ? null
    : metricNumber(report.rows?.[0]?.metricValues?.[index]?.value);
}
export function delta(current: unknown, previous: unknown) {
  const c = metricNumber(current),
    p = metricNumber(previous);
  return c === null || p === null || p === 0 ? null : ((c - p) / p) * 100;
}
export function compareSearchRows(current: any[], previous: any[]) {
  const now = new Map(current.map((r) => [JSON.stringify(r.keys), r]));
  const old = new Map(previous.map((r) => [JSON.stringify(r.keys), r]));
  return [...new Set([...now.keys(), ...old.keys()])].map((key) => {
    const c = now.get(key),
      p = old.get(key);
    return {
      ...(c ?? { keys: p.keys }),
      previous: p ?? null,
      comparisonState:
        c && p
          ? "matched"
          : c
            ? "not-observed-previous"
            : "not-observed-current",
      clickChange: c && p ? delta(c.clicks, p.clicks) : null,
      positionDifference: c && p ? p.position - c.position : null,
    };
  });
}
export function crawlSummary(data: any) {
  const pages: any[] = data?.pages ?? [];
  const times = pages
    .map((p) => Number(p.milliseconds))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const median = times.length
    ? (times[Math.floor((times.length - 1) / 2)] +
        times[Math.floor(times.length / 2)]) /
      2
    : null;
  return {
    pages: pages.length,
    http2xx: pages.filter((p) => p.status >= 200 && p.status < 300).length,
    http4xx: pages.filter((p) => p.status >= 400 && p.status < 500).length,
    http5xx: pages.filter((p) => p.status >= 500).length,
    redirected: pages.filter(
      (p) =>
        p.redirects?.length ||
        p.issues?.some((i: any) => i.description === "Redirection observée"),
    ).length,
    noindex: pages.filter((p) => /noindex/i.test(p.robots)).length,
    candidates: pages.filter(
      (p) => p.status >= 200 && p.status < 300 && !/noindex/i.test(p.robots),
    ).length,
    missingTitle: pages.filter((p) => !p.title).length,
    missingDescription: pages.filter((p) => !p.description).length,
    missingAlt: pages.reduce((n, p) => n + (p.missingAlt ?? 0), 0),
    blocked: data?.blocked?.length ?? 0,
    networkErrors: data?.errors?.length ?? 0,
    medianMilliseconds: median,
    partial: !!data?.cancelled || !!data?.errors?.length,
  };
}
export const METRIC_LABELS: Record<string, string> = {
  activeUsers: "Utilisateurs actifs",
  totalUsers: "Utilisateurs totaux",
  newUsers: "Nouveaux utilisateurs",
  sessions: "Sessions",
  screenPageViews: "Vues",
  eventCount: "Événements",
  engagedSessions: "Sessions engagées",
  engagementRate: "Taux d’engagement",
  bounceRate: "Taux de rebond",
  keyEvents: "Événements clés",
  averageSessionDuration: "Durée moyenne des sessions (s)",
  userEngagementDuration: "Engagement total (s)",
  screenPageViewsPerSession: "Vues par session",
};
