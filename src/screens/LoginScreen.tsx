import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/authStore';
import { showMessage } from 'react-native-flash-message';

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');

const LoginScreen = () => {
  const { login } = useAuthStore();

  // Create the OAuth request
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: 'YOUR_GOOGLE_CLIENT_ID', // TODO: Replace with your actual client ID
      scopes: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      responseType: AuthSession.ResponseType.Code,
      redirectUri: AuthSession.makeRedirectUri({
        scheme: 'dixie-ai',
        preferLocalhost: true,
      }),
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      console.log('OAuth success, code:', code);
      
      // Here you would normally exchange the code for tokens with your backend
      // For now, we'll do a mock login
      login({
        id: 'google-user',
        name: 'Google User',
        email: 'user@gmail.com',
        picture: '',
      }, {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
      
      showMessage({
        message: 'Google Sign-In successful!',
        type: 'success',
      });
    }
  }, [response, login]);

  const handleGoogleLogin = async () => {
    try {
      if (!request) {
        Alert.alert('Error', 'OAuth request not ready. Please try again.');
        return;
      }

      const result = await promptAsync();
      if (result.type === 'cancel') {
        showMessage({
          message: 'Sign-in cancelled',
          type: 'info',
        });
      } else if (result.type === 'error') {
        console.error('Auth error:', result.error);
        showMessage({
          message: 'Authentication failed. Please try again.',
          type: 'danger',
        });
      }
    } catch (error) {
      console.error('Auth error:', error);
      showMessage({
        message: 'Authentication failed. Please try again.',
        type: 'danger',
      });
    }
  };

  const handleDemoLogin = () => {
    Alert.alert(
      'Demo Mode',
      'This will log you in with demo data so you can explore the app features.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue with Demo', 
          onPress: () => {
            login({
              id: 'demo-user',
              name: 'Demo User',
              email: 'demo@example.com',
              picture: '',
            }, {
              accessToken: 'demo-access-token',
              refreshToken: 'demo-refresh-token',
            });
            showMessage({
              message: 'Demo mode activated!',
              type: 'success',
            });
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="mail" size={64} color="#4285F4" />
        </View>
        <Text style={styles.title}>Dixie AI</Text>
        <Text style={styles.subtitle}>Your intelligent email assistant</Text>
      </View>

      <View style={styles.features}>
        <View style={styles.feature}>
          <Ionicons name="chatbubble-outline" size={24} color="#666" />
          <Text style={styles.featureText}>Chat with your inbox</Text>
        </View>
        <View style={styles.feature}>
          <Ionicons name="mic-outline" size={24} color="#666" />
          <Text style={styles.featureText}>Voice commands</Text>
        </View>
        <View style={styles.feature}>
          <Ionicons name="bulb-outline" size={24} color="#666" />
          <Text style={styles.featureText}>Smart summaries</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleGoogleLogin}
          disabled={!request}
        >
          <Ionicons name="logo-google" size={20} color="#FFF" />
          <Text style={styles.loginButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.demoButton}
          onPress={handleDemoLogin}
        >
          <Ionicons name="play" size={20} color="#4285F4" />
          <Text style={styles.demoButtonText}>Try Demo Mode</Text>
        </TouchableOpacity>
        
        <Text style={styles.disclaimer}>
          By continuing, you agree to grant Dixie access to your Gmail account
          to provide intelligent email assistance.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  features: {
    paddingVertical: 40,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  bottom: {
    paddingBottom: 50,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4285F4',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 24,
  },
  demoButtonText: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default LoginScreen; 