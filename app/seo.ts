import { load } from "cheerio";
import { randomUUID, createHash } from "node:crypto";
import robotsParser from "robots-parser";
import { fetchPublic, webURL } from "./network";
import type { Page, Issue } from "./contracts";
export function analyze(
  html: string,
  url: string,
  status = 200,
  milliseconds = 0,
  depth = 0,
): Page {
  const $ = load(html);
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") ?? "";
  const h1 = $("h1")
    .map((_, e) => $(e).text().trim())
    .get();
  const h2 = $("h2")
    .map((_, e) => $(e).text().trim())
    .get();
  const canonical = $('link[rel="canonical"]').attr("href") ?? "";
  const robots = $('meta[name="robots"]').attr("content") ?? "";
  const links = [
    ...new Set(
      $("a[href]")
        .map((_, e) => {
          try {
            return webURL(new URL($(e).attr("href")!, url).href).href;
          } catch {
            return "";
          }
        })
        .get()
        .filter(Boolean),
    ),
  ];
  const missingAlt = $("img:not([alt])").length;
  const issues: Issue[] = [];
  const add = (
    category: string,
    severity: Issue["severity"],
    description: string,
    evidence: string,
    recommendation: string,
  ) =>
    issues.push({
      id: randomUUID(),
      category,
      severity,
      url,
      description,
      evidence,
      recommendation,
      source: "Crawler HTML",
      detectedAt: new Date().toISOString(),
      status: "ouvert",
    });
  if (status >= 400)
    add(
      "Exploration",
      "élevé",
      "Erreur HTTP",
      String(status),
      "Rétablir la page ou corriger ses liens entrants.",
    );
  if (!title)
    add(
      "SEO on-page",
      "élevé",
      "Titre manquant",
      "Aucune balise title non vide",
      "Ajouter un titre descriptif et unique.",
    );
  else if (title.length > 60)
    add(
      "SEO on-page",
      "faible",
      "Titre potentiellement tronqué",
      `${title.length} caractères`,
      "Vérifier son affichage dans les résultats.",
    );
  if (!description)
    add(
      "SEO on-page",
      "moyen",
      "Meta description manquante",
      "Aucune description",
      "Rédiger un résumé pertinent.",
    );
  if (h1.length !== 1)
    add(
      "SEO on-page",
      "moyen",
      "Structure H1 à vérifier",
      `${h1.length} H1`,
      "Utiliser un titre principal clair.",
    );
  if (!canonical)
    add(
      "Indexation",
      "faible",
      "Canonique absente",
      "Aucun link rel=canonical",
      "Vérifier si une canonique est utile pour cette page.",
    );
  if (/noindex/i.test(robots))
    add(
      "Indexation",
      "moyen",
      "Directive noindex",
      robots,
      "Vérifier que cette exclusion est intentionnelle.",
    );
  if (missingAlt)
    add(
      "Accessibilité",
      "moyen",
      "Images sans attribut alt",
      `${missingAlt} images`,
      "Ajouter un texte alternatif adapté, vide pour les images décoratives.",
    );
  if (url.startsWith("http:"))
    add(
      "HTTPS",
      "élevé",
      "Page en HTTP",
      url,
      "Activer HTTPS et rediriger HTTP.",
    );
  if (url.startsWith("https:") && $('[src^="http:"]').length)
    add(
      "HTTPS",
      "élevé",
      "Ressources mixtes",
      `${$('[src^="http:"]').length} ressources`,
      "Charger toutes les ressources via HTTPS.",
    );
  if (milliseconds > 2000)
    add(
      "Performances",
      "moyen",
      "Réponse lente",
      `${milliseconds} ms (mesure locale)`,
      "Analyser le serveur et le cache.",
    );
  if (depth > 3)
    add(
      "Maillage",
      "faible",
      "Page profonde",
      `${depth} liens depuis le départ`,
      "Vérifier son accessibilité dans la navigation.",
    );
  $('script[type="application/ld+json"]').each((_, e) => {
    try {
      JSON.parse($(e).text());
    } catch {
      add(
        "Données structurées",
        "moyen",
        "JSON-LD invalide",
        "Erreur de syntaxe JSON",
        "Corriger le JSON-LD puis valider son schéma.",
      );
    }
  });
  return {
    url,
    status,
    title,
    description,
    h1,
    h2,
    canonical,
    robots,
    links,
    missingAlt,
    milliseconds,
    depth,
    issues,
  };
}
export function score(issues: Issue[], pages: number) {
  if (!pages) return null;
  const weight = { élevé: 12, moyen: 5, faible: 2 };
  return Math.max(
    0,
    Math.round(
      100 - issues.reduce((n, i) => n + weight[i.severity], 0) / pages,
    ),
  );
}
export function variation(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}
export class Crawler {
  state = { running: false, paused: false, count: 0, current: "" };
  controller?: AbortController;
  control(command: "pause" | "resume" | "cancel") {
    if (command === "cancel") this.controller?.abort();
    else this.state.paused = command === "pause";
  }
  async run(start: string, maxPages: number, delay: number) {
    if (this.state.running) throw Error("Un crawl est déjà en cours.");
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.state = { running: true, paused: false, count: 0, current: start };
    const origin = webURL(start).origin;
    const pages: Page[] = [];
    const errors: { url: string; error: string }[] = [];
    const seen = new Set<string>();
    const queue = [{ url: webURL(start).href, depth: 0 }];
    const fingerprints = new Map<string, string>();
    let robots;
    const blocked: string[] = [];
    let sitemapURLs: string[] = [];
    let cancelled = false;
    try {
      const robotResult = await fetchPublic(origin + "/robots.txt", { signal });
      if (robotResult.status === 200) {
        robots = robotsParser(origin + "/robots.txt", robotResult.body);
        sitemapURLs = robotResult.body
          .split(/\r?\n/)
          .filter((l) => /^sitemap:/i.test(l))
          .map((l) => l.slice(l.indexOf(":") + 1).trim());
      } else if (robotResult.status !== 404 && robotResult.status !== 410)
        throw Error(
          `robots.txt HTTP ${robotResult.status} : crawl arrêté par précaution.`,
        );
      if (!sitemapURLs.length) sitemapURLs = [origin + "/sitemap.xml"];
      const sitemapPages: string[] = [];
      for (const sitemapURL of sitemapURLs.slice(0, 5)) {
        if (new URL(sitemapURL).origin !== origin) continue;
        try {
          const sm = await fetchPublic(sitemapURL, { signal });
          if (sm.status === 200) {
            const $ = load(sm.body, { xml: true });
            $("url > loc").each((_, e) => {
              try {
                const url = webURL($(e).text());
                if (url.origin === origin) sitemapPages.push(url.href);
              } catch {}
            });
          }
        } catch (e) {
          if (signal.aborted) throw e;
          errors.push({ url: sitemapURL, error: "Sitemap inaccessible." });
        }
      }
      // Seed sitemap pages only after linked traversal; retain source to avoid claiming orphan detection.
      while ((queue.length || sitemapPages.length) && pages.length < maxPages) {
        if (signal.aborted) {
          cancelled = true;
          break;
        }
        while (this.state.paused && !signal.aborted)
          await new Promise((r) => setTimeout(r, 200));
        if (signal.aborted) {
          cancelled = true;
          break;
        }
        const next = queue.shift() ?? { url: sitemapPages.shift()!, depth: 0 };
        if (seen.has(next.url)) continue;
        seen.add(next.url);
        if (seen.size > maxPages * 10) break;
        if (robots?.isAllowed(next.url, "SEOControlStudio") === false) {
          blocked.push(next.url);
          continue;
        }
        this.state.current = next.url;
        try {
          const before = Date.now();
          const response = await fetchPublic(next.url, {
            signal,
            allowedOrigin: origin,
          });
          if (new URL(response.url).origin !== origin) {
            errors.push({
              url: next.url,
              error: "Redirection externe exclue du crawl.",
            });
            continue;
          }
          const page = analyze(
            response.body,
            response.url,
            response.status,
            Date.now() - before,
            next.depth,
          );
          (page as Page & { redirects: string[] }).redirects =
            response.redirects;
          if (response.redirects.length)
            page.issues.push({
              id: randomUUID(),
              category: "Exploration",
              severity: "faible",
              url: next.url,
              description: "Redirection observée",
              evidence: [...response.redirects, response.url].join(" → "),
              recommendation: "Lier directement la destination finale.",
              source: "Crawler HTTP",
              detectedAt: new Date().toISOString(),
              status: "ouvert",
            });
          const $ = load(response.body);
          $("script,style,nav,footer,header").remove();
          const text = $("body").text().replace(/\s+/g, " ").trim();
          const hash = createHash("sha256").update(text).digest("hex");
          if (text.length > 100 && fingerprints.has(hash))
            page.issues.push({
              id: randomUUID(),
              category: "Contenu",
              severity: "moyen",
              url: page.url,
              description: "Contenu textuel identique potentiel",
              evidence: fingerprints.get(hash)!,
              recommendation: "Vérifier les doublons et les canoniques.",
              source: "Empreinte du texte HTML",
              detectedAt: new Date().toISOString(),
              status: "ouvert",
            });
          else fingerprints.set(hash, page.url);
          pages.push(page);
          this.state.count = pages.length;
          for (const link of page.links) {
            const u = new URL(link);
            if (
              u.origin === origin &&
              !u.search &&
              !/\.(pdf|jpg|png|zip|svg|webp|mp4)$/i.test(u.pathname) &&
              !seen.has(link) &&
              queue.length < maxPages * 10
            )
              queue.push({ url: link, depth: next.depth + 1 });
          }
        } catch (e) {
          if (signal.aborted) {
            cancelled = true;
            break;
          }
          errors.push({
            url: next.url,
            error: e instanceof Error ? e.message : "Erreur réseau",
          });
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      const issues = pages.flatMap((p) => p.issues);
      return {
        pages,
        issues,
        score: score(issues, pages.length),
        blocked,
        errors,
        cancelled,
        robotsRespected: true,
        scope:
          "HTML statique ; pas de rendu JavaScript ; paramètres exclus ; profondeur des URLs issues du sitemap inconnue.",
      };
    } finally {
      this.state.running = false;
      this.state.paused = false;
    }
  }
}
