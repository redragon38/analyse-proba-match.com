import { safeStorage, shell } from "electron";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { apiJSON } from "./network";
export class Vault {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  available() {
    return (
      safeStorage.isEncryptionAvailable() &&
      safeStorage.getSelectedStorageBackend?.() !== "basic_text"
    );
  }
  private file(name: string) {
    if (!/^(google|ai|pagespeed)$/.test(name)) throw Error("Secret inconnu.");
    return path.join(this.dir, name + ".enc");
  }
  get(name: string) {
    if (!existsSync(this.file(name))) return "";
    if (!this.available())
      throw Error("Stockage sécurisé du système indisponible.");
    return safeStorage.decryptString(readFileSync(this.file(name)));
  }
  has(name: string) {
    return existsSync(this.file(name));
  }
  set(name: string, value: string) {
    if (!value) {
      this.remove(name);
      return;
    }
    if (!this.available())
      throw Error(
        "Aucun coffre système sécurisé disponible. Configurez un trousseau ou utilisez Windows.",
      );
    writeFileSync(this.file(name), safeStorage.encryptString(value), {
      mode: 0o600,
    });
  }
  remove(name: string) {
    if (existsSync(this.file(name))) unlinkSync(this.file(name));
  }
}
export class GoogleAuth {
  connecting = false;
  constructor(
    private vault: Vault,
    private clientId: () => string,
  ) {}
  async connect() {
    if (this.connecting) throw Error("Connexion déjà en cours.");
    if (!this.vault.available())
      throw Error("Stockage sécurisé du système requis avant la connexion.");
    const clientId = this.clientId();
    if (!clientId.endsWith(".apps.googleusercontent.com"))
      throw Error(
        "Configurez un identifiant client Google OAuth de type application de bureau.",
      );
    this.connecting = true;
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(32).toString("hex");
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw Error("Redirection locale indisponible.");
      const redirect = `http://127.0.0.1:${address.port}/callback`;
      const codePromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Connexion Google expirée après 3 minutes.")),
          180000,
        );
        server.on("request", (req, res) => {
          const u = new URL(req.url ?? "/", redirect);
          if (u.pathname !== "/callback") {
            res.writeHead(404).end();
            return;
          }
          const received = u.searchParams.get("state") ?? "";
          if (
            received.length !== state.length ||
            !timingSafeEqual(Buffer.from(received), Buffer.from(state))
          ) {
            res.writeHead(400).end("Etat OAuth invalide");
            return;
          }
          clearTimeout(timer);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(
            "Vous pouvez fermer cet onglet et revenir dans SEO Control Studio.",
          );
          if (u.searchParams.has("error"))
            reject(Error("Autorisation Google refusée."));
          else if (u.searchParams.get("code"))
            resolve(u.searchParams.get("code")!);
          else reject(Error("Code OAuth absent."));
        });
      });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope:
          "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        prompt: "consent",
      }).toString();
      await shell.openExternal(url.href);
      const code = await codePromise;
      const tokens = await apiJSON("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        }),
      });
      this.vault.set(
        "google",
        JSON.stringify({
          ...tokens,
          expires_at: Date.now() + tokens.expires_in * 1000,
        }),
      );
      return true;
    } finally {
      server.close();
      this.connecting = false;
    }
  }
  async token() {
    const raw = this.vault.get("google");
    if (!raw) throw Error("Connectez votre compte Google dans les paramètres.");
    let tokens = JSON.parse(raw);
    if (tokens.expires_at < Date.now() + 60000) {
      if (!tokens.refresh_token)
        throw Error("Reconnectez Google pour renouveler la session.");
      const next = await apiJSON("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.clientId(),
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      tokens = {
        ...tokens,
        ...next,
        expires_at: Date.now() + next.expires_in * 1000,
      };
      this.vault.set("google", JSON.stringify(tokens));
    }
    return tokens.access_token as string;
  }
  async request(url: string, body?: unknown) {
    return apiJSON(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async disconnect() {
    const raw = this.vault.get("google");
    if (raw) {
      const t = JSON.parse(raw);
      try {
        const res = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          body: new URLSearchParams({
            token: t.refresh_token ?? t.access_token,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw Error("Révocation refusée.");
      } catch {
        this.vault.remove("google");
        return {
          revoked: false,
          message:
            "Session locale supprimée ; révocation distante non confirmée. Retirez l’accès depuis votre compte Google.",
        };
      }
    }
    this.vault.remove("google");
    return { revoked: true };
  }
}
