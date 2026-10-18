import type { Input, Site } from "./contracts";
export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "partial"
  | "failed"
  | "skipped"
  | "cancelled";
export type BatchStep = {
  id: string;
  label: string;
  status: StepStatus;
  reason?: string;
  startedAt?: string;
  finishedAt?: string;
  recordId?: string;
  input?: Input;
};
export type BatchState = {
  running: boolean;
  siteId: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequested: boolean;
  steps: BatchStep[];
};
export function auditPlan(
  site: Site,
  days: number,
  maxPages: number,
  delay: number,
  connected: boolean,
  local: boolean,
  competitors: string[] = [],
): BatchStep[] {
  const step = (
    id: string,
    label: string,
    input: Input,
    reason?: string,
  ): BatchStep => ({
    id,
    label,
    input,
    status: reason ? "skipped" : "pending",
    ...(reason ? { reason } : {}),
  });
  return [
    step(
      "sync",
      "Search Console et Google Analytics",
      { action: "sync", siteId: site.id, days },
      !connected
        ? "Google non connecté."
        : !site.searchProperty && !site.analyticsProperty
          ? "Aucune propriété Google associée."
          : undefined,
    ),
    step("crawl", "Crawl et audit HTML", {
      action: "crawl",
      siteId: site.id,
      maxPages,
      delay,
    }),
    ...(["mobile", "desktop"] as const).map((strategy) =>
      step("pagespeed-" + strategy, "PageSpeed " + strategy, {
        action: "pagespeed",
        siteId: site.id,
        strategy,
      }),
    ),
    ...(["mobile", "desktop"] as const).map((strategy) =>
      step(
        "lighthouse-" + strategy,
        "Lighthouse local " + strategy,
        { action: "lighthouse", siteId: site.id, strategy },
        !local ? "Lighthouse local non sélectionné." : undefined,
      ),
    ),
    step(
      "inspect",
      "Inspection Google de la page d’accueil",
      { action: "inspect", siteId: site.id, url: site.url },
      !connected
        ? "Google non connecté."
        : !site.searchProperty
          ? "Aucune propriété Search Console associée."
          : undefined,
    ),
    step(
      "realtime",
      "Audience GA4 en temps réel",
      { action: "analytics.realtime", siteId: site.id },
      !connected
        ? "Google non connecté."
        : !site.analyticsProperty
          ? "Aucune propriété GA4 associée."
          : undefined,
    ),
    ...competitors.slice(0, 10).map((url, i) =>
      step("competitor-" + i, "Analyse publique : " + url, {
        action: "competitor.audit",
        siteId: site.id,
        url,
      }),
    ),
  ];
}
export class BatchRunner {
  state: BatchState = {
    running: false,
    siteId: "",
    cancelRequested: false,
    steps: [],
  };
  done: Promise<void> = Promise.resolve();
  start(
    siteId: string,
    steps: BatchStep[],
    execute: (input: Input) => Promise<any>,
    complete: (state: BatchState) => void,
  ) {
    if (this.state.running) throw Error("Un bilan complet est déjà en cours.");
    this.state = {
      running: true,
      siteId,
      cancelRequested: false,
      startedAt: new Date().toISOString(),
      steps,
    };
    this.done = this.run(execute, complete);
    return this.snapshot();
  }
  snapshot() {
    return {
      ...this.state,
      steps: this.state.steps.map(({ input, ...step }) => step),
    };
  }
  cancel() {
    this.state.cancelRequested = true;
  }
  private async run(
    execute: (input: Input) => Promise<any>,
    complete: (state: BatchState) => void,
  ) {
    try {
      for (const step of this.state.steps) {
        if (step.status === "skipped") continue;
        if (this.state.cancelRequested) {
          step.status = "cancelled";
          step.reason = "Annulation demandée.";
          continue;
        }
        step.status = "running";
        step.startedAt = new Date().toISOString();
        try {
          const result = await execute(step.input!);
          step.recordId = result?.id;
          const errors = result?.data?.errors;
          if (result?.data?.cancelled) {
            step.status = "cancelled";
            step.reason = "Crawl interrompu.";
          } else if (Array.isArray(errors) && errors.length) {
            step.status =
              result.data.search ||
              result.data.analytics ||
              result.data.pages?.length
                ? "partial"
                : "failed";
            step.reason = errors
              .map((e: any) => e.message ?? e.error ?? "Erreur de collecte")
              .join(" · ");
          } else if (
            Array.isArray(result?.data?.pages) &&
            !result.data.pages.length
          ) {
            step.status = "partial";
            step.reason =
              "Aucune page analysée ; consultez les blocages robots et les erreurs de collecte.";
          } else step.status = "passed";
        } catch (e) {
          step.status = "failed";
          step.reason = e instanceof Error ? e.message : "Analyse impossible.";
        }
        step.finishedAt = new Date().toISOString();
      }
    } finally {
      this.state.running = false;
      this.state.finishedAt = new Date().toISOString();
      try {
        complete(this.snapshot());
      } catch {
        this.state.steps.push({
          id: "history",
          label: "Enregistrement du bilan",
          status: "failed",
          reason: "Impossible de conserver le bilan dans la base locale.",
        });
      }
    }
  }
}
