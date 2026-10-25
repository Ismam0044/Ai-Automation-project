import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipv4Number(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets.reduce((value, part) => value * 256 + part, 0);
}

function inIpv4Range(value, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicIpv4(address) {
  const value = ipv4Number(address);
  if (value === null) return false;
  const blocked = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) => inIpv4Range(value, ipv4Number(base), prefix));
}

function parseIpv6(address) {
  const normalized = address.toLowerCase().split("%", 1)[0];
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  let input = normalized;
  if (ipv4Tail) {
    const number = ipv4Number(ipv4Tail[1]);
    if (number === null) return null;
    const tail = [((number >>> 16) & 0xffff).toString(16), (number & 0xffff).toString(16)];
    input = normalized.slice(0, normalized.length - ipv4Tail[1].length) + tail.join(":");
  }

  const doubleColon = input.includes("::");
  const parts = input.split("::");
  if (parts.length > 2) return null;
  const parseSide = (side) => side ? side.split(":").map((group) => /^[\da-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : NaN) : [];
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] ?? "");
  if ([...left, ...right].some((group) => !Number.isInteger(group))) return null;
  let groups;
  if (doubleColon) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill(0), ...right];
  } else {
    groups = left;
    if (groups.length !== 8) return null;
  }
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function isPublicIpv6(address) {
  const value = parseIpv6(address);
  if (value === null) return false;
  const prefix = (bits, length) => value >> BigInt(128 - length) === BigInt(bits);
  if (value === 0n || value === 1n) return false;
  if (value >> 32n === 0xffffn) {
    const embedded = Number(value & 0xffffffffn);
    return isPublicIpv4([
      (embedded >>> 24) & 255,
      (embedded >>> 16) & 255,
      (embedded >>> 8) & 255,
      embedded & 255,
    ].join("."));
  }
  if (value >> 32n === 0n) return false;
  // 6to4 embeds IPv4 in bits 16-48; Teredo complements the client IPv4 in
  // the final 32 bits. Classify the embedded value as well, then reject both
  // transition mechanisms regardless: this service never needs IPv4 tunnels.
  if (prefix(0x2002n, 16)) {
    const embedded = Number((value >> 80n) & 0xffffffffn);
    isPublicIpv4([embedded >>> 24, (embedded >>> 16) & 255, (embedded >>> 8) & 255, embedded & 255].join("."));
    return false;
  }
  if (prefix(0x20010000n, 32)) {
    const embedded = Number((~value) & 0xffffffffn);
    isPublicIpv4([embedded >>> 24, (embedded >>> 16) & 255, (embedded >>> 8) & 255, embedded & 255].join("."));
    return false;
  }
  // IETF protocol assignments, benchmarking, deprecated/identifier ranges,
  // documentation, and the newer 3fff::/20 documentation allocation.
  if (prefix(0x100080n, 23) || prefix(0x200100020000n, 48)
      || prefix(0x2001001n, 28) || prefix(0x2001002n, 28)
      || prefix(0x2001003n, 28) || prefix(0x20010db8n, 32)
      || prefix(0x3fff0n, 20)) return false;
  // Accept only global-unicast 2000::/3. This excludes unspecified, loopback,
  // link-local, unique-local, multicast, and other special-purpose ranges.
  return prefix(0x1n, 3);
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isAllowedPrivateDemoAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return inIpv4Range(value, ipv4Number("127.0.0.0"), 8);
  }
  if (family === 6) {
    const value = parseIpv6(address);
    return value === 1n;
  }
  return false;
}

function privateDemoTargetsDisabled() {
  const error = new TypeError("Loopback demo targets are disabled. Set ALLOW_PRIVATE_TARGETS=true in development to enable them.");
  error.code = "PRIVATE_TARGETS_DISABLED";
  return error;
}

export function createPublicUrlValidator({ lookup = dnsLookup, allowPrivateTargets = false, returnDetails = false } = {}) {
  return async function validatePublicUrl(input) {
    if (typeof input !== "string" || input.length > 2048) {
      throw new TypeError("URL must be a string of at most 2048 characters.");
    }

    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new TypeError("URL must be a valid absolute HTTP or HTTPS URL.");
    }
    if (!(["http:", "https:"].includes(parsed.protocol))) {
      throw new TypeError("Only HTTP and HTTPS URLs are allowed.");
    }
    if (parsed.username || parsed.password) {
      throw new TypeError("URLs must not contain credentials.");
    }
    if (!allowPrivateTargets && parsed.port && parsed.port !== (parsed.protocol === "https:" ? "443" : "80")) {
      throw new TypeError("Only the standard HTTP and HTTPS ports are allowed.");
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const hostnameForCheck = hostname.replace(/\.$/, "");
    const isLoopbackName = hostnameForCheck === "localhost" || hostnameForCheck.endsWith(".localhost");
    if (!allowPrivateTargets && isLoopbackName) throw privateDemoTargetsDisabled();
    const directAddressFamily = isIP(hostnameForCheck);
    if (!allowPrivateTargets && directAddressFamily && isAllowedPrivateDemoAddress(hostnameForCheck)) {
      throw privateDemoTargetsDisabled();
    }
    if (!allowPrivateTargets && parsed.port && parsed.port !== (parsed.protocol === "https:" ? "443" : "80")) {
      throw new TypeError("Only the standard HTTP and HTTPS ports are allowed.");
    }
    if (!hostnameForCheck || (!allowPrivateTargets && !isIP(hostnameForCheck) && !hostnameForCheck.includes("."))
        || hostnameForCheck.endsWith(".local") || hostnameForCheck.endsWith(".internal")
        || hostnameForCheck.endsWith(".test") || hostnameForCheck.endsWith(".example")
        || hostnameForCheck.endsWith(".invalid") || hostnameForCheck === "home.arpa"
        || hostnameForCheck.endsWith(".home.arpa")) {
      throw new TypeError("URL host must resolve only to public IP addresses.");
    }

    const family = directAddressFamily;
    let addresses;
    if (family) {
      addresses = [hostnameForCheck];
    } else {
      try {
        addresses = (await lookup(`${hostnameForCheck}.`, { all: true, verbatim: true })).map((result) => result.address);
      } catch {
        throw new TypeError("URL host must resolve only to public IP addresses.");
      }
    }
    if (!allowPrivateTargets && addresses.some((address) => isAllowedPrivateDemoAddress(address))) {
      throw privateDemoTargetsDisabled();
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address)
        && !(allowPrivateTargets && (isAllowedPrivateDemoAddress(address) || (isLoopbackName && isIP(address) === 4
          && isAllowedPrivateDemoAddress(address)))))) {
      throw new TypeError("URL host must resolve only to public IP addresses.");
    }

    parsed.hash = "";
    if (returnDetails) {
      return { url: parsed, normalizedUrl: parsed.toString(), hostname: hostnameForCheck, addresses: [...new Set(addresses)] };
    }
    return parsed.toString();
  };
}

export const validatePublicUrl = createPublicUrlValidator();
