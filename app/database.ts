import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Site, Settings, RecordData } from "./contracts";
export const defaults: Settings = {
  googleClientId: "",
  aiEndpoint: "https://api.openai.com/v1/chat/completions",
  aiModel: "gpt-4.1-mini",
  autoStart: false,
  theme: "dark",
  alertThreshold: 30,
  alertsEnabled: true,
  intervalMinutes: 1440,
};
export class Store {
  db: DatabaseSync;
  constructor(path: string, readOnly = false) {
    this.db = new DatabaseSync(path, { readOnly });
    if (readOnly) return;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,searchProperty TEXT NOT NULL,analyticsProperty TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,siteId TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,kind TEXT NOT NULL,createdAt TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS records_site_kind_date ON records(siteId,kind,createdAt DESC);
 CREATE TABLE IF NOT EXISTS lists(id TEXT PRIMARY KEY,siteId TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,kind TEXT NOT NULL,value TEXT NOT NULL,UNIQUE(siteId,kind,value));
 INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
  }
  sites() {
    return this.db
      .prepare("SELECT * FROM sites ORDER BY createdAt")
      .all() as unknown as Site[];
  }
  site(id: string) {
    const site = this.sites().find((s) => s.id === id);
    if (!site) throw Error("Site introuvable.");
    return site;
  }
  saveSite(input: Omit<Site, "id" | "createdAt">, id?: string) {
    if (id) this.site(id);
    const site = {
      ...input,
      id: id ?? randomUUID(),
      createdAt: id ? this.site(id).createdAt : new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO sites VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,searchProperty=excluded.searchProperty,analyticsProperty=excluded.analyticsProperty",
      )
      .run(
        site.id,
        site.name,
        site.url,
        site.searchProperty,
        site.analyticsProperty,
        site.createdAt,
      );
    return site;
  }
  settings(): Settings {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get("settings");
    return { ...defaults, ...(row ? JSON.parse(String(row.value)) : {}) };
  }
  setSettings(value: Settings) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
      .run("settings", JSON.stringify(value));
  }
  add(siteId: string, kind: string, data: unknown) {
    this.site(siteId);
    const record = {
      id: randomUUID(),
      siteId,
      kind,
      createdAt: new Date().toISOString(),
      data,
    };
    this.db
      .prepare("INSERT INTO records VALUES(?,?,?,?,?)")
      .run(record.id, siteId, kind, record.createdAt, JSON.stringify(data));
    return record;
  }
  records(siteId?: string): RecordData[] {
    const rows = siteId
      ? this.db
          .prepare(
            "SELECT * FROM records WHERE siteId=? ORDER BY createdAt DESC LIMIT 1000",
          )
          .all(siteId)
      : this.db
          .prepare("SELECT * FROM records ORDER BY createdAt DESC LIMIT 1000")
          .all();
    return rows.map((r) => ({
      ...r,
      data: JSON.parse(String(r.data)),
    })) as unknown as RecordData[];
  }
  lists() {
    return this.db.prepare("SELECT * FROM lists ORDER BY rowid DESC").all();
  }
  close() {
    this.db.close();
  }
}
