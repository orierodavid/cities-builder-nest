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
    await AsyncStorage.setItem(`${PREFIX}:${role}:${userId}`, JSON.stringify({ ...value as object, cachedAt: Date.now() }));
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
