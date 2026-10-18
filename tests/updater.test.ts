import { it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  compareVersions,
  selectRelease,
  expectedHash,
  releaseURL,
  downloadVerified,
  UpdateManager,
  INSTALL_SCRIPT,
} from "../app/updater";
const base = "https://github.com/redragon38/analyse-proba-match.com/releases";
const info = {
  version: "0.2.1",
  url: base + "/tag/v0.2.1",
  assetUrl: base + "/download/v0.2.1/SEO-Control-Studio-0.2.1-Portable.exe",
  checksumUrl: base + "/download/v0.2.1/SHA256SUMS.txt",
  size: 5,
  prerelease: true,
};
afterEach(() => vi.restoreAllMocks());
it("compare les versions numériquement et refuse une rétrogradation", () => {
  expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  expect(() => compareVersions("latest", "0.1.0")).toThrow();
  expect(selectRelease([], "0.2.0")).toBeUndefined();
});
it("accepte seulement les assets du dépôt officiel et les versions plus récentes", () => {
  const release = {
    tag_name: "v0.2.1",
    draft: false,
    prerelease: true,
    html_url: info.url,
    assets: [
      {
        name: "SEO-Control-Studio-0.2.1-Portable.exe",
        browser_download_url: info.assetUrl,
        size: 2048,
      },
      { name: "SHA256SUMS.txt", browser_download_url: info.checksumUrl },
    ],
  };
  expect(selectRelease([release], "0.2.0")?.version).toBe("0.2.1");
  expect(selectRelease([release], "0.3.0")).toBeUndefined();
  expect(selectRelease([{ ...release, draft: true }], "0.2.0")).toBeUndefined();
  expect(() => releaseURL("https://evil.test/file.exe")).toThrow();
  expect(() =>
    releaseURL(
      "http://github.com/redragon38/analyse-proba-match.com/releases/a",
    ),
  ).toThrow();
});
it("ne sélectionne pas une empreinte d’un autre fichier", () => {
  expect(() =>
    expectedHash("a".repeat(64) + "  unrelated.exe", "0.2.1"),
  ).toThrow();
});
it("télécharge un vrai fichier, vérifie sa taille et son empreinte avant de le déclarer prêt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "updater-"));
  try {
    const binary = Buffer.from("MZabc");
    const hash = createHash("sha256").update(binary).digest("hex");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(hash + "  SEO-Control-Studio-0.2.1-Portable.exe\n"),
      )
      .mockResolvedValueOnce(new Response(binary));
    const progress = vi.fn();
    const result = await downloadVerified(info, dir, progress);
    expect(readFileSync(result.path)).toEqual(binary);
    expect(result.hash).toBe(hash);
    expect(progress).toHaveBeenCalledWith(5);
    expect(existsSync(result.path + ".part")).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("refuse une empreinte incorrecte et supprime le téléchargement partiel", async () => {
  const dir = mkdtempSync(join(tmpdir(), "updater-"));
  try {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          "0".repeat(64) + "  SEO-Control-Studio-0.2.1-Portable.exe",
        ),
      )
      .mockResolvedValueOnce(new Response("MZabc"));
    await expect(downloadVerified(info, dir, () => {})).rejects.toThrow(
      "SHA-256",
    );
    expect(existsSync(join(dir, "SEO-Control-Studio-0.2.1-Portable.exe"))).toBe(
      false,
    );
    expect(
      existsSync(join(dir, "SEO-Control-Studio-0.2.1-Portable.exe.part")),
    ).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("refuse les redirections externes non approuvées", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/file" },
    }),
  );
  await expect(downloadVerified(info, tmpdir(), () => {})).rejects.toThrow(
    "non autorisée",
  );
});
it("signale l’absence de mise à jour et refuse l’installation sans fichier vérifié", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
  const manager = new UpdateManager("0.2.0", tmpdir());
  expect((await manager.check()).status).toBe("current");
  await expect(manager.install()).rejects.toThrow("vérifiée");
});
