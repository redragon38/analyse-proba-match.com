import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist-electron", { recursive: true });
await build({
  entryPoints: ["app/main.ts"],
  outfile: "dist-electron/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
});
await copyFile("app/preload.cjs", "dist-electron/preload.cjs");
