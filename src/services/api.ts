import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_CONFIG } from '../config/api';
import { useAuthStore } from '../store/authStore';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = useAuthStore.getState().jwtToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = useAuthStore.getState().refreshToken;
            if (refreshToken) {
              const response = await this.client.post(API_CONFIG.ENDPOINTS.AUTH.REFRESH, {
                refreshToken,
              });

              const { accessToken } = response.data;
              useAuthStore.getState().updateTokens({
                accessToken,
                refreshToken,
              });
              useAuthStore.getState().setJwtToken(accessToken);

              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, logout user
            useAuthStore.getState().logout();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async googleAuth(code: string) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.AUTH.GOOGLE_CALLBACK, {
      code,
    });
    return response.data;
  }

  // Email endpoints
  async getThreads(query?: string) {
    const params = query ? { q: query } : {};
    const response = await this.client.get(API_CONFIG.ENDPOINTS.EMAIL.THREADS, { params });
    return response.data;
  }

  async getThread(threadId: string) {
    const response = await this.client.get(`${API_CONFIG.ENDPOINTS.EMAIL.THREAD}/${threadId}`);
    return response.data;
  }

  async sendEmail(data: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }) {
    const response = await this.client.post(API_CONFIG.ENDPOINTS.EMAIL.SEND, data);
    return response.data;
  }
}

export const apiService = new ApiService(); 