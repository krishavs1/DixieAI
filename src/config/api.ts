import { Platform } from 'react-native';

// Simplified backend URL resolver
const getBackendURL = async (): Promise<string> => {
  if (!__DEV__) {
    return 'https://your-backend-url.com';
  }

  const port = 3000;
  
  // For physical device, try the most likely IPs
  const possibleURLs = [
    'http://192.168.1.209:3000',  // Your new WiFi IP
    'http://172.20.214.39:3000',  // Your previous IP
    'http://localhost:3000',      // Fallback
  ];
  
  // Test each URL
  for (const url of possibleURLs) {
    try {
      console.log(`Testing backend at: ${url}`);
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (response.ok) {
        console.log(`✅ Backend found at: ${url}`);
        return url;
      }
    } catch (error) {
      console.log(`❌ Backend failed at: ${url}`);
    }
  }
  
  // If all fail, return the most likely one
  console.log(`⚠️ No backend found, using fallback URL: ${possibleURLs[0]}`);
  return possibleURLs[0];
};

// Function to clear the cache (useful when network changes)
export const clearBackendURLCache = () => {
  // This function is no longer needed as caching is removed
  console.log('🔄 Backend URL cache cleared (no longer applicable)');
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