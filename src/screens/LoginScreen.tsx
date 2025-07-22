import React, { useContext, useState, useEffect } from 'react';
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
import { GoogleSignin } from '../config/googleSignIn';
import { AuthContext } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showMessage } from 'react-native-flash-message';
import { API_CONFIG, clearBackendURLCache } from '../config/api';

const { width, height } = Dimensions.get('window');

// Helper function to create a fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
};

// Helper function to retry failed requests
const retryFetch = async (
  fetchFn: () => Promise<Response>,
  maxRetries: number = 2,
  delay: number = 1000
): Promise<Response> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
  
  throw lastError!;
};

const LoginScreen = () => {
  const authContext = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  if (!authContext) {
    throw new Error('LoginScreen must be used within an AuthProvider');
  }

  const { setToken, setUser } = authContext;

  // Check backend connectivity on component mount
  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  const checkBackendConnectivity = async () => {
    try {
      console.log('Checking backend connectivity on startup...');
      
      // Get the dynamic base URL
      const baseURL = typeof API_CONFIG.BASE_URL === 'string' 
        ? API_CONFIG.BASE_URL 
        : await API_CONFIG.BASE_URL;
        
      console.log('Testing backend at:', baseURL);
      
      const healthCheck = await fetchWithTimeout(`${baseURL}/health`, {
        method: 'GET',
      }, 5000);
      
      if (healthCheck.ok) {
        console.log('Backend is connected');
        setBackendStatus('connected');
      } else {
        console.log('Backend health check failed with status:', healthCheck.status);
        setBackendStatus('disconnected');
      }
    } catch (error) {
      console.log('Backend connectivity check failed:', error);
      setBackendStatus('disconnected');
      
      showMessage({
        message: 'Backend server is not reachable. Please ensure the server is running.',
        type: 'warning',
        duration: 5000,
      });
    }
  };

  const GoogleLogin = async () => {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    console.log('Google user info:', userInfo);
    return userInfo;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      console.log('Starting Google login process...');
      
      // First, check if backend is reachable
      console.log('Checking backend connectivity...');
      try {
        const baseURL = typeof API_CONFIG.BASE_URL === 'string' 
          ? API_CONFIG.BASE_URL 
          : await API_CONFIG.BASE_URL;
          
        const healthCheck = await fetchWithTimeout(`${baseURL}/health`, {
          method: 'GET',
        }, 5000);
        
        if (!healthCheck.ok) {
          throw new Error('Backend health check failed');
        }
        
        console.log('Backend health check passed');
      } catch (healthError) {
        console.log('Backend health check failed:', healthError);
        throw new Error('Backend server is not reachable. Please check if the server is running.');
      }
      
      const response = await GoogleLogin(); // Google sign-in
      const idToken = response.data?.idToken; // Get idToken from response.data
      
      // Also get access token for Gmail API
      const tokens = await GoogleSignin.getTokens();
      const accessToken = tokens.accessToken;

      console.log('idToken:', idToken); // Log idToken to check if it's retrieved
      console.log('accessToken:', accessToken); // Log accessToken

      if (idToken) {
        console.log('Attempting to authenticate with backend...');
        
        // Get the dynamic base URL
        const baseURL = typeof API_CONFIG.BASE_URL === 'string' 
          ? API_CONFIG.BASE_URL 
          : await API_CONFIG.BASE_URL;
          
        console.log('Backend URL:', `${baseURL}/api/auth/google/mobile`);
        
        // Send idToken and accessToken to the backend with timeout and retry logic
        const backendResponse = await retryFetch(() =>
          fetchWithTimeout(`${baseURL}/api/auth/google/mobile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: idToken, // Sending the idToken like in the tutorial
            accessToken: accessToken, // Also send access token for Gmail API
          }),
          }, 30000) // 30 second timeout for authentication
        );

        console.log('Backend response status:', backendResponse.status);
        console.log('Backend response ok:', backendResponse.ok);

        if (!backendResponse.ok) {
          const errorText = await backendResponse.text();
          console.log('Backend error response:', errorText);
          throw new Error(`Backend authentication failed: ${backendResponse.status} - ${errorText}`);
        }

        const data = await backendResponse.json();
        console.log('Backend Response:', data);

        // Store token in AsyncStorage
        await AsyncStorage.setItem('authToken', data.token);

        // Update auth state
        setToken(data.token);
        setUser(data.user);

        showMessage({
          message: 'Google Sign-In successful!',
          type: 'success',
        });
      } else {
        throw new Error('No idToken received from Google');
      }
    } catch (error: any) {
      console.log('Login Error:', error);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      
      let errorMessage = 'Authentication failed. Please try again.';
      
      // Provide more specific error messages
      if (error.message.includes('Backend server is not reachable')) {
        errorMessage = 'Backend server is not running. Please start the server and try again.';
      } else if (error.message.includes('Request timed out') || error.message.includes('Network request timed out')) {
        errorMessage = 'Connection timeout. Please check your internet connection and try again.';
      } else if (error.message.includes('Network Error') || error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message.includes('Backend authentication failed')) {
        errorMessage = 'Server authentication failed. Please try again.';
      }
      
      showMessage({
        message: errorMessage,
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background Gradient */}
      <View style={styles.backgroundGradient}>
        <View style={styles.gradientOverlay} />
      </View>
      
      {/* Decorative Elements */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />
      <View style={styles.decorativeCircle3} />
      
      {/* Main Content */}
      <View style={styles.content}>
      {/* Logo Section */}
        <View style={styles.logoContainer}>
          <View style={styles.logoWrapper}>
        <Image
              source={require('../../assets/images/DixieLogo.png')}
          style={styles.logo}
          resizeMode="contain"
              onError={(error) => console.log('Logo loading error:', error)}
        />
          </View>
        <Text style={styles.title}>DixieAI</Text>
        <Text style={styles.subtitle}>Your AI Email Assistant</Text>
          <Text style={styles.description}>
            Transform your email experience with intelligent organization and insights
          </Text>
      </View>

        {/* Login Section */}
      <View style={styles.loginContainer}>
        <TouchableOpacity
          style={[
            styles.googleButton,
            (loading || backendStatus === 'disconnected') && styles.disabledButton
          ]}
          onPress={handleGoogleLogin}
          disabled={loading || backendStatus === 'disconnected'}
        >
            <View style={styles.googleIconContainer}>
              <Ionicons name="logo-google" size={20} color="#4285F4" />
            </View>
          <Text style={styles.googleButtonText}>
              {loading ? 'Signing in...' : 'Continue with Google'}
          </Text>
            {loading && <View style={styles.loadingSpinner} />}
        </TouchableOpacity>
        
        {/* Backend Status Indicator */}
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusIndicator,
            backendStatus === 'connected' && styles.statusConnected,
            backendStatus === 'disconnected' && styles.statusDisconnected,
            backendStatus === 'checking' && styles.statusChecking,
          ]} />
          <Text style={styles.statusText}>
            {backendStatus === 'checking' && 'Checking server...'}
            {backendStatus === 'connected' && 'Server connected'}
            {backendStatus === 'disconnected' && 'Server disconnected'}
          </Text>
          <TouchableOpacity 
            style={styles.refreshStatusButton} 
            onPress={() => {
              clearBackendURLCache();
              checkBackendConnectivity();
            }}
          >
              <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        
        {backendStatus === 'disconnected' && (
          <TouchableOpacity style={styles.retryButton} onPress={checkBackendConnectivity}>
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </TouchableOpacity>
        )}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our{' '}
          <Text style={styles.footerLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#667eea',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    top: height * 0.3,
    left: -50,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorativeCircle3: {
    position: 'absolute',
    bottom: height * 0.2,
    right: -75,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 160,
    height: 160,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  googleIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  loadingSpinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4285F4',
    borderTopColor: 'transparent',
    marginLeft: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#F44336',
  },
  statusChecking: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  refreshStatusButton: {
    marginLeft: 12,
    padding: 4,
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    paddingHorizontal: 32,
    width: '100%',
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
});

export default LoginScreen; 