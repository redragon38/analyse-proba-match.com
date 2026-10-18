import { createHash } from "node:crypto";
import {
  mkdir,
  writeFile,
  rename,
  rm,
  access,
  stat,
  readFile,
  open,
} from "node:fs/promises";
import { createWriteStream, constants } from "node:fs";
import { join, dirname, isAbsolute, extname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
export const REPOSITORY = "redragon38/analyse-proba-match.com";
export type UpdateInfo = {
  version: string;
  url: string;
  assetUrl: string;
  checksumUrl: string;
  size: number;
  prerelease: boolean;
};
export type UpdateState = {
  status:
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "error";
  currentVersion: string;
  checkedAt?: string;
  info?: UpdateInfo;
  downloaded: number;
  message?: string;
  canInstall: boolean;
};
export function compareVersions(a: string, b: string) {
  const parse = (v: string) => {
    if (!/^\d+\.\d+\.\d+$/.test(v)) throw Error("Version invalide.");
    return v.split(".").map(Number);
  };
  const x = parse(a),
    y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
export function releaseURL(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    (u.port !== "" && u.port !== "443") ||
    u.hostname !== "github.com" ||
    u.username ||
    u.password ||
    !u.pathname.startsWith("/" + REPOSITORY + "/releases/")
  )
    throw Error("Adresse de mise à jour non autorisée.");
  return u.href;
}
export function selectRelease(
  releases: any[],
  current: string,
): UpdateInfo | undefined {
  return releases
    .filter((r) => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name ?? ""))
    .map((r) => {
      const version = r.tag_name.slice(1);
      const name = `SEO-Control-Studio-${version}-Portable.exe`;
      const asset = r.assets?.find((a: any) => a.name === name);
      const hash = r.assets?.find((a: any) => a.name === "SHA256SUMS.txt");
      if (
        !asset ||
        !hash ||
        !Number.isSafeInteger(asset.size) ||
        asset.size < 1024 ||
        asset.size > 600_000_000 ||
        compareVersions(version, current) <= 0
      )
        return undefined;
      return {
        version,
        url: releaseURL(r.html_url),
        assetUrl: releaseURL(asset.browser_download_url),
        checksumUrl: releaseURL(hash.browser_download_url),
        size: asset.size,
        prerelease: !!r.prerelease,
      };
    })
    .filter((r): r is UpdateInfo => !!r)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}
