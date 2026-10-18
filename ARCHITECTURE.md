# Architecture

- `app/main.ts` : cycle de vie Electron, IPC, orchestration, planificateur, dialogues de fichiers.
- `app/preload.cjs` : une seule méthode `studio.request`, jamais les modules Node.
- `app/contracts.ts` : contrats TypeScript et validation Zod de toutes les actions.
- `app/database.ts` : SQLite natif de Node/Electron, migration versionnée, clés étrangères, WAL et index.
- `app/auth.ts` : coffre safeStorage, PKCE, callback loopback, renouvellement et révocation.
- `app/network.ts` : validation d’URL, résolution/pinning DNS, limites de taille, timeouts et retries API.
- `app/seo.ts` : analyse statique HTML et crawler avec pause/reprise/annulation en mémoire.
- `app/lighthouse.ts` : Chromium local avec proxy filtrant chaque destination et tunnel HTTPS.
- `app/integrations.ts` : requêtes Google, fenêtres temporelles et comparaisons.
- `app/reports.ts` : exports PDF, Excel, CSV, JSON, HTML.
- `renderer/` : shell React, 14 sections, thèmes et graphiques Recharts. La subdivision de cette interface en routes chargées à la demande reste à faire.
- `tests/` : tests unitaires et d’intégration ; `tests/e2e/` : vrai processus Electron via Playwright.

## Persistance

Migration 1 : `sites`, `settings`, `records`, `lists`, `migrations`. Le modèle est volontairement typé côté applicatif et générique pour les résultats externes. `records.kind` identifie sync, crawl, inspection, pagespeed, lighthouse, realtime, competitor, trends, ai, alert et report ; chaque résultat contient son site et sa date. Les tables distinctes par service demandées dans le cahier des charges restent une évolution, pas une migration déjà réalisée.

Les suppressions de sites suppriment leur historique par clé étrangère. La restauration ouvre la sauvegarde en lecture seule, vérifie son intégrité et copie les données dans une transaction. Les sauvegardes contiennent tous les enregistrements, même si l’interface charge au maximum les 1 000 plus récents.

## Exécution

Les opérations réseau sont asynchrones hors renderer. L’analyse HTML et SQLite s’exécutent actuellement dans le processus principal : le passage à un worker pour les gros crawls est encore nécessaire. Les requêtes GA4 sont bornées et les tableaux de recherche sont paginés côté UI. Les processus ne survivent pas à la publication de l’environnement cloud ; il faut les redémarrer selon les instructions enregistrées.
