import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "cbnest:dashboard:v1";

export async function readDashboardCache<T>(role: "resident" | "security", userId: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}:${role}:${userId}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export async function writeDashboardCache<T>(role: "resident" | "security", userId: string, value: T): Promise<void> {
  try {
    const key = `${PREFIX}:${role}:${userId}`;
    const previous = await AsyncStorage.getItem(key);
    const existing = previous ? JSON.parse(previous) as object : {};
    await AsyncStorage.setItem(key, JSON.stringify({ ...existing, ...value as object, cachedAt: Date.now() }));
  } catch {
    // Cache failures must never block dashboard access.
  }
}

export async function clearDashboardCache(role: "resident" | "security", userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PREFIX}:${role}:${userId}`);
  } catch {
    // Sign-out must continue even if local cache cleanup fails.
  }
}


// Field-level entries have independent expiry times so refreshing a profile
// never makes an old wallet balance appear fresh (or vice versa).
type CacheEntry<T> = { value: T; cachedAt: number };

export async function readDashboardCacheValue<T>(role: "resident" | "security", userId: string, field: string, maxAgeMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}:${role}:${userId}`);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const entries = stored.cacheEntries as Record<string, CacheEntry<T>> | undefined;
    const entry = entries?.[field];
    if (!entry || typeof entry.cachedAt !== "number" || Date.now() - entry.cachedAt > maxAgeMs) return null;
    return entry.value;
  } catch { return null; }
}

export async function writeDashboardCacheValue<T>(role: "resident" | "security", userId: string, field: string, value: T): Promise<void> {
  try {
    const key = `${PREFIX}:${role}:${userId}`;
    const previous = await AsyncStorage.getItem(key);
    const existing = previous ? JSON.parse(previous) as Record<string, unknown> : {};
    const entries = (existing.cacheEntries && typeof existing.cacheEntries === "object" ? existing.cacheEntries : {}) as Record<string, CacheEntry<unknown>>;
    await AsyncStorage.setItem(key, JSON.stringify({ ...existing, cacheEntries: { ...entries, [field]: { value, cachedAt: Date.now() } } }));
  } catch { /* Cache failures must never block app access or payments. */ }
}


export async function clearDashboardCacheValue(role: "resident" | "security", userId: string, field: string): Promise<void> {
  try {
    const key = `${PREFIX}:${role}:${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const existing = JSON.parse(raw) as Record<string, unknown>;
    const entries = (existing.cacheEntries && typeof existing.cacheEntries === "object" ? existing.cacheEntries : {}) as Record<string, unknown>;
    delete entries[field];
    await AsyncStorage.setItem(key, JSON.stringify({ ...existing, cacheEntries: entries }));
  } catch { /* Cache invalidation must never block a confirmed payment. */ }
}
