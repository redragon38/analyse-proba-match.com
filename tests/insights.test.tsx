// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  SearchMetrics,
  BatchPanel,
  UpdatePanel,
  GoogleMetrics,
} from "../renderer/Insights";
import type { State, Site } from "../app/contracts";
afterEach(cleanup);
const site: Site = {
  id: "1eabf656-bbc2-4d15-ae29-40e62282377a",
  name: "Site test",
  url: "https://example.com",
  searchProperty: "",
  analyticsProperty: "",
  createdAt: "",
};
const state = {
  sites: [site],
  records: [],
  lists: [],
  connected: false,
  secretStatus: { ai: false, pagespeed: false },
  crawl: { running: false, paused: false, count: 0, current: "" },
  secureStorage: false,
  batch: { running: false, siteId: "", cancelRequested: false, steps: [] },
  updater: {
    status: "idle",
    currentVersion: "0.2.0",
    downloaded: 0,
    canInstall: false,
  },
  settings: {
    googleClientId: "",
    aiEndpoint: "https://api.openai.com/v1/chat/completions",
    aiModel: "test",
    autoStart: false,
    theme: "dark",
    alertThreshold: 30,
    alertsEnabled: true,
    intervalMinutes: 1440,
  },
} satisfies State;
it("lance le bilan avec les limites choisies et ferme sa configuration", async () => {
  const action = vi.fn().mockResolvedValue({ running: true });
  render(
    <BatchPanel
      state={state}
      site={site}
      records={[]}
      days={7}
      onAction={action}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Lancer tous les tests" }),
  );
  fireEvent.change(screen.getByLabelText("Pages du bilan"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByLabelText(/Inclure Lighthouse/));
  fireEvent.click(screen.getByRole("button", { name: "Démarrer le bilan" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(action).toHaveBeenCalledWith(
    "Bilan complet",
    expect.objectContaining({
      action: "audit.all",
      siteId: site.id,
      maxPages: 12,
      days: 7,
      includeLighthouse: false,
    }),
  );
});
it("affiche les échecs et les étapes non exécutées sans les compter comme réussies", () => {
  render(
    <BatchPanel
      state={{
        ...state,
        batch: {
          ...state.batch,
          siteId: site.id,
          steps: [
            {
              id: "a",
              label: "Crawl",
              status: "failed",
              reason: "Réseau inaccessible",
            },
            {
              id: "b",
              label: "Google",
              status: "skipped",
              reason: "Google non connecté",
            },
          ],
        },
      }}
      site={site}
      records={[]}
      days={28}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByText("Échec")).toBeVisible();
  expect(screen.getByText("Non exécuté")).toBeVisible();
  expect(screen.queryByText("Réussi")).not.toBeInTheDocument();
});
it("propose le redémarrage uniquement après téléchargement prêt et vérifié", () => {
  const action = vi.fn();
  const { rerender } = render(
    <UpdatePanel state={state} onAction={action} busy={false} />,
  );
  expect(
    screen.queryByRole("button", { name: "Mettre à jour et redémarrer" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Chercher les mises à jour" }),
  );
  expect(action).toHaveBeenCalledWith("Recherche de mises à jour", {
    action: "update.check",
  });
  rerender(
    <UpdatePanel
      state={{
        ...state,
        updater: { ...state.updater, status: "ready", canInstall: true },
      }}
      onAction={action}
      busy={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Mettre à jour et redémarrer" }),
  );
  expect(action).toHaveBeenCalledWith("Installation de la mise à jour", {
    action: "update.install",
  });
});
it("affiche les pourcentages GA4 avec leurs unités et sans inventer un précédent", () => {
  render(
    <GoogleMetrics
      data={{
        totals: {
          metricHeaders: [{ name: "engagementRate" }, { name: "activeUsers" }],
          rows: [{ metricValues: [{ value: ".75" }, { value: "19" }] }],
        },
      }}
    />,
  );
  expect(screen.getByText("75 %")).toBeVisible();
  expect(screen.getByText("19")).toBeVisible();
  expect(screen.getAllByText("Comparaison indisponible")).toHaveLength(2);
});

it("affiche le CTR Search Console en pourcentage et non comme une fraction brute", () => {
  render(
    <SearchMetrics
      totals={{ clicks: 10, impressions: 100, ctr: 0.1, position: 2.5 }}
    />,
  );
  expect(screen.getByText("10 %")).toBeVisible();
  expect(screen.getByText("2,5")).toBeVisible();
});
