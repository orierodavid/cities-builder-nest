import Constants from 'expo-constants';
import { Platform } from 'react-native';

const configured = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

export function getApiBaseUrl(): string {
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (Platform.OS !== 'web' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
      const lanHost = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
      if (lanHost) url.hostname = lanHost;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}
