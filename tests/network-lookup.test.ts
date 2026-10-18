import { it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import { once } from "node:events";
import { createPinnedLookup, resolvePublic } from "../app/network";

afterEach(() => vi.restoreAllMocks());

it("respecte le contrat DNS all:true pour IPv4 et IPv6", () => {
  for (const address of [
    { address: "8.8.8.8", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]) {
    const callback = vi.fn();
    createPinnedLookup(address)("fixture.invalid", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [address]);
  }
});
it("respecte le contrat DNS scalaire sans all:true", () => {
  const callback = vi.fn();
  createPinnedLookup({ address: "8.8.8.8", family: 4 })(
    "fixture.invalid",
    {},
    callback,
  );
  expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
});
it("connecte réellement le client HTTP Node avec sélection automatique IPv4/IPv6", async () => {
  // Loopback is only a test fixture for the generic DNS adapter. Production
  // callers still have to pass through resolvePublic, which rejects this IP.
  const server = http.createServer((_req, res) => res.end("lookup-ok"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as net.AddressInfo;
  const pinned = createPinnedLookup({ address: "127.0.0.1", family: 4 });
  let allRequested = false;
  const previousAutoSelectFamily = net.getDefaultAutoSelectFamily();
  net.setDefaultAutoSelectFamily(true);
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        `http://lookup-fixture.invalid:${address.port}/`,
        {
          agent: false,
          lookup: (host, options, callback) => {
            allRequested = options.all === true;
            pinned(host, options, callback);
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => resolve(text));
          res.on("error", reject);
        },
      );
      req.setTimeout(2000, () => req.destroy(Error("Test réseau expiré")));
      req.on("error", reject);
    });
    expect(allRequested).toBe(true);
    expect(body).toBe("lookup-ok");
  } finally {
    net.setDefaultAutoSelectFamily(previousAutoSelectFamily);
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("conserve le refus SSRF des destinations locales, privées et DNS mixtes", async () => {
  await expect(resolvePublic("http://127.0.0.1/")).rejects.toThrow("interdite");
  vi.spyOn(dns, "lookup").mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ] as any);
  await expect(resolvePublic("https://mixed-fixture.invalid/")).rejects.toThrow(
    "interdite",
  );
});
