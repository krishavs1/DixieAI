// Helper function to get the local IP address
const getLocalIPAddress = (): string => {
  // Common local IP ranges - you can add more if needed
  const possibleIPs = [
    '192.168.1.209', // Your current IP
    '172.20.214.39', // Your previous IP
    'localhost',
    '127.0.0.1',
  ];
  
  // For now, return the current working IP
  // In a production app, you might want to implement dynamic IP detection
  return '192.168.1.209';
};

export const API_CONFIG = {
  BASE_URL: __DEV__ ? `http://${getLocalIPAddress()}:3000` : 'https://your-backend-url.com',
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