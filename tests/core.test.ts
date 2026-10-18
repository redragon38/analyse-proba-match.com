import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../app/database";
import { analyze, score, variation } from "../app/seo";
import { publicAddress, resolvePublic, webURL, apiJSON } from "../app/network";
import { periods, sync } from "../app/integrations";
import { Request } from "../app/contracts";
import { csvCell, escapeHTML, exportReport } from "../app/reports";
import ExcelJS from "exceljs";
afterEach(() => vi.restoreAllMocks());
describe("SQLite", () => {
  it("migre, conserve les sites après réouverture et supprime leurs données en cascade", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-"));
    try {
      let db = new Store(join(dir, "test.sqlite"));
      const site = db.saveSite({
        name: "Test",
        url: "https://example.com",
        searchProperty: "",
        analyticsProperty: "",
      });
      db.add(site.id, "crawl", { issues: [] });
      db.db
        .prepare("INSERT INTO lists VALUES(?,?,?,?)")
        .run(crypto.randomUUID(), site.id, "keyword", "seo");
      expect(
        db.db.prepare("SELECT count(*) AS n FROM migrations").get()?.n,
      ).toBe(1);
      db.close();
      db = new Store(join(dir, "test.sqlite"));
      expect(db.sites()[0].name).toBe("Test");
      expect(db.records(site.id)).toHaveLength(1);
      db.db.prepare("DELETE FROM sites WHERE id=?").run(site.id);
      expect(db.records()).toHaveLength(0);
      expect(db.lists()).toHaveLength(0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejette une mise à jour de site inexistant", () => {
    const db = new Store(":memory:");
    expect(() =>
      db.saveSite(
        {
          name: "x",
          url: "https://example.com",
          searchProperty: "",
          analyticsProperty: "",
        },
        crypto.randomUUID(),
      ),
    ).toThrow("introuvable");
    db.close();
  });
});
describe("analyse SEO et statistiques", () => {
  it("détecte les vrais problèmes et garde les preuves", () => {
    const page = analyze(
      '<html><head><meta name="robots" content="noindex"></head><body><img src="http://x.test/a"><script type="application/ld+json">bad</script></body></html>',
      "https://example.com",
      500,
      3000,
      5,
    );
    expect(page.issues.map((i) => i.description)).toEqual(
      expect.arrayContaining([
        "Erreur HTTP",
        "Titre manquant",
        "Meta description manquante",
        "Structure H1 à vérifier",
        "Directive noindex",
        "Images sans attribut alt",
        "Ressources mixtes",
        "JSON-LD invalide",
        "Réponse lente",
        "Page profonde",
      ]),
    );
    expect(page.issues.every((i) => i.evidence && i.source && i.url)).toBe(
      true,
    );
    expect(score(page.issues, 1)).toBeLessThan(100);
  });
  it("résout et déduplique les liens, conserve H1 et H2", () => {
    const page = analyze(
      '<title>Test</title><meta name="description" content="Résumé"><link rel="canonical" href="https://example.com"><h1>Titre</h1><h2>Section</h2><a href="/page#x">A</a><a href="/page">B</a><a href="javascript:alert(1)">C</a>',
      "https://example.com",
    );
    expect(page.links).toEqual(["https://example.com/page"]);
    expect(page.h2).toEqual(["Section"]);
    expect(page.issues).toHaveLength(0);
    expect(score([], 1)).toBe(100);
    expect(score([], 0)).toBeNull();
  });
  it("calcule les comparaisons sans inventer une variation depuis zéro", () => {
    expect(variation(70, 100)).toBe(-30);
    expect(variation(20, 0)).toBeNull();
    expect(variation(150, 100)).toBe(50);
  });
  it("calcule deux périodes inclusives sans chevauchement, à J−3", () => {
    expect(periods(7, new Date("2026-01-10T12:00:00Z"))).toEqual({
      start: "2026-01-01",
      end: "2026-01-07",
      previousStart: "2025-12-25",
      previousEnd: "2025-12-31",
    });
  });
});
describe("sécurité réseau et IPC", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "2002:7f00:1::",
  ])("bloque %s", (ip) => expect(publicAddress(ip)).toBe(false));
  it("autorise une adresse publique et rejette les protocoles et credentials", async () => {
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(() => webURL("file:///etc/passwd")).toThrow();
    expect(() => webURL("https://user:pass@example.com")).toThrow();
    expect(() => webURL("https://example.com:1234")).toThrow();
    await expect(resolvePublic("http://127.0.0.1")).rejects.toThrow(
      "interdite",
    );
  });
  it("valide les limites de crawl et les messages inconnus", () => {
    expect(Request.safeParse({ action: "exec", command: "bad" }).success).toBe(
      false,
    );
    expect(
      Request.safeParse({
        action: "crawl",
        siteId: crypto.randomUUID(),
        maxPages: 501,
        delay: 0,
      }).success,
    ).toBe(false);
    expect(
      Request.safeParse({
        action: "ai.ask",
        siteId: crypto.randomUUID(),
        question: "x",
        consent: false,
      }).success,
    ).toBe(false);
  });
  it("ne répète pas les permissions refusées", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(apiJSON("https://example.com")).rejects.toThrow(
      "Accès refusé",
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("réessaie les erreurs transitoires puis réussit", async () => {
    vi.useFakeTimers();
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const pending = apiJSON("https://example.com");
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
describe("intégrations Google avec mocks uniquement", () => {
  it("pagine Search Analytics et conserve les dimensions et les comparaisons", async () => {
    const calls: any[] = [];
    const auth = {
      request: vi.fn(async (_url: string, body: any) => {
        calls.push(body);
        if (body.dimensions[0] === "query")
          return {
            rows:
              body.startRow === 0
                ? Array.from({ length: 5000 }, (_, i) => ({
                    keys: ["q" + i],
                    clicks: 1,
                    impressions: 2,
                    position: 3,
                    ctr: 0.5,
                  }))
                : [],
          };
        return {
          rows: [
            {
              keys: ["2026-01-01"],
              clicks: 10,
              impressions: 100,
              ctr: 0.1,
              position: 2,
            },
          ],
        };
      }),
    };
    const data = await sync(
      auth as any,
      {
        id: "test",
        name: "Test",
        url: "https://example.com",
        createdAt: "",
        searchProperty: "sc-domain:example.com",
        analyticsProperty: "",
      },
      7,
    );
    expect(data.search.queries).toHaveLength(5000);
    expect(calls.some((c) => c.startRow === 5000)).toBe(true);
    expect(data.search.changes.clicks).toBe(0);
    expect(data.errors).toEqual([]);
  });
  it("rend les erreurs explicites sans statistiques inventées", async () => {
    const auth = { request: vi.fn().mockRejectedValue(Error("Accès refusé")) };
    const data = await sync(
      auth as any,
      {
        id: "test",
        name: "Test",
        url: "https://example.com",
        createdAt: "",
        searchProperty: "sc-domain:example.com",
        analyticsProperty: "123",
      },
      7,
    );
    expect(data.search).toBeNull();
    expect(data.analytics).toBeNull();
    expect(data.errors).toHaveLength(2);
  });
});
describe("exports réels", () => {
  it("neutralise HTML et les formules CSV", () => {
    expect(escapeHTML("<script>")).toBe("&lt;script&gt;");
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("génère des fichiers PDF, XLSX, HTML, CSV et JSON lisibles", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reports-"));
    try {
      const site = {
        id: "x",
        name: "Site <test>",
        url: "https://example.com",
        searchProperty: "",
        analyticsProperty: "",
        createdAt: "",
      };
      const records = [
        {
          id: "r",
          siteId: "x",
          kind: "crawl",
          createdAt: new Date().toISOString(),
          data: {
            issues: [
              {
                severity: "élevé",
                category: "SEO",
                url: site.url,
                description: "Titre absent",
                evidence: "Aucun title",
                recommendation: "Ajouter title",
              },
            ],
          },
        },
      ];
      for (const format of ["pdf", "xlsx", "html", "csv", "json"])
        await exportReport(
          join(dir, "report." + format),
          format,
          site,
          records,
        );
      expect(
        readFileSync(join(dir, "report.pdf")).subarray(0, 5).toString(),
      ).toBe("%PDF-");
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(join(dir, "report.xlsx"));
      expect(book.getWorksheet("Problèmes")?.getCell("D2").value).toBe(
        "Titre absent",
      );
      expect(readFileSync(join(dir, "report.html"), "utf8")).toContain(
        "Site &lt;test&gt;",
      );
      expect(
        JSON.parse(readFileSync(join(dir, "report.json"), "utf8")).records,
      ).toHaveLength(1);
      expect(readFileSync(join(dir, "report.csv"), "utf8")).toContain(
        "Titre absent",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
