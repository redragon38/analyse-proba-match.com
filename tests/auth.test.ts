import { vi, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const keyring = vi.hoisted(() => ({
  available: true,
  backend: "gnome_libsecret",
}));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => keyring.available,
    getSelectedStorageBackend: () => keyring.backend,
    encryptString: (s: string) =>
      Buffer.from("TEST-ENCRYPTED:" + Buffer.from(s).toString("base64")),
    decryptString: (s: Buffer) =>
      Buffer.from(s.toString().slice(15), "base64").toString(),
  },
  shell: { openExternal: vi.fn() },
}));
import { Vault, GoogleAuth } from "../app/auth";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vault-"));
  keyring.available = true;
  keyring.backend = "gnome_libsecret";
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
it("refuse un coffre absent ou basic_text sans écrire de secret", () => {
  const vault = new Vault(dir);
  keyring.available = false;
  expect(() => vault.set("ai", "test-secret")).toThrow("sécurisé");
  expect(vault.has("ai")).toBe(false);
  keyring.available = true;
  keyring.backend = "basic_text";
  expect(() => vault.set("ai", "test-secret")).toThrow("sécurisé");
});
it("utilise le chiffrement système (simulé uniquement dans ce test)", () => {
  const vault = new Vault(dir);
  vault.set("ai", "test-secret");
  expect(readFileSync(join(dir, "ai.enc"), "utf8")).not.toContain(
    "test-secret",
  );
  expect(vault.get("ai")).toBe("test-secret");
  vault.remove("ai");
  expect(vault.has("ai")).toBe(false);
});
it("renouvelle un token expiré et conserve le refresh token côté principal", async () => {
  const vault = new Vault(dir);
  vault.set(
    "google",
    JSON.stringify({
      access_token: "old-test",
      refresh_token: "refresh-test",
      expires_at: 0,
    }),
  );
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-test", expires_in: 3600 }),
      ),
    );
  const auth = new GoogleAuth(vault, () => "test.apps.googleusercontent.com");
  expect(await auth.token()).toBe("new-test");
  expect(JSON.parse(vault.get("google")).refresh_token).toBe("refresh-test");
  expect(String((mock.mock.calls[0][1] as any).body)).toContain(
    "grant_type=refresh_token",
  );
});
it("signale une révocation distante non confirmée tout en supprimant la session locale", async () => {
  const vault = new Vault(dir);
  vault.set("google", JSON.stringify({ access_token: "test" }));
  vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("offline"));
  const result = await new GoogleAuth(vault, () => "test").disconnect();
  expect(result.revoked).toBe(false);
  expect(vault.has("google")).toBe(false);
});
it("refuse la connexion sans identifiant valide ou coffre", async () => {
  const vault = new Vault(dir);
  await expect(new GoogleAuth(vault, () => "").connect()).rejects.toThrow(
    "identifiant client",
  );
  keyring.available = false;
  await expect(
    new GoogleAuth(vault, () => "test.apps.googleusercontent.com").connect(),
  ).rejects.toThrow("Stockage sécurisé");
});

