const configured = (process.env.EXPO_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0" || host === "::") return true;
  const parts = host.split(".");
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
    const octets = parts.map(Number);
    if (octets.some(part => part < 0 || part > 255)) return true;
    return octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 169 && octets[1] === 254);
  }
  return false;
}

export function getApiBaseUrl(): string {
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || isPrivateOrLocalHost(url.hostname)) return "";
    if (url.username || url.password) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}
