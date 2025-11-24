import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_URL = 'https://dixieai.onrender.com';
const ENV_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL;

// Cache for backend URL to prevent multiple network requests
let cachedBackendURL: string | null = null;

const resolveExpoHost = (): string | null => {
  try {
    const manifest2: any = (Constants as any)?.manifest2;
    const manifest: any = (Constants as any)?.manifest;
    const expoConfig: any = (Constants as any)?.expoConfig;
    const expoGoConfig: any = (Constants as any)?.expoGoConfig;

    const debuggerHost =
      manifest2?.extra?.expoGo?.debuggerHost ||
      manifest2?.extra?.expoGo?.hostUri ||
      manifest?.debuggerHost ||
      manifest?.hostUri ||
      expoConfig?.hostUri ||
      expoConfig?.extra?.expoGo?.hostUri ||
      expoGoConfig?.hostUri ||
      expoGoConfig?.debuggerHost;

    if (!debuggerHost || typeof debuggerHost !== 'string') {
      return null;
    }

    return debuggerHost.split(':')[0] || null;
  } catch (error) {
    console.log('⚠️ Unable to resolve Expo host automatically:', error);
    return null;
  }
};

const buildDevCandidateUrls = (): string[] => {
  const candidates = new Set<string>();
  const expoHost = resolveExpoHost();

  if (expoHost) {
    candidates.add(`http://${expoHost}:3000`);
  }

  candidates.add('http://localhost:3000');
  candidates.add('http://127.0.0.1:3000');

  if (Platform.OS === 'android') {
    candidates.add('http://10.0.2.2:3000'); // Android emulator alias for localhost
    candidates.add('http://10.0.3.2:3000'); // Genymotion alias
  }

  // Some previously used LAN IPs that might still be valid
  candidates.add('http://192.168.1.195:3000');
  candidates.add('http://192.168.1.209:3000');
  candidates.add('http://172.20.214.39:3000');

  // Allow override via env var
  if (ENV_BACKEND_URL && ENV_BACKEND_URL.startsWith('http')) {
    try {
      const url = new URL(ENV_BACKEND_URL);
      if (url.port) {
        candidates.add(`${url.protocol}//${url.hostname}:${url.port}`);
      } else {
        candidates.add(`${url.protocol}//${url.hostname}:3000`);
      }
    } catch {
      // ignore malformed env override
    }
  }

  return Array.from(candidates);
};

const testBackendUrl = async (url: string, timeoutMs = 3000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`Backend failed at: ${url} - ${message}`);
    return false;
  }
};

// Simplified backend URL resolver with better error handling
export const getBackendURL = async (): Promise<string> => {
  // Return cached URL if available
  if (cachedBackendURL) {
    return cachedBackendURL;
  }

  // Explicit override via environment variable wins
  if (ENV_BACKEND_URL) {
    cachedBackendURL = ENV_BACKEND_URL;
    console.log(`🔧 Using backend URL from environment: ${ENV_BACKEND_URL}`);
    return cachedBackendURL;
  }

  // Force production URL (Render backend) - skip localhost checking
  cachedBackendURL = PRODUCTION_URL;
  console.log(`🔧 Using Render backend: ${PRODUCTION_URL}`);
  return PRODUCTION_URL;

  // Commented out localhost checking - uncomment if you need local dev
  /*
  if (!__DEV__) {
    cachedBackendURL = PRODUCTION_URL;
    return PRODUCTION_URL;
  }

  const candidateUrls = buildDevCandidateUrls();

  for (const url of candidateUrls) {
    console.log(`Testing backend at: ${url}`);
    const isReachable = await testBackendUrl(url);
    if (isReachable) {
      console.log(`✅ Backend found at: ${url}`);
      cachedBackendURL = url;
      return url;
    }
  }

  console.log('⚠️ No local backend found, falling back to production URL');
  cachedBackendURL = PRODUCTION_URL;
  return PRODUCTION_URL;
  */
};

// Function to clear the cache (useful when network changes)
export const clearBackendURLCache = () => {
  cachedBackendURL = null;
  console.log('🔄 Backend URL cache cleared');
};

// Clear cache on import to ensure fresh resolution
clearBackendURLCache();

// Clear cache on import to force rediscovery
// clearBackendURLCache(); // Removed since we simplified caching

export const API_CONFIG = {
  get BASE_URL() {
    // This will be resolved dynamically
    return getBackendURL();
  },
  ENDPOINTS: {
    AUTH: {
      GOOGLE_URL: '/api/auth/google/url',
      GOOGLE_CALLBACK: '/api/auth/google/callback',
      REFRESH: '/api/auth/refresh',
    },
    EMAIL: {
      THREADS: '/api/email/threads',
      THREAD: '/api/email/threads',
      SEND: '/api/email/send',
    },
  },
  TIMEOUT: 60000,
};

export const GOOGLE_CONFIG = {
  CLIENT_ID: '440630945257-d3qbupl3uaafv10sib53r2q6eh4mqpku.apps.googleusercontent.com', // Match backend client ID
  SCOPES: [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  REDIRECT_URI: 'dixie-ai://oauth',
}; 