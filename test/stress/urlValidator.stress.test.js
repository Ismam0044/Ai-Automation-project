import assert from "node:assert/strict";
import test from "node:test";
import { createPublicUrlValidator, isPublicAddress } from "../../src/services/publicUrlValidator.js";

const cases = [
  ...["0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.254", "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.255.255.254",
    "169.254.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.254", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.19.255.254", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.254", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fdff:ffff::1", "fe80::1", "febf:ffff::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:8.8.8.8", "2002:7f00:1::", "2002:0808:0808::", "2001:0000:4136:e378:8000:63bf:3fff:fdd2", "64:ff9b::7f00:1",
    "2001:db8::1", "2001:2::1", "2001:20::1", "3fff::1", "2001:4860:4860::8888", "2606:4700:4700::1111", "8.8.8.8", "1.1.1.1",
    "93.184.216.34", "208.67.222.222", "9.9.9.9", "4.2.2.2", "8.8.4.4"].map((address) => ({
    name: `address classification ${address}`, input: address,
    expected: ["8.8.8.8", "1.1.1.1", "93.184.216.34", "208.67.222.222", "9.9.9.9", "4.2.2.2", "8.8.4.4", "2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"].includes(address),
  })),
];

for (const entry of cases) {
  test(`stress IP classifier: ${entry.name}`, () => assert.equal(isPublicAddress(entry.input), entry.expected));
}

const urlCases = [
  ["credentials", "https://user:pass@example.com/", false], ["ftp scheme", "ftp://example.com/", false],
  ["file scheme", "file:///etc/passwd", false], ["gopher scheme", "gopher://example.com/", false],
  ["localhost", "http://localhost/", false], ["localhost trailing dot", "http://localhost./", false],
  ["nonstandard port", "https://public.example.org:8443/", false], ["standard port", "https://public.example.org:443/", true],
  ["too long", `https://example.com/${"x".repeat(2050)}`, false], ["single label", "http://intranet/", false],
  ["numeric loopback", "http://2130706433/", false], ["hex loopback", "http://0x7f000001/", false], ["octal loopback", "http://0177.0.0.1/", false],
];
const validator = createPublicUrlValidator({ lookup: async (hostname) => {
  if (hostname.startsWith("mixed-")) return [{ address: "8.8.8.8" }, { address: "10.0.0.1" }];
  if (hostname.startsWith("public.")) return [{ address: "8.8.8.8" }];
  throw new Error("unresolvable");
} });
for (let index = 0; urlCases.length < 50; index += 1) {
  urlCases.push([`mixed DNS rejection ${index + 1}`, `https://mixed-${index}.example.org/`, false]);
}
for (const [name, input, expected] of urlCases) {
  test(`stress URL validator: ${name}`, async () => {
  if (expected) assert.equal(await validator(input), new URL(input).toString());
    else await assert.rejects(validator(input), TypeError);
  });
}
