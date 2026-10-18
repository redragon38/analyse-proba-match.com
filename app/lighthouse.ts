import http from "node:http";
import net from "node:net";
import { resolvePublic, createPinnedLookup } from "./network";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
// Chromium sends requests through this local gateway. Every destination is
// resolved and pinned before connecting, including HTTPS tunnels and redirects.
export async function auditLighthouse(
  url: string,
  strategy: "mobile" | "desktop",
) {
  await resolvePublic(url);
  const sockets = new Set<net.Socket>();
  const proxy = http.createServer(async (req, res) => {
    try {
      if (!req.url) throw Error("URL manquante");
      const { url: u, address } = await resolvePublic(req.url);
      if (u.protocol !== "http:") throw Error("CONNECT requis pour HTTPS");
      const upstream = http.request(
        u,
        {
          method: req.method,
          headers: { ...req.headers, host: u.host },
          lookup: createPinnedLookup(address),
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    } catch {
      res.writeHead(403).end("Destination bloquée.");
    }
  });
  proxy.on("connect", async (req, client, head) => {
    try {
      const { address } = await resolvePublic("https://" + req.url);
      const remote = net.connect({ host: address.address, port: 443 }, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) remote.write(head);
        remote.pipe(client);
        client.pipe(remote);
      });
      sockets.add(remote);
      remote.on("close", () => sockets.delete(remote));
      remote.on("error", () => client.destroy());
      client.on("error", () => remote.destroy());
      client.on("close", () => remote.destroy());
      remote.setTimeout(45000, () => remote.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw Error("Proxy indisponible");
  let chrome;
  try {
    chrome = await launch({
      chromeFlags: [
        "--headless=new",
        "--disable-gpu",
        "--disable-quic",
        "--disable-extensions",
        `--proxy-server=http://127.0.0.1:${address.port}`,
        "--proxy-bypass-list=<-loopback>",
      ],
      ...(process.env.CHROME_PATH
        ? { chromePath: process.env.CHROME_PATH }
        : {}),
    });
    const result = await lighthouse(url, {
      port: chrome.port,
      output: ["html", "json"],
      logLevel: "error",
      onlyCategories: ["performance", "seo", "accessibility", "best-practices"],
      ...(strategy === "desktop"
        ? {
            formFactor: "desktop",
            screenEmulation: {
              mobile: false,
              width: 1350,
              height: 940,
              deviceScaleFactor: 1,
              disabled: false,
            },
          }
        : {}),
    });
    if (!result) throw Error("Aucun résultat Lighthouse.");
    return {
      strategy,
      lhr: result.lhr,
      html: Array.isArray(result.report) ? result.report[0] : result.report,
      scope:
        "Audit Chromium via passerelle bloquant les destinations privées. Mesures de laboratoire.",
    };
  } finally {
    await chrome?.kill();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((r) => proxy.close(() => r()));
  }
}
