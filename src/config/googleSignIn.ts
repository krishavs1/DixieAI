import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure Google Sign-In at module level (like in the YouTube tutorial)
GoogleSignin.configure({
  webClientId: '440630945257-d3gbupl3uaafv10sib53r2q6eh4mqpku.apps.googleusercontent.com', // Web client ID
  iosClientId: '440630945257-da4rqdkj9u79e7ufb8e3063bs35ilbcc.apps.googleusercontent.com', // iOS client ID
  scopes: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
  offlineAccess: true,
});

export { GoogleSignin }; 