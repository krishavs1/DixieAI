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
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuthStore } from '../store/authStore';
import { apiService } from '../services/api';
import { showMessage } from 'react-native-flash-message';
import { API_CONFIG } from '../config/api';

const { width } = Dimensions.get('window');

const LoginScreen = () => {
  const { login } = useAuthStore();

  useEffect(() => {
    // Configure Google Sign-In
    GoogleSignin.configure({
      webClientId: '440630945257-d3gbupl3uaafv10sib53r2q6eh4mqpku.apps.googleusercontent.com',
      offlineAccess: true,
      hostedDomain: '',
      forceCodeForRefreshToken: true,
      accountName: '',
      iosClientId: '440630945257-d3gbupl3uaafv10sib53r2q6eh4mqpku.apps.googleusercontent.com',
      googleServicePlistPath: '',
    });
  }, []);

  const handleGoogleLogin = async () => {
    try {
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices();
      
      // Sign in with Google
      const userInfo = await GoogleSignin.signIn();
      
      // Get the access token
      const tokens = await GoogleSignin.getTokens();
      
      console.log('Google sign-in successful:', userInfo);
      console.log('Tokens:', tokens);
      
      // Send the access token to backend for verification
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/google/mobile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: tokens.accessToken,
          idToken: tokens.idToken,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Backend authentication failed');
      }

      const authData = await response.json();

      // Login with the received data
      await login(authData.token, authData.user);
      
      showMessage({
        message: 'Google Sign-In successful!',
        type: 'success',
      });
      
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        showMessage({
          message: 'Sign-in cancelled',
          type: 'info',
        });
      } else if (error.code === statusCodes.IN_PROGRESS) {
        showMessage({
          message: 'Sign-in already in progress',
          type: 'info',
        });
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        showMessage({
          message: 'Google Play Services not available',
          type: 'danger',
        });
      } else {
        showMessage({
          message: 'Authentication failed. Please try again.',
          type: 'danger',
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Logo Section */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>DixieAI</Text>
        <Text style={styles.subtitle}>Your AI Email Assistant</Text>
      </View>

      {/* Login Button */}
      <View style={styles.loginContainer}>
        <TouchableOpacity 
          style={styles.googleButton}
          onPress={handleGoogleLogin}
        >
          <Ionicons name="logo-google" size={24} color="#4285F4" />
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginLeft: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default LoginScreen; 