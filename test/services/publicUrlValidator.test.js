import assert from "node:assert/strict";
import test from "node:test";
import { createPublicUrlValidator, isPublicAddress } from "../../src/services/publicUrlValidator.js";

test("public address classifier rejects reserved IPv4 and IPv6 ranges", () => {
  for (const address of [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:192.168.1.1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "fc00::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1",
    "2002:7f00:0001::", "2002:0808:0808::", "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
    "2001:2::1", "2001:20::1", "3fff::1",
  ]) assert.equal(isPublicAddress(address), false, address);

  for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test("private target mode is explicit and limited to loopback demo addresses", async () => {
  const validator = createPublicUrlValidator({ allowPrivateTargets: true });
  assert.match(await validator("http://127.0.0.1:4010/health"), /127\.0\.0\.1:4010/);
  await assert.rejects(validator("http://10.0.0.1:4010/health"), /public IP addresses/);
  await assert.rejects(validator("http://192.168.1.1:4010/health"), /public IP addresses/);
  await assert.rejects(validator("http://169.254.169.254/"), /public IP addresses/);
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
    "http://localhost/", "http://localhost./", "http://service.local/", "http://intranet/", "http://127.0.0.1/",
    "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/",
    "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fc00::1]/",
    "ftp://public.example.org/", "gopher://public.example.org/", "https://user:pass@public.example.org/",
    "https://public.example.org:8443/", "file:///etc/passwd", "not a url",
    `https://public.example.org/${"x".repeat(2050)}`,
  ]) await assert.rejects(validator(url), TypeError, url);
});
