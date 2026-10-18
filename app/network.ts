import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import net from "node:net";
export function publicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  // IPv6 public unicast only; block transition and documentation ranges.
  let v: string;
  try {
    v = new URL("http://[" + ip + "]/").hostname.slice(1, -1).toLowerCase();
  } catch {
    return false;
  }
  return (
    /^[23][0-9a-f]{3}:/.test(v) &&
    !v.startsWith("2001:db8:") &&
    !v.startsWith("2002:") &&
    !v.startsWith("2001:0:")
  );
}
export function webURL(value: string) {
  const u = new URL(value);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw Error("URL HTTP(S) sans identifiants, sur port standard uniquement.");
  u.hash = "";
  return u;
}
export async function resolvePublic(value: string) {
  const u = webURL(value);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("Destination locale, privée ou réservée interdite.");
  return { url: u, address: addresses[0] };
}
export type WebResult = {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  redirects: string[];
};
export async function fetchPublic(
  value: string,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    redirects?: string[];
    allowedOrigin?: string;
  } = {},
): Promise<WebResult> {
  const { url, address } = await resolvePublic(value);
  if (options.allowedOrigin && url.origin !== options.allowedOrigin)
    throw Error("Redirection externe exclue.");
  const redirects = options.redirects ?? [];
  if (redirects.length > 8) throw Error("Trop de redirections.");
  const result = await new Promise<WebResult>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "SEOControlStudio/0.1 (+authorized SEO audit)",
          Accept: "text/html,application/xml,text/plain;q=0.9",
        },
        lookup: (_h, _o, cb) => cb(null, address.address, address.family),
        signal: options.signal,
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > (options.maxBytes ?? 3_000_000)) {
            req.destroy(Error("Réponse trop volumineuse."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            url: url.href,
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            redirects,
          }),
        );
      },
    );
    req.setTimeout(20000, () => req.destroy(Error("Délai réseau dépassé.")));
    req.on("error", reject);
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers.location
  )
    return fetchPublic(new URL(result.headers.location, url).href, {
      ...options,
      redirects: [...redirects, url.href],
    });
  return result;
}
export async function apiJSON(
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if ([429, 500, 502, 503].includes(res.status) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return apiJSON(url, init, attempt + 1);
  }
  if (!res.ok)
    throw Error(
      res.status === 401
        ? "Session expirée : reconnectez Google."
        : res.status === 403
          ? "Accès refusé : vérifiez les permissions et les API activées."
          : res.status === 429
            ? "Quota dépassé : réessayez plus tard."
            : `Le service a répondu HTTP ${res.status}.`,
    );
  return res.json();
}

export async function postPublicJSON(
  value: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<any> {
  const { url, address } = await resolvePublic(value);
  if (url.protocol !== "https:") throw Error("HTTPS requis.");
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        lookup: (_h, _o, cb) => cb(null, address.address, address.family),
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 3_000_000) {
            req.destroy(Error("Réponse trop volumineuse."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            reject(Error(`Fournisseur IA : HTTP ${res.statusCode ?? 0}.`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(Error("Réponse JSON invalide."));
          }
        });
      },
    );
    req.setTimeout(60000, () => req.destroy(Error("Délai IA dépassé.")));
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
