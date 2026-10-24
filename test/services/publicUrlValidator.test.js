import assert from "node:assert/strict";
import test from "node:test";
import { createPublicUrlValidator, isPublicAddress } from "../../src/services/publicUrlValidator.js";

test("public address classifier rejects reserved IPv4 and IPv6 ranges", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:192.168.1.1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1",
  ]) assert.equal(isPublicAddress(address), false, address);

  for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test("URL validator accepts HTTP(S) hosts only when DNS results are all public", async () => {
  const validator = createPublicUrlValidator({
    async lookup(hostname, options) {
      assert.deepEqual(options, { all: true, verbatim: true });
      hostname = hostname.replace(/\.$/, "");
      if (hostname === "public.example.org") return [{ address: "93.184.216.34", family: 4 }];
      if (hostname === "mixed.example.org") return [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ];
      throw new Error("DNS lookup failed");
    },
  });

  assert.equal(await validator("https://public.example.org/api#fragment"), "https://public.example.org/api");
  await assert.rejects(validator("https://mixed.example.org"), /public IP addresses/);
  await assert.rejects(validator("https://unresolvable.example.org"), /public IP addresses/);
});

test("URL validator rejects local hosts, credentials, unsafe schemes, ports, and direct private IPs", async () => {
  const validator = createPublicUrlValidator({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] });
  for (const url of [
    "http://localhost/", "http://localhost./", "http://service.local/", "http://intranet/", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[fc00::1]/", "ftp://public.example.org/", "https://user:pass@public.example.org/",
    "https://public.example.org:8443/", "file:///etc/passwd", "not a url",
  ]) await assert.rejects(validator(url), TypeError, url);
});
