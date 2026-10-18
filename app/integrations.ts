import type { Site } from "./contracts";
import type { GoogleAuth } from "./auth";
import { variation } from "./seo";
export function periods(days: number, now = new Date()) {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 3);
  const begin = new Date(end);
  begin.setUTCDate(begin.getUTCDate() - days + 1);
  const previousEnd = new Date(begin);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return {
    start: d(begin),
    end: d(end),
    previousStart: d(previousStart),
    previousEnd: d(previousEnd),
  };
}
export async function properties(auth: GoogleAuth) {
  const [search, analytics] = await Promise.allSettled([
    auth.request("https://www.googleapis.com/webmasters/v3/sites"),
    auth.request(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    ),
  ]);
  return {
    search: search.status === "fulfilled" ? search.value : null,
    searchError: search.status === "rejected" ? search.reason.message : null,
    analytics: analytics.status === "fulfilled" ? analytics.value : null,
    analyticsError:
      analytics.status === "rejected" ? analytics.reason.message : null,
  };
}
export async function sync(auth: GoogleAuth, site: Site, days: number) {
  const period = periods(days);
  const result: any = {
    period,
    coverage:
      "Search Console : résultats principaux uniquement, requêtes anonymisées exclues. Dates Search Console en heure du Pacifique ; GA4 selon le fuseau de la propriété. Fin à J−3 pour limiter les données incomplètes.",
    search: null,
    analytics: null,
    errors: [],
  };
  if (site.searchProperty) {
    try {
      const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.searchProperty)}/searchAnalytics/query`;
      const query = (
        startDate: string,
        endDate: string,
        dimensions: string[] = [],
        rowLimit = 1000,
        startRow = 0,
      ) =>
        auth.request(endpoint, {
          startDate,
          endDate,
          dimensions,
          rowLimit,
          startRow,
          dataState: "final",
        });
      const [totals, previous, daily] = await Promise.all([
        query(period.start, period.end),
        query(period.previousStart, period.previousEnd),
        query(period.start, period.end, ["date"]),
      ]);
      const queries: any[] = [];
      let capped = false;
      for (let offset = 0; offset < 25000; offset += 5000) {
        const r = await query(
          period.start,
          period.end,
          ["query"],
          5000,
          offset,
        );
        queries.push(...(r.rows ?? []));
        if ((r.rows ?? []).length < 5000) break;
        if (offset === 20000) capped = true;
      }
      const pages = await query(period.start, period.end, ["page"]);
      const previousPages = await query(
        period.previousStart,
        period.previousEnd,
        ["page"],
      );
      const previousQueries = await query(
        period.previousStart,
        period.previousEnd,
        ["query"],
      );
      const compare = (current: any[], previous: any[]) =>
        current.map((r) => {
          const p = previous.find((p) => p.keys[0] === r.keys[0]);
          return {
            ...r,
            previous: p ?? null,
            clickChange: p ? variation(r.clicks, p.clicks) : null,
            positionDifference: p ? p.position - r.position : null,
          };
        });
      const country = await query(period.start, period.end, ["country"]);
      const device = await query(period.start, period.end, ["device"]);
      const current = totals.rows?.[0] ?? null;
      const old = previous.rows?.[0] ?? null;
      result.search = {
        totals: current,
        previous: old,
        daily: daily.rows ?? [],
        queries,
        queryComparisons: compare(queries, previousQueries.rows ?? []),
        pageComparisons: compare(pages.rows ?? [], previousPages.rows ?? []),
        pages: pages.rows ?? [],
        countries: country.rows ?? [],
        devices: device.rows ?? [],
        capped,
        changes:
          current && old
            ? {
                clicks: variation(current.clicks, old.clicks),
                impressions: variation(current.impressions, old.impressions),
                position: variation(current.position, old.position),
              }
            : null,
      };
    } catch (e) {
      result.errors.push({
        source: "Search Console",
        message: (e as Error).message,
      });
    }
  }
  if (site.analyticsProperty) {
    try {
      const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${site.analyticsProperty}:runReport`;
      const report = (
        dimensions: string[],
        metrics: string[],
        previous = false,
      ) =>
        auth.request(endpoint, {
          dateRanges: [
            {
              startDate: previous ? period.previousStart : period.start,
              endDate: previous ? period.previousEnd : period.end,
            },
          ],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
          limit: "1000",
          returnPropertyQuota: true,
        });
      const [
        totals,
        previous,
        daily,
        pages,
        sources,
        events,
        devices,
        countries,
        landing,
      ] = await Promise.all([
        report(
          [],
          ["activeUsers", "sessions", "screenPageViews", "eventCount"],
        ),
        report(
          [],
          ["activeUsers", "sessions", "screenPageViews", "eventCount"],
          true,
        ),
        report(["date"], ["activeUsers", "sessions"]),
        report(["pagePath"], ["screenPageViews"]),
        report(["sessionSourceMedium"], ["sessions"]),
        report(["eventName"], ["eventCount", "keyEvents"]),
        report(["deviceCategory"], ["sessions"]),
        report(["country"], ["sessions"]),
        report(["landingPage"], ["sessions"]),
      ]);
      result.analytics = {
        totals,
        previous,
        daily,
        pages,
        sources,
        events,
        devices,
        countries,
        landing,
      };
    } catch (e) {
      result.errors.push({ source: "GA4", message: (e as Error).message });
    }
  }
  if (!site.searchProperty && !site.analyticsProperty)
    throw Error(
      "Associez une propriété Search Console ou un identifiant GA4 au site.",
    );
  return result;
}
