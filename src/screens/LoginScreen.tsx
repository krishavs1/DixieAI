import React, { useContext, useState } from 'react';
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
import { API_CONFIG } from '../config/api';

const { width } = Dimensions.get('window');

const LoginScreen = () => {
  const authContext = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  if (!authContext) {
    throw new Error('LoginScreen must be used within an AuthProvider');
  }

  const { setToken, setUser } = authContext;

  const GoogleLogin = async () => {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    console.log('Google user info:', userInfo);
    return userInfo;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const response = await GoogleLogin(); // Google sign-in
      const idToken = response.data?.idToken; // Get idToken from response.data
      
      // Also get access token for Gmail API
      const tokens = await GoogleSignin.getTokens();
      const accessToken = tokens.accessToken;

      console.log('idToken:', idToken); // Log idToken to check if it's retrieved
      console.log('accessToken:', accessToken); // Log accessToken

      if (idToken) {
        // Send idToken and accessToken to the backend (following YouTube tutorial approach)
        const backendResponse = await fetch(`${API_CONFIG.BASE_URL}/api/auth/google/mobile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: idToken, // Sending the idToken like in the tutorial
            accessToken: accessToken, // Also send access token for Gmail API
          }),
        });

        if (!backendResponse.ok) {
          throw new Error('Backend authentication failed');
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
      showMessage({
        message: 'Authentication failed. Please try again.',
        type: 'danger',
      });
    } finally {
      setLoading(false);
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
          disabled={loading}
        >
          <Ionicons name="logo-google" size={24} color="#4285F4" />
          <Text style={styles.googleButtonText}>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </Text>
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