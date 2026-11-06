export function trustedProxyHops(raw: string | undefined, nodeEnv: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return nodeEnv === "production" ? 1 : 0;
  if (!/^\d+$/.test(raw.trim())) return 0;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0 && value <= 5 ? value : 0;
}
