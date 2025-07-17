import { Platform } from 'react-native';

// Dynamic IP detection for development
const getLocalIPAddress = (): string => {
  // In React Native, we can't directly access network interfaces
  // So we'll use a smart approach with multiple fallbacks
  
  // For development, we'll try common local IP patterns
  // and let the health check determine which one works
  
  const possibleIPs = [
    '172.20.214.39', // Your current IP
    '192.168.1.209', // Your previous IP
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '192.168.0.1',
    '192.168.1.1',
  ];
  
  // For now, return the most likely one
  // The health check will determine if it's correct
  return '172.20.214.39';
};

// Cache for the discovered backend URL
let cachedBackendURL: string | null = null;
let lastDiscoveryTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Dynamic backend URL resolver with caching
const getBackendURL = async (): Promise<string> => {
  // Return cached URL if it's still valid
  if (cachedBackendURL && (Date.now() - lastDiscoveryTime) < CACHE_DURATION) {
    return cachedBackendURL;
  }

  if (!__DEV__) {
    return 'https://your-backend-url.com';
  }

  const port = 3000;
  
  // For iOS simulator, prioritize localhost since it can't access local network IPs
  const isIOSSimulator = Platform.OS === 'ios' && __DEV__;
  
  if (isIOSSimulator) {
    // iOS simulator can only access localhost
    const localhostURL = `http://localhost:${port}`;
    try {
      const response = await fetch(`${localhostURL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      
      if (response.ok) {
        console.log(`✅ Backend found at localhost (iOS simulator): ${localhostURL}`);
        cachedBackendURL = localhostURL;
        lastDiscoveryTime = Date.now();
        return localhostURL;
      }
    } catch (error) {
      console.log(`❌ Localhost failed for iOS simulator: ${localhostURL}`);
    }
  }
  
  const baseIP = getLocalIPAddress();
  
  // Try the current IP first
  const primaryURL = `http://${baseIP}:${port}`;
  
  // If that fails, we'll try other common IPs
  const fallbackIPs = [
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '192.168.0.1',
    '192.168.1.1',
  ];
  
  // Test if primary URL is reachable
  try {
    const response = await fetch(`${primaryURL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    
    if (response.ok) {
      console.log(`✅ Backend found at: ${primaryURL}`);
      cachedBackendURL = primaryURL;
      lastDiscoveryTime = Date.now();
      return primaryURL;
    }
  } catch (error) {
    console.log(`❌ Primary URL failed: ${primaryURL}`);
  }
  
  // Try fallback IPs
  for (const ip of fallbackIPs) {
    if (ip === baseIP) continue; // Skip if it's the same as primary
    
    const fallbackURL = `http://${ip}:${port}`;
    try {
      const response = await fetch(`${fallbackURL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        console.log(`✅ Backend found at fallback: ${fallbackURL}`);
        cachedBackendURL = fallbackURL;
        lastDiscoveryTime = Date.now();
        return fallbackURL;
      }
    } catch (error) {
      console.log(`❌ Fallback URL failed: ${fallbackURL}`);
    }
  }
  
  // If all else fails, return localhost for iOS simulator, primary URL for others
  const fallbackURL = isIOSSimulator ? `http://localhost:${port}` : primaryURL;
  console.log(`⚠️ No backend found, using fallback URL: ${fallbackURL}`);
  cachedBackendURL = fallbackURL;
  lastDiscoveryTime = Date.now();
  return fallbackURL;
};

// Function to clear the cache (useful when network changes)
export const clearBackendURLCache = () => {
  cachedBackendURL = null;
  lastDiscoveryTime = 0;
  console.log('🔄 Backend URL cache cleared');
};

// Clear cache on import to force rediscovery
clearBackendURLCache();

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
  TIMEOUT: 30000, // 30 seconds - increased for Gmail API calls
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