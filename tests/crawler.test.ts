import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../app/network", async (original) => ({
  ...(await original<typeof import("../app/network")>()),
  fetchPublic: vi.fn(),
}));
import { fetchPublic } from "../app/network";
import { Crawler } from "../app/seo";
const mocked = vi.mocked(fetchPublic);
const response = (url: string, body: string, status = 200) => ({
  url,
  body,
  status,
  headers: { "content-type": "text/html" },
  redirects: [],
});
beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(async (url) =>
    url.endsWith("/robots.txt")
      ? response(url, "User-agent: *\nDisallow: /private\n")
      : url.endsWith("/sitemap.xml")
        ? response(url, "", 404)
        : response(
            url,
            url.endsWith("/broken")
              ? "<h1>Erreur</h1>"
              : '<title>Accueil</title><h1>Bonjour</h1><a href="/private">Privé</a><a href="/broken">Cassé</a><a href="https://outside.test">Externe</a>',
            url.endsWith("/broken") ? 404 : 200,
          ),
  );
});
it("explore les liens internes, respecte robots et constate les erreurs HTTP", async () => {
  const crawler = new Crawler();
  const result = await crawler.run("https://example.com/", 3, 200);
  expect(result.pages.map((p) => p.url)).toEqual([
    "https://example.com/",
    "https://example.com/broken",
  ]);
  expect(result.blocked).toContain("https://example.com/private");
  expect(result.issues.some((i) => i.description === "Erreur HTTP")).toBe(true);
  expect(mocked.mock.calls.some((c) => c[0] === "https://outside.test")).toBe(
    false,
  );
  expect(crawler.state.running).toBe(false);
});
it("refuse de continuer si robots.txt retourne une panne serveur", async () => {
  mocked.mockResolvedValue(response("https://example.com/robots.txt", "", 503));
  const crawler = new Crawler();
  await expect(crawler.run("https://example.com/", 3, 200)).rejects.toThrow(
    "crawl arrêté",
  );
  expect(crawler.state.running).toBe(false);
});
it("annule un crawl en pause et conserve ses résultats partiels", async () => {
  const crawler = new Crawler();
  mocked.mockImplementation(async (url) => {
    if (url.endsWith("/robots.txt")) {
      crawler.control("pause");
      setTimeout(() => crawler.control("cancel"), 20);
      return response(url, "");
    }
    return response(url, "", 404);
  });
  const result = await crawler.run("https://example.com/", 3, 200);
  expect(result.cancelled).toBe(true);
  expect(result.pages).toHaveLength(0);
  expect(crawler.state.running).toBe(false);
});
it("empêche deux crawls simultanés", async () => {
  const crawler = new Crawler();
  const first = crawler.run("https://example.com/", 1, 200);
  await expect(crawler.run("https://example.com/", 1, 200)).rejects.toThrow(
    "déjà en cours",
  );
  await first;
});
