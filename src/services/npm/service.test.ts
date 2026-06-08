import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({ npmFetch: vi.fn() }));

import { npmFetch } from "./client";
import { npmService } from "./service";
import { NpmError } from "./types";

const f = npmFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("npmService proxy hosts", () => {
  it("list GETs /nginx/proxy-hosts", async () => {
    f.mockResolvedValue([]);
    await npmService.proxyHosts.list();
    expect(f).toHaveBeenCalledWith({ path: "/nginx/proxy-hosts" });
  });

  it("create POSTs the body", async () => {
    f.mockResolvedValue({ id: 1 });
    const req = { domain_names: ["a.com"], forward_host: "x", forward_port: 80 };
    await npmService.proxyHosts.create(req as never);
    expect(f).toHaveBeenCalledWith({ path: "/nginx/proxy-hosts", method: "POST", body: req });
  });

  it("update PUTs to /:id", async () => {
    f.mockResolvedValue({ id: 1 });
    await npmService.proxyHosts.update(5, { forward_port: 81 } as never);
    expect(f).toHaveBeenCalledWith({
      path: "/nginx/proxy-hosts/5",
      method: "PUT",
      body: { forward_port: 81 },
    });
  });

  it("remove DELETEs /:id", async () => {
    f.mockResolvedValue(undefined);
    await npmService.proxyHosts.remove(5);
    expect(f).toHaveBeenCalledWith({ path: "/nginx/proxy-hosts/5", method: "DELETE" });
  });

  it("enable/disable POST to the toggle endpoints", async () => {
    f.mockResolvedValue(undefined);
    await npmService.proxyHosts.enable(5);
    expect(f).toHaveBeenCalledWith({ path: "/nginx/proxy-hosts/5/enable", method: "POST" });
    await npmService.proxyHosts.disable(5);
    expect(f).toHaveBeenCalledWith({ path: "/nginx/proxy-hosts/5/disable", method: "POST" });
  });
});

describe("npmService other host types", () => {
  it("redirection hosts hit /nginx/redirection-hosts", async () => {
    f.mockResolvedValue([]);
    await npmService.redirectionHosts.list();
    expect(f).toHaveBeenCalledWith({ path: "/nginx/redirection-hosts" });
  });

  it("streams create POSTs to /nginx/streams", async () => {
    f.mockResolvedValue({ id: 1 });
    const req = { incoming_port: 2222, forwarding_host: "h", forwarding_port: 22, tcp_forwarding: true, udp_forwarding: false };
    await npmService.streams.create(req);
    expect(f).toHaveBeenCalledWith({ path: "/nginx/streams", method: "POST", body: req });
  });

  it("dead hosts hit /nginx/dead-hosts", async () => {
    f.mockResolvedValue([]);
    await npmService.deadHosts.list();
    expect(f).toHaveBeenCalledWith({ path: "/nginx/dead-hosts" });
  });
});

describe("npmService certificates + access lists", () => {
  it("list certificates GETs /nginx/certificates", async () => {
    f.mockResolvedValue([]);
    await npmService.certificates.list();
    expect(f).toHaveBeenCalledWith({ path: "/nginx/certificates" });
  });

  it("requestLetsEncrypt POSTs a letsencrypt provider body", async () => {
    f.mockResolvedValue({ id: 7 });
    await npmService.certificates.requestLetsEncrypt({
      domainNames: ["a.com", "b.com"],
      email: "me@x.com",
    });
    const call = f.mock.calls[0][0];
    expect(call.path).toBe("/nginx/certificates");
    expect(call.method).toBe("POST");
    expect(call.body.provider).toBe("letsencrypt");
    expect(call.body.domain_names).toEqual(["a.com", "b.com"]);
    expect(call.body.meta.letsencrypt_email).toBe("me@x.com");
    expect(call.body.meta.letsencrypt_agree).toBe(true);
  });

  it("access lists GET /nginx/access-lists", async () => {
    f.mockResolvedValue([]);
    await npmService.accessLists.list();
    expect(f).toHaveBeenCalledWith({ path: "/nginx/access-lists" });
  });
});

describe("npmService.testConnection", () => {
  it("returns ok with a joined version string", async () => {
    f.mockResolvedValue({ version: [2, 11, 1] });
    const res = await npmService.testConnection();
    expect(f).toHaveBeenCalledWith({ path: "/" });
    expect(res).toEqual({ ok: true, message: "Connection OK.", version: "2.11.1" });
  });

  it("returns a friendly failure on NpmError", async () => {
    f.mockRejectedValue(new NpmError("Nginx Proxy Manager rejected the email/password.", "INVALID_CREDENTIALS"));
    const res = await npmService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/rejected/);
  });
});