export function expectedHash(text: string, version: string) {
  const name = `SEO-Control-Studio-${version}-Portable.exe`;
  for (const line of text.split(/\r?\n/)) {
    const m = /^([a-f0-9]{64})\s+\*?([^\r\n]+)$/i.exec(line);
    if (m && m[2] === name) return m[1].toLowerCase();
  }
  throw Error("Empreinte SHA-256 du portable absente ou invalide.");
}
async function assetResponse(url: string) {
  releaseURL(url);
  let current = url;
  for (let i = 0; i < 6; i++) {
    const u = new URL(current);
    if (
      u.protocol !== "https:" ||
      (u.port !== "" && u.port !== "443") ||
      u.username ||
      u.password ||
      ![
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(u.hostname)
    )
      throw Error("Redirection de téléchargement non autorisée.");
    const response = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(300000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw Error("Redirection invalide.");
      current = new URL(next, u).href;
      continue;
    }
    if (!response.ok)
      throw Error(`Téléchargement GitHub : HTTP ${response.status}.`);
    return response;
  }
  throw Error("Trop de redirections de téléchargement.");
}
export async function downloadVerified(
  info: UpdateInfo,
  directory: string,
  onProgress: (bytes: number) => void,
) {
  const hashResponse = await assetResponse(info.checksumUrl);
  const checksumBytes = await limitedBody(hashResponse, 8192);
  const hash = expectedHash(checksumBytes.toString("utf8"), info.version);
  await mkdir(directory, { recursive: true });
  const target = join(
    directory,
    `SEO-Control-Studio-${info.version}-Portable.exe`,
  );
  const temp = target + ".part";
  let count = 0;
  let firstBytes = Buffer.alloc(0);
  const digest = createHash("sha256");
  try {
    const response = await assetResponse(info.assetUrl);
    if (!response.body) throw Error("Téléchargement vide.");
    const counter = new Transform({
      transform(chunk, _, callback) {
        if (firstBytes.length < 2)
          firstBytes = Buffer.concat([
            firstBytes,
            chunk.subarray(0, 2 - firstBytes.length),
          ]);
        count += chunk.length;
        if (count > info.size) {
          callback(Error("Taille du téléchargement inattendue."));
          return;
        }
        digest.update(chunk);
        onProgress(count);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as any),
      counter,
      createWriteStream(temp, { flags: "w" }),
    );
    if (
      firstBytes.toString("ascii") !== "MZ" ||
      count !== info.size ||
      digest.digest("hex") !== hash
    )
      throw Error(
        "Vérification SHA-256 ou taille échouée. Le fichier ne sera pas exécuté.",
      );
    await rename(temp, target);
    return { path: target, hash };
  } catch (e) {
    await rm(temp, { force: true });
    throw e;
  }
}
async function limitedBody(response: Response, max: number) {
  if (!response.body) throw Error("Réponse vide.");
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const chunk of Readable.fromWeb(response.body as any)) {
    count += chunk.length;
    if (count > max) throw Error("Réponse de contrôle trop volumineuse.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
// Paths are passed in JSON, never interpolated into PowerShell code.
export const INSTALL_SCRIPT = String.raw`param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$c = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$backup = [IO.Path]::ChangeExtension($c.target, '.previous-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff') + '.exe')
$moved = $false
function FileHash([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); $stream.Dispose() }
}
try {
  if ((FileHash $c.staged) -ne $c.hash) { throw 'Empreinte de mise à jour invalide.' }
  @{ready=$true} | ConvertTo-Json | Set-Content -LiteralPath $c.ready -Encoding UTF8
  if (Get-Process -Id $c.pid -ErrorAction SilentlyContinue) { Wait-Process -Id $c.pid -Timeout 60 -ErrorAction SilentlyContinue }
  if (Get-Process -Id $c.pid -ErrorAction SilentlyContinue) { throw 'Application encore active : remplacement annulé.' }
  for ($i=0; $i -lt 30; $i++) {
    try { Move-Item -LiteralPath $c.target -Destination $backup -ErrorAction Stop; $moved=$true; break } catch { if ($i -eq 29) { throw }; Start-Sleep -Seconds 1 }
  }
  Move-Item -LiteralPath $c.staged -Destination $c.target -ErrorAction Stop
  if ((FileHash $c.target) -ne $c.hash) { throw 'Vérification après remplacement échouée.' }
  @{ok=$true;version=$c.version} | ConvertTo-Json | Set-Content -LiteralPath $c.result -Encoding UTF8
  Start-Process -FilePath $c.target
} catch {
  $failure=$_.Exception.Message
  if ($moved -and (Test-Path -LiteralPath $backup)) { Move-Item -LiteralPath $backup -Destination $c.target -Force -ErrorAction SilentlyContinue }
  @{ok=$false;message=$failure} | ConvertTo-Json | Set-Content -LiteralPath $c.result -Encoding UTF8
  if (Test-Path -LiteralPath $c.target) { Start-Process -FilePath $c.target }
}
`;
export async function launchPortableUpdate(
  target: string,
  staged: string,
  hash: string,
  version: string,
  directory: string,
  pid: number,
) {
  if (process.platform !== "win32")
    throw Error(
      "Le remplacement automatique est disponible pour le portable Windows.",
    );
  if (
    !isAbsolute(target) ||
    extname(target).toLowerCase() !== ".exe" ||
    !isAbsolute(staged) ||
    target === staged
  )
    throw Error("Chemin de mise à jour invalide.");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Error("Empreinte invalide.");
  await access(dirname(target), constants.W_OK);
  if (!(await stat(target)).isFile())
    throw Error("Portable original introuvable.");
  await mkdir(directory, { recursive: true });
  const script = join(directory, "apply-update.ps1");
  const config = join(directory, "apply-update.json");
  const ready = join(directory, `ready-${Date.now()}.json`);
  const resultFile = join(directory, "install-result.json");
  await rm(resultFile, { force: true });
  await writeFile(script, "\uFEFF" + INSTALL_SCRIPT, "utf8");
  await writeFile(
    config,
    JSON.stringify({
      target,
      staged,
      hash,
      version,
      pid,
      result: resultFile,
      ready,
    }),
    "utf8",
  );
  let exitCode: number | null | undefined;
  const log = await open(join(directory, "update-helper.log"), "a");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-EncodedCommand",
          Buffer.from(
            "$parameters = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
              Buffer.from(JSON.stringify({ script, config }), "utf8").toString(
                "base64",
              ) +
              "')) | ConvertFrom-Json; & $parameters.script -ConfigPath $parameters.config",
            "utf16le",
          ).toString("base64"),
        ],
        {
          detached: false,
          stdio: ["ignore", log.fd, log.fd],
          windowsHide: true,
          cwd: directory,
        },
      );
      child.once("exit", (code) => {
        exitCode = code;
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } finally {
    await log.close();
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await access(ready);
      await rm(ready, { force: true });
      return;
    } catch {}
    let result: any;
    try {
      const raw = await readFile(resultFile, "utf8");
      result = JSON.parse(raw.charCodeAt(0) === 65279 ? raw.slice(1) : raw);
    } catch {}
    if (result?.ok === true) return;
    if (result?.ok === false)
      throw Error(
        "Le programme Windows a refusé la mise à jour : " +
          String(result.message ?? "cause inconnue").slice(0, 500),
      );
    if (exitCode !== undefined) {
      try {
        await access(ready);
        await rm(ready, { force: true });
        return;
      } catch {}
      throw Error(
        `Le programme de mise à jour s’est arrêté avant sa confirmation (code ${exitCode}). Consultez update-helper.log.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error(
    "Le programme de mise à jour Windows n’a pas confirmé son démarrage. L’application reste ouverte ; consultez update-helper.log dans le dossier updates.",
  );
}
export class UpdateManager {
  state: UpdateState;
  private verified?: { path: string; hash: string };
  constructor(
    version: string,
    private directory: string,
    private target?: string,
  ) {
    this.state = {
      status: "idle",
      currentVersion: version,
      downloaded: 0,
      canInstall: process.platform === "win32" && !!target,
    };
  }
  async recoverResult() {
    const file = join(this.directory, "install-result.json");
    try {
      const result = JSON.parse(
        (await readFile(file, "utf8")).replace(/^\uFEFF/, ""),
      );
      this.state.message = result.ok
        ? `Mise à jour ${String(result.version)} appliquée.`
        : "La dernière mise à jour a échoué. L’ancien exécutable a été conservé ; relancez une recherche.";
      if (!result.ok) this.state.status = "error";
      await rm(file, { force: true });
    } catch {}
  }
  async check() {
    if (["checking", "downloading", "installing"].includes(this.state.status))
      throw Error("Une mise à jour est déjà en cours.");
    this.state.status = "checking";
    this.state.message = undefined;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "SEO-Control-Studio",
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) throw Error(`Recherche GitHub : HTTP ${res.status}.`);
      const releases = await res.json();
      if (!Array.isArray(releases)) throw Error("Réponse GitHub invalide.");
      this.state.info = selectRelease(releases, this.state.currentVersion);
      this.verified = undefined;
      this.state.status = this.state.info ? "available" : "current";
      this.state.checkedAt = new Date().toISOString();
      return this.state;
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  async download() {
    if (!this.state.info || !["available", "error"].includes(this.state.status))
      throw Error("Recherchez d’abord une mise à jour.");
    this.state.status = "downloading";
    this.state.downloaded = 0;
    try {
      this.verified = await downloadVerified(
        this.state.info,
        this.directory,
        (n) => (this.state.downloaded = n),
      );
      this.state.status = "ready";
      this.state.message =
        "Téléchargement vérifié par SHA-256. Exécutable non signé.";
      return this.state;
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  async install() {
    if (!this.verified || this.state.status !== "ready" || !this.target)
      throw Error(
        "Téléchargez une mise à jour vérifiée depuis le portable Windows.",
      );
    this.state.status = "installing";
    try {
      await launchPortableUpdate(
        this.target,
        this.verified.path,
        this.verified.hash,
        this.state.info!.version,
        this.directory,
        process.pid,
      );
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
  private fail(e: unknown) {
    this.state.status = "error";
    this.state.message =
      e instanceof Error ? e.message : "Mise à jour impossible.";
  }
}
