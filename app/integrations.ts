import type { Site } from "./contracts";
import type { GoogleAuth } from "./auth";
import {
  calendarDay,
  compareSearchRows,
  delta,
  metricNumber,
} from "./statistics";
export function periods(days: number, now = new Date()) {
  const end = new Date(calendarDay(now) + "T00:00:00Z");
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
  const listAnalytics = async () => {
    const accounts: any[] = [];
    let pageToken = "";
    let capped = false;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({
        pageSize: "200",
        ...(pageToken ? { pageToken } : {}),
      });
      const data = await auth.request(
        "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?" + q,
      );
      accounts.push(...(data.accountSummaries ?? []));
      pageToken = data.nextPageToken ?? "";
      if (!pageToken) break;
      capped = i === 9;
    }
    return { accountSummaries: accounts, capped };
  };
  const [search, analytics] = await Promise.allSettled([
    auth.request("https://www.googleapis.com/webmasters/v3/sites"),
    listAnalytics(),
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
      "Search Console : heure du Pacifique, données finalisées à J−3 ; requêtes anonymisées et limites API possibles. GA4 : fuseau de la propriété. Les totaux proviennent des agrégats API, jamais de la somme des tableaux.",
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
      const table = async (dimension: string, previous = false) => {
        const rows: any[] = [];
        let capped = false;
        for (let offset = 0; offset < 25000; offset += 5000) {
          const data = await query(
            previous ? period.previousStart : period.start,
            previous ? period.previousEnd : period.end,
            [dimension],
            5000,
            offset,
          );
          rows.push(...(data.rows ?? []));
          if ((data.rows ?? []).length < 5000) break;
          capped = offset === 20000;
        }
        return { rows, capped };
      };
      const [totals, previous, daily] = await Promise.all([
        query(period.start, period.end),
        query(period.previousStart, period.previousEnd),
        query(period.start, period.end, ["date"]),
      ]);
      const queries = await table("query");
      const previousQueries = await table("query", true);
      const pages = await table("page");
      const previousPages = await table("page", true);
      const countries = await table("country");
      const devices = await table("device");
      const current = totals.rows?.[0] ?? null;
      const old = previous.rows?.[0] ?? null;
      result.search = {
        totals: current,
        previous: old,
        daily: (daily.rows ?? []).sort((a: any, b: any) =>
          String(a.keys[0]).localeCompare(b.keys[0]),
        ),
        queries: queries.rows,
        pages: pages.rows,
        countries: countries.rows,
        devices: devices.rows,
        queryComparisons: compareSearchRows(queries.rows, previousQueries.rows),
        pageComparisons: compareSearchRows(pages.rows, previousPages.rows),
        capped: [
          queries,
          previousQueries,
          pages,
          previousPages,
          countries,
          devices,
        ].some((t) => t.capped),
        coverage: {
          queries: queries.rows.length,
          previousQueries: previousQueries.rows.length,
          pages: pages.rows.length,
          previousPages: previousPages.rows.length,
          limitPerTable: 25000,
          anonymousQueriesExcluded: true,
          missingRowsAreNotZero: true,
          aggregationType: totals.responseAggregationType ?? null,
        },
        changes:
          current && old
            ? {
                clicks: delta(current.clicks, old.clicks),
                impressions: delta(current.impressions, old.impressions),
                ctrPoints:
                  metricNumber(current.ctr) !== null &&
                  metricNumber(old.ctr) !== null
                    ? (current.ctr - old.ctr) * 100
                    : null,
                positionDelta:
                  metricNumber(old.position) !== null &&
                  metricNumber(current.position) !== null
                    ? old.position - current.position
                    : null,
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
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${site.analyticsProperty}:runReport`;
    const report = async (
      dimensions: string[],
      metrics: string[],
      previous = false,
    ) => {
      let first: any;
      const rows: any[] = [];
      const limit = 1000;
      let capped = false;
      for (let offset = 0; offset < 10000; offset += limit) {
        const data = await auth.request(endpoint, {
          dateRanges: [
            {
              startDate: previous ? period.previousStart : period.start,
              endDate: previous ? period.previousEnd : period.end,
            },
          ],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
          limit: String(limit),
          offset: String(offset),
          returnPropertyQuota: true,
          ...(dimensions.includes("date")
            ? { orderBys: [{ dimension: { dimensionName: "date" } }] }
            : {}),
        });
        first ??= data;
        rows.push(...(data.rows ?? []));
        if (
          !dimensions.length ||
          (data.rows ?? []).length < limit ||
          rows.length >= Number(data.rowCount ?? Infinity)
        )
          break;
        capped = offset === 9000;
      }
      return {
        ...first,
        rows,
        coverage: {
          receivedRows: rows.length,
          totalRows: first?.rowCount ?? null,
          capped,
        },
        ...(first?.metadata ? { metadata: first.metadata } : {}),
      };
    };
    const base = [
      "activeUsers",
      "sessions",
      "screenPageViews",
      "eventCount",
      "newUsers",
      "totalUsers",
      "engagedSessions",
      "engagementRate",
      "bounceRate",
      "keyEvents",
    ];
    const specs: [string, string[], string[], boolean?][] = [
      ["totals", [], base],
      ["previous", [], base, true],
      [
        "engagement",
        [],
        [
          "averageSessionDuration",
          "userEngagementDuration",
          "screenPageViewsPerSession",
        ],
      ],
      ["daily", ["date"], ["activeUsers", "sessions", "screenPageViews"]],
      [
        "pages",
        ["pagePath"],
        ["screenPageViews", "activeUsers", "userEngagementDuration"],
      ],
      [
        "sources",
        ["sessionSourceMedium"],
        ["sessions", "engagedSessions", "keyEvents"],
      ],
      ["events", ["eventName"], ["eventCount", "keyEvents"]],
      ["devices", ["deviceCategory"], ["sessions", "engagementRate"]],
      ["countries", ["country"], ["sessions", "activeUsers"]],
      [
        "landing",
        ["landingPage"],
        ["sessions", "engagedSessions", "keyEvents"],
      ],
    ];
    const analytics: any = { errors: [] };
    let successes = 0;
    // Bound concurrent API usage and retain reports that succeeded independently.
    for (let i = 0; i < specs.length; i += 2) {
      const group = specs.slice(i, i + 2);
      const outcomes = await Promise.allSettled(
        group.map(([, d, m, p]) => report(d, m, p)),
      );
      outcomes.forEach((o, j) => {
        const key = group[j][0];
        if (o.status === "fulfilled") {
          analytics[key] = o.value;
          successes++;
        } else {
          analytics[key] = null;
          analytics.errors.push({ report: key, message: o.reason.message });
        }
      });
    }
    if (successes) {
      result.analytics = analytics;
      for (const error of analytics.errors)
        result.errors.push({
          source: "GA4 " + error.report,
          message: error.message,
        });
    } else
      result.errors.push({
        source: "GA4",
        message:
          analytics.errors[0]?.message ?? "Aucun rapport GA4 disponible.",
      });
  }
  if (!site.searchProperty && !site.analyticsProperty)
    throw Error(
      "Associez une propriété Search Console ou un identifiant GA4 au site.",
    );
  return result;
}
