import React, { useState } from "react";
import type { State, Site, Input } from "../app/contracts";
import {
  crawlSummary,
  googleMetric,
  METRIC_LABELS,
  metricNumber,
  delta,
} from "../app/statistics";
const n = (v: unknown) => {
  const num = metricNumber(v);
  return num === null
    ? "—"
    : num.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
};
export function metricValue(name: string, value: unknown) {
  const num = metricNumber(value);
  return num === null ? "—" : /Rate$/.test(name) ? n(num * 100) + " %" : n(num);
}
export function GoogleMetrics({ data }: { data: any }) {
  return (
    <>
      <div className="metrics">
        {(data?.totals?.metricHeaders ?? []).map((h: any) => {
          const value = googleMetric(data.totals, h.name);
          const previous = googleMetric(data.previous, h.name);
          const rate = /Rate$/.test(h.name);
          const difference =
            rate && value !== null && previous !== null
              ? (value - previous) * 100
              : delta(value, previous);
          return (
            <div className="metric" key={h.name}>
              <span>{METRIC_LABELS[h.name] ?? h.name}</span>
              <strong>{metricValue(h.name, value)}</strong>
              <small>
                {difference === null
                  ? "Comparaison indisponible"
                  : `${difference > 0 ? "+" : ""}${n(difference)} ${rate ? "points" : "%"} vs période précédente`}
              </small>
            </div>
          );
        })}
      </div>
      <div className="metrics">
        {(data?.engagement?.metricHeaders ?? []).map((h: any) => (
          <div className="metric" key={h.name}>
            <span>{METRIC_LABELS[h.name] ?? h.name}</span>
            <strong>
              {metricValue(h.name, googleMetric(data.engagement, h.name))}
            </strong>
          </div>
        ))}
      </div>
      {data?.errors?.map((e: any) => (
        <p className="notice error" key={e.report}>
          {e.report} : {e.message}
        </p>
      ))}
    </>
  );
}
export function CrawlMetrics({ data }: { data: any }) {
  const s = crawlSummary(data);
  return (
    <>
      <div className="metrics">
        {[
          ["HTTP 2xx", s.http2xx],
          ["Erreurs 4xx", s.http4xx],
          ["Erreurs 5xx", s.http5xx],
          ["Pages redirigées", s.redirected],
          ["Pages noindex", s.noindex],
          ["Candidates indexables*", s.candidates],
          ["Titres manquants", s.missingTitle],
          ["Descriptions manquantes", s.missingDescription],
          ["Images sans alt", s.missingAlt],
          ["Erreurs de collecte", s.networkErrors],
          ["Pages bloquées", s.blocked],
          ["Récupération HTML médiane (ms)", s.medianMilliseconds],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{n(value)}</strong>
          </div>
        ))}
      </div>
      <p className="muted">
        * HTTP 2xx sans noindex observé : aucune confirmation d’indexation
        Google. Temps mesuré sur cet ordinateur, sans rendu JavaScript.{" "}
        {s.partial
          ? "Résultats partiels : consultez les erreurs de collecte."
          : ""}
      </p>
    </>
  );
}
export function SpeedMetrics({ data }: { data: any }) {
  const audits = data?.lab?.audits ?? {};
  const fields = data?.field?.metrics;
  const originFields = data?.originField?.metrics;
  const inp =
    fields?.INTERACTION_TO_NEXT_PAINT ??
    originFields?.INTERACTION_TO_NEXT_PAINT;
  return (
    <>
      <h3>Mesures de laboratoire</h3>
      <div className="metrics">
        {[
          ["LCP (s)", "largest-contentful-paint", 1000],
          ["CLS", "cumulative-layout-shift", 1],
          ["FCP (s)", "first-contentful-paint", 1000],
          ["TBT (ms)", "total-blocking-time", 1],
          ["Speed Index (s)", "speed-index", 1000],
        ].map(([label, id, divisor]) => {
          const value = metricNumber(audits[String(id)]?.numericValue);
          return (
            <div className="metric" key={id}>
              <span>{label}</span>
              <strong>
                {n(value === null ? null : value / Number(divisor))}
              </strong>
            </div>
          );
        })}
      </div>
      <h3>Données terrain CrUX</h3>
      <p className="muted">
        INP au 75e percentile : {n(inp?.percentile)} ms ·{" "}
        {fields?.INTERACTION_TO_NEXT_PAINT
          ? "URL analysée"
          : originFields?.INTERACTION_TO_NEXT_PAINT
            ? "Origine entière (donnée de page indisponible)"
            : "aucune donnée disponible"}
        . Le terrain et le laboratoire ne décrivent pas la même mesure.
      </p>
      <div className="issue-list">
        {Object.values(audits)
          .filter((a: any) => a.score !== null && a.score < 0.9 && a.details)
          .slice(0, 10)
          .map((a: any) => (
            <details key={a.id}>
              <summary>
                {a.title} — {a.displayValue ?? "diagnostic"}
              </summary>
              <p>{a.description}</p>
            </details>
          ))}
      </div>
    </>
  );
}
export function BatchPanel({
  state,
  site,
  records,
  onAction,
  days,
}: {
  state: State;
  site: Site;
  records: any[];
  onAction: (label: string, input: Input) => Promise<any>;
  days: number;
}) {
  const [open, setOpen] = useState(false),
    [pages, setPages] = useState(30),
    [delay, setDelay] = useState(500),
    [local, setLocal] = useState(true),
    [competitors, setCompetitors] = useState(false);
  const batch =
    state.batch?.siteId === site.id && state.batch.steps.length
      ? state.batch
      : records.find((r) => r.kind === "batch")?.data;
  const labels: Record<string, string> = {
    pending: "En attente",
    running: "En cours",
    passed: "Réussi",
    partial: "Partiel",
    failed: "Échec",
    skipped: "Non exécuté",
    cancelled: "Annulé",
  };
  return (
    <section className="card">
      <div className="section-label">
        <div>
          <h3>Bilan complet du site</h3>
          <p className="muted">
            Toutes les analyses en une seule exécution, avec résultat et erreur
            par service.
          </p>
        </div>
        <button
          className="primary"
          disabled={state.batch?.running}
          onClick={() => setOpen(true)}
        >
          Lancer tous les tests
        </button>
      </div>
      {batch && (
        <>
          <p className="muted">
            {
              batch.steps.filter(
                (s: any) => !["pending", "running"].includes(s.status),
              ).length
            }{" "}
            / {batch.steps.length} étapes terminées{" "}
            {batch.finishedAt
              ? `· ${new Date(batch.finishedAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
          <progress
            max={batch.steps.length}
            value={
              batch.steps.filter(
                (s: any) => !["pending", "running"].includes(s.status),
              ).length
            }
          />
          <div className="batch-steps">
            {batch.steps.map((s: any) => (
              <div key={s.id}>
                <strong>{s.label}</strong>
                <span className={"tag " + s.status}>
                  {labels[s.status] ?? s.status}
                </span>
                {s.reason && <small>{s.reason}</small>}
              </div>
            ))}
          </div>
          {batch.running && (
            <button
              onClick={() =>
                onAction("Annulation du bilan", { action: "audit.cancel" })
              }
            >
              Annuler les étapes restantes
            </button>
          )}
        </>
      )}
      {open && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Configurer le bilan complet"
          >
            <h2>Toutes les analyses</h2>
            <p>
              Google (propriétés configurées), crawl, PageSpeed mobile/desktop,
              inspection et temps réel GA4. Les services non configurés seront
              signalés. L’IA et les imports manuels ne sont pas lancés.
            </p>
            <div className="form-grid">
              <label>
                Pages du bilan
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                />
              </label>
              <label>
                Délai du bilan (ms)
                <input
                  type="number"
                  min={200}
                  max={10000}
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={local}
                onChange={(e) => setLocal(e.target.checked)}
              />{" "}
              Inclure Lighthouse local mobile/desktop (Chrome requis)
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={competitors}
                onChange={(e) => setCompetitors(e.target.checked)}
              />{" "}
              Analyser les concurrents configurés (10 maximum, robots.txt
              respecté)
            </label>
            <p className="muted">
              En lançant le crawl, vous confirmez votre autorisation d’auditer
              le site. Les quotas des API s’appliquent. L’annulation laisse
              l’appel réseau en cours se terminer.
            </p>
            <div className="actions">
              <button onClick={() => setOpen(false)}>Fermer</button>
              <button
                className="primary"
                onClick={async () => {
                  const result = await onAction("Bilan complet", {
                    action: "audit.all",
                    siteId: site.id,
                    days,
                    maxPages: pages,
                    delay,
                    includeLighthouse: local,
                    includeCompetitors: competitors,
                  });
                  if (result) setOpen(false);
                }}
              >
                Démarrer le bilan
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export function UpdatePanel({
  state,
  onAction,
  busy,
}: {
  state: State;
  onAction: (label: string, input: Input) => Promise<any>;
  busy: boolean;
}) {
  const u = state.updater;
  return (
    <section className="card">
      <h3>Mises à jour de l’application</h3>
      <p className="muted">
        Version {u?.currentVersion ?? "—"} · Releases GitHub officielles du
        projet. Les préversions sont incluses. Les exécutables actuels sont non
        signés ; SHA-256 vérifie le téléchargement, pas l’identité d’un éditeur
        certifié.
      </p>
      <div className="actions">
        <button
          disabled={
            busy ||
            ["checking", "downloading", "installing"].includes(u?.status)
          }
          onClick={() =>
            onAction("Recherche de mises à jour", { action: "update.check" })
          }
        >
          Chercher les mises à jour
        </button>
        {u?.info && (
          <span>
            Version {u.info.version}
            {u.info.prerelease ? " (préversion)" : ""}
          </span>
        )}
        {u?.status === "available" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              onAction("Téléchargement de la mise à jour", {
                action: "update.download",
              })
            }
          >
            Télécharger la mise à jour
          </button>
        )}
        {u?.status === "ready" && u.canInstall && (
          <button
            className="primary"
            disabled={busy || state.batch.running}
            onClick={() =>
              onAction("Installation de la mise à jour", {
                action: "update.install",
              })
            }
          >
            Mettre à jour et redémarrer
          </button>
        )}
      </div>
      {u?.status === "current" && <p>Aucune version plus récente trouvée.</p>}
      {u?.status === "checking" && <p>Recherche sur GitHub…</p>}
      {u?.status === "downloading" && (
        <>
          <progress max={u.info?.size ?? 1} value={u.downloaded} />
          <p>
            {n(u.downloaded / 1_000_000)} / {n((u.info?.size ?? 0) / 1_000_000)}{" "}
            Mo
          </p>
        </>
      )}
      {u?.message && (
        <p
          role={u.status === "error" ? "alert" : undefined}
          className={u.status === "error" ? "notice error" : "muted"}
        >
          {u.message}
        </p>
      )}
      {!u?.canInstall && (
        <p className="muted">
          Le remplacement automatique nécessite le portable Windows lancé depuis
          son .exe original, dans un dossier accessible en écriture.
        </p>
      )}
    </section>
  );
}

export function CollectionQuality({ sync }: { sync: any }) {
  const ga = sync?.data.analytics;
  const reports = ga
    ? (Object.values(ga).filter(
        (r: any) => r && typeof r === "object" && r.metricHeaders,
      ) as any[])
    : [];
  const capped = reports.some((r) => r.coverage?.capped);
  const threshold = reports.some((r) => r.metadata?.subjectToThresholding);
  const loss = reports.some((r) => r.metadata?.dataLossFromOtherRow);
  const sampled = reports.some((r) => r.metadata?.samplingMetadatas?.length);
  const zone = reports.find((r) => r.metadata?.timeZone)?.metadata.timeZone;
  return (
    <section className="card">
      <h3>Sources, périodes et qualité des statistiques</h3>
      <p className="muted">
        Période collectée : {sync?.data.period.start ?? "—"} →{" "}
        {sync?.data.period.end ?? "—"} ; comparaison :{" "}
        {sync?.data.period.previousStart ?? "—"} →{" "}
        {sync?.data.period.previousEnd ?? "—"}. Collecte :{" "}
        {sync ? new Date(sync.createdAt).toLocaleString("fr-FR") : "jamais"}.
      </p>
      <p className="muted">
        Search Console : fuseau America/Los_Angeles, données finalisées à J−3 ;
        jusqu’à 25 000 lignes par tableau et période.{" "}
        {sync?.data.search?.capped
          ? "Plafond atteint : tableaux incomplets."
          : "La couverture API peut rester incomplète, notamment pour les requêtes anonymisées."}{" "}
        Totaux issus des agrégats Google.
      </p>
      <p className="muted">
        GA4 :{" "}
        {zone ? `fuseau ${zone}` : "fuseau de la propriété (non communiqué)"}.{" "}
        {capped ? "Plafond de 10 000 lignes atteint. " : ""}
        {threshold ? "Seuils de confidentialité signalés. " : ""}
        {loss ? "Données regroupées dans « other » signalées. " : ""}
        {sampled ? "Échantillonnage signalé. " : ""}Les utilisateurs GA4 et les
        clics Search Console sont des métriques différentes. Aucun total global
        n’est calculé en les additionnant.
      </p>
    </section>
  );
}

export function SearchMetrics({ totals }: { totals: any }) {
  return (
    <div className="metrics">
      {[
        ["Clics", totals?.clicks],
        ["Impressions", totals?.impressions],
        [
          "CTR",
          metricNumber(totals?.ctr) === null ? null : Number(totals.ctr) * 100,
        ],
        ["Position moyenne", totals?.position],
      ].map(([label, value]) => (
        <div className="metric" key={label}>
          <span>{label}</span>
          <strong>
            {n(value)}
            {label === "CTR" && metricNumber(value) !== null ? " %" : ""}
          </strong>
        </div>
      ))}
    </div>
  );
}
