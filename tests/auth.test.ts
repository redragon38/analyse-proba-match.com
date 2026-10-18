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
