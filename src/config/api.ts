import { Platform } from 'react-native';

// Cache for backend URL to prevent multiple network requests
let cachedBackendURL: string | null = null;

// Simplified backend URL resolver with better error handling
const getBackendURL = async (): Promise<string> => {
  // Return cached URL if available
  if (cachedBackendURL) {
    return cachedBackendURL;
  }
  if (!__DEV__) {
    return 'https://dixieai.onrender.com';
  }

  const port = 3000;
  
  // For physical device, try the most likely IPs
  const possibleURLs = [
    'http://192.168.1.209:3000',  // Your current WiFi IP
    'http://172.20.214.39:3000',  // Previous WiFi IP
    'http://localhost:3000',      // Local fallback
  ];
  
  // Test each URL with better error handling
  for (const url of possibleURLs) {
    try {
      console.log(`Testing backend at: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced timeout to 3 seconds
      
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`✅ Backend found at: ${url}`);
        cachedBackendURL = url; // Cache the successful URL
        return url;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ Backend failed at: ${url} - ${errorMessage}`);
      // Don't throw, just continue to next URL
    }
  }
  
  // If all fail, return the most likely one without crashing
  console.log(`⚠️ No backend found, using fallback URL: ${possibleURLs[0]}`);
  cachedBackendURL = possibleURLs[0]; // Cache the fallback URL
  return possibleURLs[0];
};

// Function to clear the cache (useful when network changes)
export const clearBackendURLCache = () => {
  cachedBackendURL = null;
  console.log('🔄 Backend URL cache cleared');
};

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
  TIMEOUT: 60000, // 60 seconds - increased for AI classification of 50 emails
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