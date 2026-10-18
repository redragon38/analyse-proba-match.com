import { z } from "zod";
export const SiteInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    url: z.string().url().max(2048),
    searchProperty: z.string().max(2048).default(""),
    analyticsProperty: z
      .string()
      .regex(/^(\d+)?$/)
      .default(""),
  })
  .strict();
export type Site = z.infer<typeof SiteInput> & {
  id: string;
  createdAt: string;
};
export type Issue = {
  id: string;
  category: string;
  severity: "élevé" | "moyen" | "faible";
  url: string;
  description: string;
  evidence: string;
  recommendation: string;
  source: string;
  detectedAt: string;
  status: string;
};
export type Page = {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  canonical: string;
  robots: string;
  links: string[];
  missingAlt: number;
  milliseconds: number;
  depth: number;
  issues: Issue[];
};
export type RecordData = {
  id: string;
  siteId: string;
  kind: string;
  createdAt: string;
  data: any;
};
export type Settings = {
  googleClientId: string;
  aiEndpoint: string;
  aiModel: string;
  autoStart: boolean;
  theme: "dark" | "light";
  alertThreshold: number;
  alertsEnabled: boolean;
  intervalMinutes: number;
};
export const SettingsInput = z
  .object({
    googleClientId: z.string().max(300),
    aiEndpoint: z.string().url(),
    aiModel: z.string().max(100),
    autoStart: z.boolean(),
    theme: z.enum(["dark", "light"]),
    alertThreshold: z.number().min(1).max(100),
    alertsEnabled: z.boolean(),
    intervalMinutes: z.number().int().min(15).max(10080),
  })
  .strict();
export const Request = z.discriminatedUnion("action", [
  z.object({ action: z.literal("state") }),
  z.object({
    action: z.literal("site.save"),
    site: SiteInput,
    id: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("site.delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("settings.save"), settings: SettingsInput }),
  z.object({
    action: z.literal("secret.save"),
    kind: z.enum(["ai", "pagespeed"]),
    value: z.string().max(4096),
  }),
  z.object({ action: z.literal("google.connect") }),
  z.object({ action: z.literal("google.import") }),
  z.object({ action: z.literal("google.disconnect") }),
  z.object({ action: z.literal("google.properties") }),
  z.object({
    action: z.literal("analytics.realtime"),
    siteId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("issue.status"),
    siteId: z.string().uuid(),
    issueId: z.string().uuid(),
    status: z.enum(["ouvert", "en cours", "résolu", "ignoré"]),
  }),
  z.object({
    action: z.literal("sync"),
    siteId: z.string().uuid(),
    days: z.number().int().min(1).max(365),
  }),
  z.object({
    action: z.literal("pagespeed"),
    siteId: z.string().uuid(),
    strategy: z.enum(["mobile", "desktop"]),
  }),
  z.object({
    action: z.literal("inspect"),
    siteId: z.string().uuid(),
    url: z.string().url(),
  }),
  z.object({
    action: z.literal("crawl"),
    siteId: z.string().uuid(),
    maxPages: z.number().int().min(1).max(500),
    delay: z.number().int().min(200).max(10000),
  }),
  z.object({
    action: z.literal("crawl.control"),
    command: z.enum(["pause", "resume", "cancel"]),
  }),
  z.object({
    action: z.literal("lighthouse"),
    siteId: z.string().uuid(),
    strategy: z.enum(["mobile", "desktop"]),
  }),
  z.object({
    action: z.literal("export"),
    siteId: z.string().uuid(),
    format: z.enum(["json", "csv", "html", "pdf", "xlsx"]),
  }),
  z.object({
    action: z.literal("competitor.audit"),
    siteId: z.string().uuid(),
    url: z.string().url(),
  }),
  z.object({
    action: z.literal("lighthouse.export"),
    recordId: z.string().uuid(),
    format: z.enum(["html", "json"]),
  }),
  z.object({ action: z.literal("backup") }),
  z.object({ action: z.literal("restore") }),
  z.object({
    action: z.literal("list.add"),
    siteId: z.string().uuid(),
    kind: z.enum(["keyword", "competitor"]),
    value: z.string().trim().min(1).max(2048),
  }),
  z.object({ action: z.literal("list.delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("alert.resolve"), id: z.string().uuid() }),
  z.object({ action: z.literal("trends.import"), siteId: z.string().uuid() }),
  z.object({
    action: z.literal("ai.ask"),
    siteId: z.string().uuid(),
    question: z.string().min(1).max(4000),
    consent: z.literal(true),
  }),
  z.object({
    action: z.literal("external"),
    url: z.enum([
      "https://console.cloud.google.com/",
      "https://search.google.com/search-console",
      "https://trends.google.com/trends/",
      "https://developers.google.com/identity/protocols/oauth2/native-app",
    ]),
  }),
]);
export type Input = z.infer<typeof Request>;
export type State = {
  sites: Site[];
  records: RecordData[];
  lists: { id: string; siteId: string; kind: string; value: string }[];
  settings: Settings;
  connected: boolean;
  secretStatus: { ai: boolean; pagespeed: boolean };
  crawl: { running: boolean; paused: boolean; count: number; current: string };
  secureStorage: boolean;
};
export interface Bridge {
  request(input: Input): Promise<any>;
}
