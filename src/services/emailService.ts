import { API_CONFIG } from '../config/api';

export interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  date: string;
  read: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  rawBody?: string;
  plainTextContent?: string;
  hasBlockedImages?: boolean;
  snippet: string;
}

export interface DetailedEmailThread {
  id: string;
  messages: EmailMessage[];
}

// Helper function to create a fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number = API_CONFIG.TIMEOUT) => {
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

// Helper function to get the base URL dynamically
const getBaseURL = async (): Promise<string> => {
  if (typeof API_CONFIG.BASE_URL === 'string') {
    return API_CONFIG.BASE_URL;
  }
  return await API_CONFIG.BASE_URL;
};

export const emailService = {
  async fetchThreads(token: string): Promise<EmailThread[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.threads || [];
    } catch (error) {
      console.error('Error fetching threads:', error);
      throw error;
    }
  },

  async searchThreads(token: string, query: string): Promise<EmailThread[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.threads || [];
    } catch (error) {
      console.error('Error searching threads:', error);
      throw error;
    }
  },

  async getThread(token: string, threadId: string): Promise<DetailedEmailThread | null> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT * 2) // Give more time for detailed thread fetching
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.thread || null;
    } catch (error) {
      console.error('Error fetching thread:', error);
      throw error;
    }
  },

  async sendEmail(token: string, emailData: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  },
}; 