import { it, expect, vi } from "vitest";
import { BatchRunner, auditPlan } from "../app/batch";
import {
  calendarDay,
  metricNumber,
  compareSearchRows,
  crawlSummary,
  googleMetric,
} from "../app/statistics";
import { periods, sync } from "../app/integrations";
const site = {
  id: crypto.randomUUID(),
  name: "Site",
  url: "https://example.com/",
  searchProperty: "",
  analyticsProperty: "",
  createdAt: "",
};
it("prépare tous les audits et explique les prérequis absents sans lancer l’IA", () => {
  const plan = auditPlan(site, 28, 30, 500, false, true);
  expect(plan).toHaveLength(8);
  expect(plan.filter((s) => s.status === "skipped").map((s) => s.id)).toEqual([
    "sync",
    "inspect",
    "realtime",
  ]);
  expect(plan.some((s) => s.input?.action === "ai.ask")).toBe(false);
});
it("continue après une erreur et conserve les résultats partiels et les étapes non exécutées", async () => {
  const runner = new BatchRunner();
  const done = vi.fn();
  const plan = auditPlan(site, 28, 1, 200, false, false);
  const execute = vi.fn(async (input: any) => {
    if (input.action === "crawl") throw Error("panne test");
    return { id: "record", data: {} };
  });
  runner.start(site.id, plan, execute, done);
  expect(() => runner.start(site.id, plan, execute, done)).toThrow("déjà");
  await runner.done;
  expect(runner.state.running).toBe(false);
  expect(runner.state.steps.find((s) => s.id === "crawl")?.status).toBe(
    "failed",
  );
  expect(
    runner.state.steps.find((s) => s.id === "pagespeed-desktop")?.status,
  ).toBe("passed");
  expect(done).toHaveBeenCalledTimes(1);
  expect(runner.snapshot().steps.every((s) => !("input" in s))).toBe(true);
});
it("annule les étapes restantes sans marquer comme réussi un appel non exécuté", async () => {
  const runner = new BatchRunner();
  const execute = vi.fn(async () => {
    runner.cancel();
    return { data: {} };
  });
  runner.start(
    site.id,
    auditPlan(site, 7, 1, 200, false, true),
    execute,
    () => {},
  );
  await runner.done;
  expect(execute).toHaveBeenCalledTimes(1);
  expect(runner.state.steps.some((s) => s.status === "cancelled")).toBe(true);
});
it("signale les collectes partielles au lieu de les valider", async () => {
  const runner = new BatchRunner();
  runner.start(
    site.id,
    [
      {
        id: "sync",
        label: "Google",
        status: "pending",
        input: { action: "sync", siteId: site.id, days: 7 },
      },
    ],
    async () => ({
      data: { search: {}, errors: [{ message: "GA4 indisponible" }] },
    }),
    () => {},
  );
  await runner.done;
  expect(runner.state.steps[0].status).toBe("partial");
});
it("utilise le jour du Pacifique à minuit UTC, y compris changement d’heure", () => {
  expect(calendarDay(new Date("2026-10-18T01:00:00Z"))).toBe("2026-10-17");
  expect(periods(7, new Date("2026-10-18T01:00:00Z")).end).toBe("2026-10-14");
  expect(calendarDay(new Date("2026-03-08T10:00:00Z"))).toBe("2026-03-08");
});
it("ne transforme pas une donnée absente en zéro et retrouve les métriques par nom", () => {
  expect(metricNumber(null)).toBeNull();
  expect(metricNumber(" ")).toBeNull();
  expect(metricNumber(false)).toBeNull();
  expect(metricNumber("NaN")).toBeNull();
  expect(metricNumber("0")).toBe(0);
  expect(
    googleMetric(
      {
        metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
        rows: [{ metricValues: [{ value: "20" }, { value: "7" }] }],
      },
      "activeUsers",
    ),
  ).toBe(7);
});
it("compare les lignes observées sans inventer les valeurs des lignes absentes", () => {
  const rows = compareSearchRows(
    [{ keys: ["a"], clicks: 10, position: 2 }],
    [
      { keys: ["a"], clicks: 20, position: 4 },
      { keys: ["disparue"], clicks: 9, position: 3 },
    ],
  );
  expect(rows[0].clickChange).toBe(-50);
  expect(rows[0].positionDifference).toBe(2);
  expect(rows[1].clickChange).toBeNull();
  expect(rows[1].comparisonState).toBe("not-observed-current");
  expect(rows[1].clicks).toBeUndefined();
});
it("distingue les réponses HTTP, le noindex et les erreurs de collecte", () => {
  const summary = crawlSummary({
    pages: [
      {
        status: 200,
        robots: "noindex",
        milliseconds: 100,
        title: "A",
        description: "D",
      },
      { status: 404, robots: "", milliseconds: 300 },
    ],
    errors: [{}],
    blocked: ["/private"],
  });
  expect(summary.candidates).toBe(0);
  expect(summary.http4xx).toBe(1);
  expect(summary.medianMilliseconds).toBe(200);
  expect(summary.partial).toBe(true);
});
it("conserve GA4 réussi lorsqu’un rapport secondaire échoue et distingue CTR et positions", async () => {
  const auth = {
    request: vi.fn(async (url: string, body: any) => {
      if (url.includes("analyticsdata")) {
        if (body.dimensions[0]?.name === "eventName")
          throw Error("quota événements");
        return {
          metricHeaders: body.metrics,
          rows: [{ metricValues: body.metrics.map(() => ({ value: "1" })) }],
          rowCount: 1,
        };
      }
      return {
        rows: [
          { keys: ["a"], clicks: 10, impressions: 100, ctr: 0.1, position: 3 },
        ],
      };
    }),
  };
  const data = await sync(
    auth as any,
    {
      ...site,
      searchProperty: "sc-domain:example.com",
      analyticsProperty: "123",
    },
    7,
  );
  expect(data.analytics.totals).toBeTruthy();
  expect(data.analytics.events).toBeNull();
  expect(data.errors.some((e: any) => e.source === "GA4 events")).toBe(true);
  expect(data.search.changes.ctrPoints).toBe(0);
  expect(data.search.changes.positionDelta).toBe(0);
});

it("conserve les totaux courants si la période de comparaison Search Console est refusée", async () => {
  const previousEnd = periods(365).previousEnd;
  const auth = {
    request: vi.fn(async (_url: string, body: any) => {
      if (body.endDate === previousEnd) throw Error("Date hors couverture");
      return {
        rows: [
          {
            keys: ["observé"],
            clicks: 12,
            impressions: 100,
            ctr: 0.12,
            position: 3,
          },
        ],
      };
    }),
  };
  const data = await sync(
    auth as any,
    { ...site, searchProperty: "sc-domain:example.com" },
    365,
  );
  expect(data.search.totals.clicks).toBe(12);
  expect(data.search.changes).toBeNull();
  expect(data.search.coverage.previousAvailable).toBe(false);
  expect(data.errors[0].source).toBe("Search Console comparaison");
});
