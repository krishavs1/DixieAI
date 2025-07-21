import { API_CONFIG } from '../config/api';

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  date: string;
  read: boolean;
  labels?: string[]; // Array of label IDs
  starred?: boolean;
  important?: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
  read?: boolean;
  labels?: string[]; // Array of label IDs
  starred?: boolean;
  important?: boolean;
  needsReply?: boolean; // AI classification flag
  isImportant?: boolean; // AI classification flag for important updates
}

export interface EmailMessage {
  id: string;
  from: string;
  fromRaw?: string; // Original "From" field for email extraction
  subject: string;
  date: string;
  body: string;
  rawBody?: string;
  plainTextContent?: string;
  hasBlockedImages?: boolean;
  snippet: string;
  labels?: string[]; // Array of label IDs
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }>;
}

export interface DetailedEmailThread {
  id: string;
  messages: EmailMessage[];
  labels?: string[]; // Array of label IDs
}

export type EmailCategory = 'primary' | 'social' | 'promotions' | 'updates' | 'sent';

export interface EmailCategoryInfo {
  id: EmailCategory;
  name: string;
  color: string;
  icon: string;
  count: number;
}

export interface EmailFilter {
  labels?: string[];
  read?: boolean;
  starred?: boolean;
  important?: boolean;
  searchQuery?: string;
}

// Predefined system labels
export const SYSTEM_LABELS: EmailLabel[] = [
  { id: 'inbox', name: 'Inbox', color: '#4285F4' },
  { id: 'sent', name: 'Sent', color: '#34A853' },
  { id: 'drafts', name: 'Drafts', color: '#FBBC04' },
  { id: 'spam', name: 'Spam', color: '#EA4335' },
  { id: 'trash', name: 'Trash', color: '#9AA0A6' },
  { id: 'important', name: 'Important', color: '#FF6D01' },
  { id: 'starred', name: 'Starred', color: '#F9AB00' },
];

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
    attachments?: Array<{
      name: string;
      data: string; // base64 encoded data
      mimeType: string;
    }>;
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

  // Email categorization function
  categorizeEmail(thread: EmailThread): EmailCategory {
    // Use Gmail's category labels directly - they're already accurate!
    if (thread.labels) {
      // Sent emails should not appear in any category - they go to Sent tab
      // UNLESS they also have INBOX label (self-sent emails), then they go to Primary
      if (thread.labels.includes('SENT') && !thread.labels.includes('INBOX')) {
        return 'sent'; // Only pure sent emails (not self-sent)
      }
      
      if (thread.labels.includes('CATEGORY_SOCIAL')) {
        return 'social';
      }
      if (thread.labels.includes('CATEGORY_PROMOTIONS')) {
        return 'promotions';
      }
      if (thread.labels.includes('CATEGORY_UPDATES')) {
        return 'updates';
      }
      if (thread.labels.includes('CATEGORY_PERSONAL')) {
        return 'primary';
      }
    }
    
    // If Gmail hasn't categorized it, default to primary
    return 'primary';
  },

  // Sort threads by date (newest first)
  sortThreads(threads: EmailThread[]): EmailThread[] {
    return [...threads].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  // Filtering functions
  filterThreads(threads: EmailThread[], filter: EmailFilter): EmailThread[] {
    return threads.filter(thread => {
      // Filter by read status
      if (filter.read !== undefined && thread.read !== filter.read) {
        return false;
      }

      // Filter by starred
      if (filter.starred !== undefined && thread.starred !== filter.starred) {
        return false;
      }

      // Filter by important
      if (filter.important !== undefined && thread.important !== filter.important) {
        return false;
      }

      // Filter by labels
      if (filter.labels && filter.labels.length > 0) {
        if (!thread.labels || !filter.labels.some(label => thread.labels!.includes(label))) {
          return false;
        }
      }

      // Filter by search query
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        return (
          thread.subject.toLowerCase().includes(query) ||
          thread.from.toLowerCase().includes(query) ||
          thread.snippet.toLowerCase().includes(query)
        );
      }

      return true;
    });
  },

  // Label management functions
  async addLabelToThread(token: string, threadId: string, labelId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labelId }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error adding label to thread:', error);
      throw error;
    }
  },

  async removeLabelFromThread(token: string, threadId: string, labelId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/labels/${labelId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error removing label from thread:', error);
      throw error;
    }
  },

  async createLabel(token: string, label: Omit<EmailLabel, 'id'>): Promise<EmailLabel> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(label),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating label:', error);
      throw error;
    }
  },

  async fetchLabels(token: string): Promise<EmailLabel[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/labels`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return [...SYSTEM_LABELS, ...data.labels];
    } catch (error) {
      console.error('Error fetching labels:', error);
      // Return system labels as fallback
      return SYSTEM_LABELS;
    }
  },

  async updateThreadStatus(token: string, threadId: string, updates: {
    read?: boolean;
    starred?: boolean;
    important?: boolean;
  }): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating thread status:', error);
      throw error;
    }
  },

  async markAsRead(token: string, threadId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error marking thread as read:', error);
      throw error;
    }
  },

  async getAttachment(token: string, messageId: string, attachmentId: string): Promise<{ data: string; size: number }> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/messages/${messageId}/attachments/${attachmentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching attachment:', error);
      throw error;
    }
  },

  async generateInboxSummary(token: string): Promise<string> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/summary`, {
          method: 'POST',
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
      return data.summary || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating inbox summary:', error);
      throw error;
    }
  },

  async classifyEmails(token: string, threadIds: string[]): Promise<Array<{
    threadId: string;
    needsReply: boolean;
    isImportant: boolean;
    confidence: number;
  }>> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/classify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadIds }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.classifications || [];
    } catch (error) {
      console.error('Error classifying emails:', error);
      throw error;
    }
  },

  async fetchEmailContent(token: string, threadId: string): Promise<string> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}`, {
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
      const thread = data.thread;
      
      if (!thread || !thread.messages || thread.messages.length === 0) {
        throw new Error('No email content found');
      }

      // Get the latest message's body content
      const latestMessage = thread.messages[thread.messages.length - 1];
      return latestMessage.body || latestMessage.rawBody || 'No content available';
    } catch (error) {
      console.error('Error fetching email content:', error);
      throw error;
    }
  },
}; 