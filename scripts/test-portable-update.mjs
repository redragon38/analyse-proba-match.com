import { build } from "esbuild";
import {
  mkdtemp,
  copyFile,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
if (process.platform !== "win32") throw Error("Ce contrôle nécessite Windows.");
const root = await mkdtemp(join(tmpdir(), "seo-update-é-' "));
const hash = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const waitResult = async (file) => {
  for (let i = 0; i < 100; i++) {
    try {
      return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const log = await readFile(
    join(file, "..", "update-helper.log"),
    "utf8",
  ).catch(() => "(journal absent)");
  console.error(log);
  throw Error("Le programme de mise à jour n’a pas terminé.");
};
try {
  const moduleFile = join(root, "updater.mjs");
  await build({
    entryPoints: ["app/updater.ts"],
    outfile: moduleFile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  const { launchPortableUpdate } = await import(pathToFileURL(moduleFile).href);
  const original = join(process.env.SystemRoot, "System32", "whoami.exe");
  const replacement = join(process.env.SystemRoot, "System32", "hostname.exe");
  for (const valid of [true, false]) {
    const dir = join(root, valid ? "success" : "bad-checksum");
    await import("node:fs/promises").then((fs) => fs.mkdir(dir));
    const target = join(dir, "Studio d'essai.exe"),
      staged = join(dir, "new.exe");
    await copyFile(original, target);
    await copyFile(replacement, staged);
    const oldHash = await hash(target);
    const newHash = await hash(staged);
    try {
      await launchPortableUpdate(
        target,
        staged,
        valid ? newHash : "0".repeat(64),
        "0.2.1",
        dir,
        2147483646,
      );
    } catch (e) {
      console.error(
        await readFile(join(dir, "update-helper.log"), "utf8").catch(
          () => "(journal absent)",
        ),
      );
      if (valid) throw e;
    }
    const result = await waitResult(join(dir, "install-result.json"));
    assert.equal(result.ok, valid);
    assert.equal(await hash(target), valid ? newHash : oldHash);
    if (valid) {
      const backups = (await readdir(dir)).filter((n) =>
        n.includes(".previous-"),
      );
      assert.equal(backups.length, 1);
      assert.equal(await hash(join(dir, backups[0])), oldHash);
    }
    console.log(
      valid
        ? "Remplacement et sauvegarde validés sur Windows."
        : "Empreinte invalide refusée, exécutable original conservé.",
    );
  }
} finally {
  await new Promise((r) => setTimeout(r, 1500));
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
