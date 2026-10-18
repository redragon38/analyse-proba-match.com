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
import { z } from "zod";
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
    if (!/^(google|google-client|ai|pagespeed)$/.test(name))
      throw Error("Secret inconnu.");
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

const DesktopClient = z.object({
  client_id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/),
  client_secret: z.string().trim().min(1).max(4096).optional(),
});
export function parseGoogleDesktopClient(text: string) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("Fichier OAuth invalide : JSON illisible.");
  }
  const parsed = z.object({ installed: DesktopClient }).safeParse(data);
  if (!parsed.success)
    throw Error(
      "Choisissez le fichier JSON d’un client OAuth « Application de bureau » (section installed), pas un client Web ou un compte de service.",
    );
  return parsed.data.installed;
}
export async function googleTokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Error(`Google OAuth : réponse illisible (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    // Never display arbitrary provider text: it could echo codes, tokens or secrets.
    const description =
      typeof data?.error_description === "string" ? data.error_description : "";
    if (
      /client_secret/i.test(description) &&
      /missing|required|not provided/i.test(description)
    )
      throw Error(
        "Google OAuth : client_secret requis. Importez le fichier JSON de votre client « Application de bureau » dans Paramètres → Connexion Google, puis reconnectez-vous. Il sera conservé uniquement dans le coffre chiffré de cet ordinateur.",
      );
    const reasons: Record<string, string> = {
      invalid_client:
        "Client non reconnu ou configuration client incomplète. Importez le JSON « Application de bureau » du même projet Google Cloud.",
      unauthorized_client:
        "Ce type de client ne peut pas utiliser ce flux. Créez un client OAuth « Application de bureau », puis importez son JSON.",
      invalid_grant:
        "Code expiré, déjà utilisé ou incompatible avec cette connexion. Relancez la connexion depuis l’application et utilisez uniquement le nouvel onglet Google.",
      redirect_uri_mismatch:
        "Redirection incompatible. Utilisez un client « Application de bureau » ; l’application utilise un port local dynamique.",
      invalid_request:
        "Paramètres OAuth refusés. Importez le JSON « Application de bureau », puis relancez la connexion.",
      access_denied:
        "Autorisation refusée. Vérifiez le consentement et les utilisateurs test du projet Google Cloud.",
    };
    const reason =
      typeof data?.error === "string" ? reasons[data.error] : undefined;
    if (reason)
      throw Error(
        `Google OAuth (${data.error}, HTTP ${response.status}) : ${reason}`,
      );
    throw Error(
      `Google OAuth : échange de jetons refusé (HTTP ${response.status}). Réessayez puis vérifiez la configuration du client Desktop dans Google Cloud.`,
    );
  }
  const tokens = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
      refresh_token: z.string().min(1).optional(),
      token_type: z.string().optional(),
      scope: z.string().optional(),
    })
    .safeParse(data);
  if (!tokens.success)
    throw Error(
      "Google OAuth : réponse de jetons incomplète. Reconnectez votre compte.",
    );
  return tokens.data;
}

export class GoogleAuth {
  connecting = false;
  constructor(
    private vault: Vault,
    private clientId: () => string,
  ) {}
  private clientParameters(clientId: string) {
    const params: Record<string, string> = { client_id: clientId.trim() };
    if (this.vault.has("google-client")) {
      const client = DesktopClient.parse(
        JSON.parse(this.vault.get("google-client")),
      );
      if (client.client_id === params.client_id && client.client_secret)
        params.client_secret = client.client_secret;
    }
    return params;
  }
  async connect() {
    if (this.connecting) throw Error("Connexion déjà en cours.");
    if (!this.vault.available())
      throw Error("Stockage sécurisé du système requis avant la connexion.");
    const clientId = this.clientId().trim();
    if (!clientId.endsWith(".apps.googleusercontent.com"))
      throw Error(
        "Configurez un identifiant client Google OAuth de type application de bureau.",
      );
    this.connecting = true;
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(32).toString("hex");
    const server = createServer();
    let timer: NodeJS.Timeout | undefined;
    let cancel: ((error: Error) => void) | undefined;
    let consumed = false;
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
        cancel = reject;
        timer = setTimeout(
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
          if (consumed) {
            res.writeHead(409).end("Connexion déjà traitée.");
            return;
          }
          if (
            !/^[a-f0-9]{64}$/.test(received) ||
            !timingSafeEqual(Buffer.from(received), Buffer.from(state))
          ) {
            res.writeHead(400).end("Etat OAuth invalide");
            return;
          }
          consumed = true;
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
      const code = await (async () => {
        // Attach a rejection handler before opening the browser, including failures to open it.
        const opening = shell.openExternal(url.href).catch(() => {
          cancel?.(
            Error(
              "Impossible d’ouvrir le navigateur système. Relancez la connexion.",
            ),
          );
        });
        try {
          return await codePromise;
        } finally {
          await opening;
        }
      })();
      const tokens = await googleTokenRequest(
        new URLSearchParams({
          ...this.clientParameters(clientId),
          code,
          code_verifier: verifier,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        }),
      );
      this.vault.set(
        "google",
        JSON.stringify({
          ...tokens,
          expires_at: Date.now() + tokens.expires_in * 1000,
        }),
      );
      return true;
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
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
      const next = await googleTokenRequest(
        new URLSearchParams({
          ...this.clientParameters(this.clientId()),
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      );
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