it("importe uniquement une configuration Desktop sans modifier le JSON en clair sur disque", async () => {
  const { parseGoogleDesktopClient } = await import("../app/auth");
  expect(
    parseGoogleDesktopClient(
      JSON.stringify({
        installed: {
          client_id: "test.apps.googleusercontent.com",
          client_secret: "desktop-test-secret",
          redirect_uris: ["http://localhost"],
        },
      }),
    ),
  ).toEqual({
    client_id: "test.apps.googleusercontent.com",
    client_secret: "desktop-test-secret",
  });
  expect(() =>
    parseGoogleDesktopClient(
      JSON.stringify({
        web: {
          client_id: "test.apps.googleusercontent.com",
          client_secret: "test",
        },
      }),
    ),
  ).toThrow("Application de bureau");
  expect(() => parseGoogleDesktopClient("{broken")).toThrow("JSON illisible");
});
it("explique un client_secret manquant sans reproduire les données renvoyées par Google", async () => {
  const { googleTokenRequest } = await import("../app/auth");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        error: "invalid_request",
        error_description:
          "client_secret is missing. secret-data-do-not-display",
      }),
      { status: 400 },
    ),
  );
  const error = await googleTokenRequest(
    new URLSearchParams({ client_id: "test" }),
  ).catch((e) => e);
  expect(error.message).toContain("client_secret requis");
  expect(error.message).toContain("JSON");
  expect(error.message).not.toContain("secret-data-do-not-display");
});
it.each([
  "invalid_client",
  "invalid_grant",
  "redirect_uri_mismatch",
  "unauthorized_client",
])(
  "explique l’erreur OAuth %s sans exposer le corps de réponse",
  async (code) => {
    const { googleTokenRequest } = await import("../app/auth");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: code, error_description: "test-private-data" }),
        { status: 400 },
      ),
    );
    await expect(googleTokenRequest(new URLSearchParams())).rejects.toThrow(
      code,
    );
  },
);
it("ne joint le secret Desktop au refresh que si le client correspond", async () => {
  const vault = new Vault(dir);
  vault.set(
    "google-client",
    JSON.stringify({
      client_id: "test.apps.googleusercontent.com",
      client_secret: "desktop-test-secret",
    }),
  );
  vault.set(
    "google",
    JSON.stringify({
      access_token: "old",
      refresh_token: "refresh-test",
      expires_at: 0,
    }),
  );
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ access_token: "new", expires_in: 3600 })),
    );
  await new GoogleAuth(vault, () => "test.apps.googleusercontent.com").token();
  expect(
    (fetchMock.mock.calls[0][1]!.body as URLSearchParams).get("client_secret"),
  ).toBe("desktop-test-secret");
  vault.set(
    "google",
    JSON.stringify({
      access_token: "old",
      refresh_token: "refresh-test",
      expires_at: 0,
    }),
  );
  await new GoogleAuth(vault, () => "other.apps.googleusercontent.com").token();
  expect(
    (fetchMock.mock.calls[1][1]!.body as URLSearchParams).has("client_secret"),
  ).toBe(false);
});
it("réalise le callback loopback, valide le state et transmet PKCE et le secret côté principal", async () => {
  const { shell } = await import("electron");
  const { get } = await import("node:http");
  const { createHash } = await import("node:crypto");
  const vault = new Vault(dir);
  vault.set(
    "google-client",
    JSON.stringify({
      client_id: "test.apps.googleusercontent.com",
      client_secret: "desktop-test-secret",
    }),
  );
  const receive = (url: string) =>
    new Promise<number>((resolve, reject) => {
      get(url, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      }).on("error", reject);
    });
  let authorization: URL | undefined;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
      }),
    ),
  );
  vi.mocked(shell.openExternal).mockImplementation(async (raw) => {
    authorization = new URL(raw);
    expect(authorization.searchParams.has("client_secret")).toBe(false);
    const callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", "é".repeat(64));
    callback.searchParams.set("code", "test-code");
    expect(await receive(callback.href)).toBe(400);
    callback.searchParams.set(
      "state",
      authorization.searchParams.get("state")!,
    );
    expect(await receive(callback.href)).toBe(200);
  });
  const auth = new GoogleAuth(vault, () => "test.apps.googleusercontent.com");
  expect(await auth.connect()).toBe(true);
  expect(auth.connecting).toBe(false);
  const body = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
  expect(body.get("client_secret")).toBe("desktop-test-secret");
  expect(body.get("code")).toBe("test-code");
  expect(
    createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
  ).toBe(authorization!.searchParams.get("code_challenge"));
  expect(body.get("redirect_uri")).toBe(
    authorization!.searchParams.get("redirect_uri"),
  );
  expect(JSON.parse(vault.get("google")).access_token).toBe("test-access");
});
it("nettoie le serveur et l’état si le navigateur ne peut pas s’ouvrir", async () => {
  const { shell } = await import("electron");
  vi.mocked(shell.openExternal).mockRejectedValue(Error("test-open-failed"));
  const auth = new GoogleAuth(
    new Vault(dir),
    () => "test.apps.googleusercontent.com",
  );
  await expect(auth.connect()).rejects.toThrow("navigateur système");
  expect(auth.connecting).toBe(false);
});
