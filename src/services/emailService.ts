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

export type EmailCategory = 'all' | 'primary' | 'social' | 'promotions' | 'updates' | 'sent';

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
  // If a signal is already provided in options, use it; otherwise create a timeout controller
  const hasExistingSignal = options.signal !== undefined;
  const controller = hasExistingSignal ? null : new AbortController();
  const timeoutId = hasExistingSignal ? null : setTimeout(() => controller!.abort(), timeout);

  console.log('🌐 fetchWithTimeout called with signal:', options.signal, 'hasExistingSignal:', hasExistingSignal);

  try {
    const response = await fetch(url, {
      ...options,
      signal: hasExistingSignal ? options.signal : controller!.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    console.log('✅ fetchWithTimeout completed successfully');
    return response;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('🛑 Request was aborted:', error.message);
      // Check if it was aborted by our wake word signal or by timeout
      if (hasExistingSignal) {
        throw error; // Re-throw the original AbortError for wake word cancellation
      } else {
        throw new Error('Request timed out');
      }
    }
    console.log('❌ fetchWithTimeout error:', error);
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
      
      // If it's an AbortError, don't retry - just throw it immediately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      
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
  async fetchThreads(token: string, pageToken?: string, category?: EmailCategory): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    try {
      const baseURL = await getBaseURL();
      const params = new URLSearchParams();
      if (pageToken) params.append('pageToken', pageToken);
      if (category && category !== 'all') params.append('category', category);
      
      const url = `${baseURL}/api/email/threads?${params.toString()}`;
        
      const response = await retryFetch(() =>
        fetchWithTimeout(url, {
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
      return {
        threads: data.threads || [],
        nextPageToken: data.nextPageToken,
        hasMore: data.hasMore || false
      };
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
      
      // If it has INBOX label but no specific category, it's primary
      if (thread.labels.includes('INBOX')) {
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

  async generateInboxSummary(token: string, cancellationFlag?: React.RefObject<boolean>): Promise<string> {
    let cancellationInterval: number | null = null;
    
    try {
      console.log('📡 generateInboxSummary called with cancellationFlag:', cancellationFlag?.current);
      const baseURL = await getBaseURL();
      
      // Check cancellation flag before making request
      if (cancellationFlag?.current) {
        console.log('🛑 Request cancelled before starting');
        throw new Error('Request cancelled');
      }
      
      // Create AbortController for this request
      const abortController = new AbortController();
      
      // Set up a watcher to abort the request if cancellation flag is set
      const checkCancellation = () => {
        if (cancellationFlag?.current) {
          console.log('🛑 Cancellation detected, aborting request');
          abortController.abort();
        }
      };
      
      // Check cancellation every 100ms
      cancellationInterval = setInterval(checkCancellation, 100);
      
      // Get current threads for summary
      const threads = await this.fetchThreads(token);
      
      const response = await fetchWithTimeout(`${baseURL}/api/ai/summarize-inbox`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threads }),
        signal: abortController.signal, // Add abort signal
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Clear the cancellation interval
      if (cancellationInterval) {
        clearInterval(cancellationInterval);
      }
      
      // Check cancellation flag before returning
      if (cancellationFlag?.current) {
        console.log('🛑 Summary generation was cancelled before returning');
        throw new Error('Request cancelled');
      }
      
      // Handle cache status
      if (data.cached) {
        console.log('✅ Returning cached summary');
        return `[CACHED] ${data.summary}`;
      } else {
        console.log('✅ Generated new summary');
        return data.summary || 'Unable to generate summary';
      }
    } catch (error) {
      // Clear the cancellation interval on error
      if (cancellationInterval) {
        clearInterval(cancellationInterval);
      }
      
      // Check if it's an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🛑 Request was aborted');
        throw new Error('Request cancelled');
      }
      
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

  // Find emails by sender name
  findThreadBySender: async (senderName: string, token: string) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/email/threads/by-sender?sender=${encodeURIComponent(senderName)}`;
      
      console.log(`🔍 Finding emails from: ${senderName}`);
      
      const response = await retryFetch(() =>
        fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(`No emails found from "${senderName}"`);
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Found email from ${senderName}: ${data.thread.subject}`);
      return data.thread;
    } catch (error) {
      console.error('Error finding thread by sender:', error);
      throw error;
    }
  },

  // Convert HTML email content to clean text
  convertHtmlToText: async (htmlContent: string, token: string, subject?: string) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/ai/html-to-text`;
      
      console.log(`🔄 Converting HTML to clean text`);
      
      const response = await retryFetch(() =>
        fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            htmlContent,
            subject,
          }),
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Converted HTML to clean text`);
      return data.text;
    } catch (error) {
      console.error('Error converting HTML to text:', error);
      // Fallback to basic HTML stripping if AI fails
      return htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  },

  // Generate a contextual reply
  generateReply: async (options: {
    threadId: string;
    instruction: string;
    token: string;
  }) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/email/generate-reply`;
      
      console.log(`✍️ Generating reply for thread: ${options.threadId}`);
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${options.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: options.threadId,
          instruction: options.instruction,
        }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Generated reply for ${data.replyTo}`);
      return data;
    } catch (error) {
      console.error('Error generating reply:', error);
      throw error;
    }
  },

  // Generate a contextual reply automatically
  generateContextualReply: async (threadId: string, token: string) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/email/generate-contextual-reply`;
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Generated contextual reply`);
      return data.reply;
    } catch (error) {
      console.error('Error generating contextual reply:', error);
      throw error;
    }
  },

  // Send a reply email
  sendReply: async (threadId: string, replyContent: string, token: string) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/email/send-reply`;
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          threadId, 
          replyContent 
        }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Reply sent successfully`);
      return data;
    } catch (error) {
      console.error('Error sending reply:', error);
      throw error;
    }
  },

  // Edit an existing reply with user feedback
  editReply: async (threadId: string, currentReply: string, editFeedback: string, token: string) => {
    try {
      const baseURL = await API_CONFIG.BASE_URL;
      const url = `${baseURL}/api/email/edit-reply`;
      
      console.log(`✏️ Editing reply for thread: ${threadId} with feedback: ${editFeedback}`);
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          threadId, 
          currentReply,
          editFeedback
        }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Reply edited successfully`);
      return data.reply;
    } catch (error) {
      console.error('Error editing reply:', error);
      throw error;
    }
  },


}; 