import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// 中文注释：防 SSRF —— 校验用户可控的出站 URL（AI Provider baseUrl），拒绝私有/回环/链路本地/元数据地址。
// 已知残留风险：DNS rebinding（校验时解析到公网 IP，紧接着 fetch 内部第二次解析拿到攻击者切换后的内网 IP）
// 需要连接钉 IP 才能完全堵死，这里不做，风险已评估为可接受。

const FORBIDDEN_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isForbiddenIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return FORBIDDEN_IPV4_RANGES.some(([base, prefix]) => {
    const baseValue = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (baseValue & mask);
  });
}

// 中文注释：IPv6 用 8 个 16bit 分组的 number[] 表示，避免依赖 BigInt 字面量（tsconfig target 是 ES2017）
function parseIPv6Groups(ip: string): number[] {
  // 处理 "::ffff:127.0.0.1" 这种末尾带点分十进制 IPv4 的写法，转成两个十六进制分组再展开
  const dottedQuad = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  let normalized = ip;
  if (dottedQuad) {
    const parts = dottedQuad[1].split(".").map((part) => Number.parseInt(part, 10));
    const hi = ((parts[0] << 8) | parts[1]).toString(16);
    const lo = ((parts[2] << 8) | parts[3]).toString(16);
    normalized = `${ip.slice(0, dottedQuad.index)}${hi}:${lo}`;
  }

  const [head, tail] = normalized.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];

  if (normalized.includes("::")) {
    const missing = 8 - headParts.length - tailParts.length;
    return [...headParts, ...Array(missing).fill("0"), ...tailParts].map((group) =>
      Number.parseInt(group || "0", 16),
    );
  }

  return normalized.split(":").map((group) => Number.parseInt(group || "0", 16));
}

function matchesIPv6Prefix(groups: number[], baseHex: string, prefixBits: number): boolean {
  const baseGroups = parseIPv6Groups(baseHex);
  const fullGroups = Math.floor(prefixBits / 16);

  for (let index = 0; index < fullGroups; index += 1) {
    if (groups[index] !== baseGroups[index]) return false;
  }

  const remainderBits = prefixBits % 16;
  if (remainderBits > 0) {
    const mask = (0xffff << (16 - remainderBits)) & 0xffff;
    if ((groups[fullGroups] & mask) !== (baseGroups[fullGroups] & mask)) return false;
  }

  return true;
}

const FORBIDDEN_IPV6_RANGES: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

function isForbiddenIPv6(ip: string): boolean {
  const groups = parseIPv6Groups(ip);

  // ::ffff:0:0/96 — IPv4-mapped，解开后按 IPv4 规则再判一次
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const ipv4 = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ].join(".");
    return isForbiddenIPv4(ipv4);
  }

  return FORBIDDEN_IPV6_RANGES.some(([baseHex, prefixBits]) => matchesIPv6Prefix(groups, baseHex, prefixBits));
}

function assertAllowedIp(ip: string): void {
  const family = isIP(ip);
  if (family === 4 && isForbiddenIPv4(ip)) {
    throw new Error(`Outbound requests to private or reserved address "${ip}" are not allowed.`);
  }
  if (family === 6 && isForbiddenIPv6(ip)) {
    throw new Error(`Outbound requests to private or reserved address "${ip}" are not allowed.`);
  }
  if (family === 0) {
    throw new Error(`"${ip}" is not a valid IP address.`);
  }
}

let warnedAboutSkippedDnsCheck = false;

export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`"${rawUrl}" is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL scheme "${url.protocol}" is not allowed. Use http or https.`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    assertAllowedIp(hostname);
    return;
  }

  // 中文注释：部分本地开发环境（企业 VPN / 网络安全代理等）会把所有域名的 DNS 应答
  // 重写成一个占位 IP（实际 TCP 连接仍然透明转发到真实目标），这种情况下按解析结果
  // 做私网校验会把所有域名都误判成内网地址。只在 `next dev`（NODE_ENV=development）
  // 下跳过 DNS 解析这一步 —— 测试环境（vitest 的 NODE_ENV=test）和生产部署
  // （Dockerfile 里固定 NODE_ENV=production）都不受影响，仍然强制校验。
  if (process.env.NODE_ENV === "development") {
    if (!warnedAboutSkippedDnsCheck) {
      warnedAboutSkippedDnsCheck = true;
      console.warn(
        "[url-guard] NODE_ENV is not \"production\" — skipping DNS-based private-IP validation for outbound AI provider requests.",
      );
    }
    return;
  }

  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    assertAllowedIp(record.address);
  }
}

const MAX_REDIRECTS = 5;

// 中文注释：不能简单地跟随自动跳转（会给攻击者一个"先过校验的公网地址，再 30x 跳到内网"的
// 绕过口子），也不能一刀切拒绝跳转（真实存在的 Provider 网关会用 30x 做请求转发，
// 完全禁用会直接把这类 Provider 打挂）。这里手动跟跳转，但每一跳都重新过一次
// assertSafeOutboundUrl，跳转次数封顶，两头都不牺牲。
export async function guardedFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafeOutboundUrl(currentUrl);
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect ? response.headers.get("location") : null;
    if (!location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) while fetching outbound URL.`);
}
