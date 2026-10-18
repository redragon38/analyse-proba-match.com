import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("premier lancement, multisite, navigation, persistance et isolation Electron", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seo-e2e-"));
  const launch = () =>
    electron.launch({
      args: [".", `--user-data-dir=${dir}`],
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":99" },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Vue d’ensemble", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Votre premier site, votre point de départ"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ajouter un site", exact: true })
      .click();
    await page.getByLabel("Nom du site", { exact: true }).fill("Site de test");
    await page
      .getByLabel("URL du site", { exact: true })
      .fill("https://example.com");
    await page.getByRole("button", { name: "Enregistrer le site" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Aucune synchronisation · aucune statistique estimée"),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/overview.png",
      fullPage: true,
    });
    for (const section of [
      "Search Console",
      "Google Analytics",
      "Performances",
      "Audit SEO",
      "Indexation",
      "Mots-clés",
      "Concurrents",
      "Google Trends",
      "Assistant IA",
      "Rapports",
      "Alertes",
      "Historique",
      "Paramètres",
    ]) {
      await page
        .locator("nav")
        .getByRole("button", { name: section, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "Ajouter un site", exact: true })
      .click();
    await page.getByLabel("Nom du site", { exact: true }).fill("Second site");
    await page
      .getByLabel("URL du site", { exact: true })
      .fill("https://example.org");
    await page.getByRole("button", { name: "Enregistrer le site" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .locator("nav")
      .getByRole("button", { name: "Mots-clés", exact: true })
      .click();
    await page.getByPlaceholder("Ajouter un mot-clé").fill("audit technique");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "audit technique", exact: true }),
    ).toBeVisible();
    const isolation = await app.evaluate(({ BrowserWindow }) => {
      const p = (
        BrowserWindow.getAllWindows()[0].webContents as any
      ).getLastWebPreferences();
      return {
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        sandbox: p.sandbox,
      };
    });
    expect(isolation).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(await page.evaluate(() => typeof (window as any).require)).toBe(
      "undefined",
    );
    const rejected = await page.evaluate(async () => {
      try {
        await (window as any).studio.request({ action: "exec", command: "x" });
        return false;
      } catch {
        return true;
      }
    });
    expect(rejected).toBe(true);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel("Site actif").locator("option")).toHaveCount(
      3,
    );
    await page.getByLabel("Site actif").selectOption({ label: "Second site" });
    await page
      .locator("nav")
      .getByRole("button", { name: "Mots-clés", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "audit technique", exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("export PDF réel puis sauvegarde et restauration SQLite via le parcours desktop", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seo-files-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${join(dir, "profile")}`],
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":99" },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.studio));
    await page.evaluate(async () =>
      window.studio!.request({
        action: "site.save",
        site: {
          name: "Export test",
          url: "https://example.com",
          searchProperty: "",
          analyticsProperty: "",
        },
      }),
    );
    await expect(page.getByLabel("Site actif").locator("option")).toHaveCount(
      2,
    );
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      },
      join(dir, "report.pdf"),
    );
    await page
      .locator("nav")
      .getByRole("button", { name: "Rapports", exact: true })
      .click();
    await page.getByRole("button", { name: /^PDF/ }).click();
    await expect(page.getByRole("status")).toContainText("report.pdf");
    const fs = await import("node:fs");
    expect(
      fs.readFileSync(join(dir, "report.pdf")).subarray(0, 5).toString(),
    ).toBe("%PDF-");
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      },
      join(dir, "backup.sqlite"),
    );
    await page
      .locator("nav")
      .getByRole("button", { name: "Paramètres", exact: true })
      .click();
    await page.getByRole("button", { name: "Créer une sauvegarde" }).click();
    await expect(page.getByRole("status")).toContainText("Sauvegarde créée");
    await page.evaluate(async () =>
      window.studio!.request({
        action: "site.save",
        site: {
          name: "Après sauvegarde",
          url: "https://example.org",
          searchProperty: "",
          analyticsProperty: "",
        },
      }),
    );
    await expect(page.getByLabel("Site actif").locator("option")).toHaveCount(
      3,
    );
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      },
      join(dir, "backup.sqlite"),
    );
    await page
      .getByRole("button", { name: "Restaurer une sauvegarde" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Restauration terminée",
    );
    await expect(page.getByLabel("Site actif").locator("option")).toHaveCount(
      2,
    );
    await expect(page.getByLabel("Site actif")).toContainText("Export test");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
